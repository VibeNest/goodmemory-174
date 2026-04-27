#!/usr/bin/env python3
"""Reference product backend for Phase 45.

This FastAPI app is intentionally thin: it owns product routes and calls the
authenticated GoodMemory HTTP bridge as a memory layer.
"""

from __future__ import annotations

import json
import os
import hashlib
import sqlite3
import time
import urllib.error
import urllib.request
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel


GOODMEMORY_BRIDGE_URL = os.environ.get(
    "GOODMEMORY_BRIDGE_URL", "http://127.0.0.1:8739"
)
GOODMEMORY_BRIDGE_TOKEN = os.environ.get("GOODMEMORY_BRIDGE_TOKEN", "")
GOODMEMORY_REFERENCE_PRODUCT_STATE_PATH = os.environ.get(
    "GOODMEMORY_REFERENCE_PRODUCT_STATE_PATH",
    os.path.join(os.getcwd(), ".goodmemory", "reference-product.sqlite"),
)
SCOPE = {
    "tenantId": "phase45-reference-tenant",
    "userId": "phase45-reference-user",
    "workspaceId": "phase45-reference-workspace",
    "agentId": "life-coach",
    "sessionId": "phase45-reference-fastapi",
}
HEADERS = {
    "content-type": "application/json",
    "x-goodmemory-tenant-id": SCOPE["tenantId"],
    "x-goodmemory-user-id": SCOPE["userId"],
    "x-goodmemory-workspace-id": SCOPE["workspaceId"],
    "x-goodmemory-operations": "recall-context,remember,feedback,export,forget,revise",
}
if GOODMEMORY_BRIDGE_TOKEN:
    HEADERS["authorization"] = f"Bearer {GOODMEMORY_BRIDGE_TOKEN}"


class ChatRequest(BaseModel):
    message: str
    remember: bool = False
    turn_id: str


class FeedbackRequest(BaseModel):
    event_id: str
    signal: str


class ForgetRequest(BaseModel):
    memory_id: str


class ReviseRequest(BaseModel):
    memory_id: str
    content: str


app = FastAPI(title="GoodMemory Phase 45 Reference Product")


def stable_key(prefix: str, value: str) -> str:
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]
    return f"{prefix}-{digest}"


def open_state_db() -> sqlite3.Connection:
    state_dir = os.path.dirname(GOODMEMORY_REFERENCE_PRODUCT_STATE_PATH)
    if state_dir:
        os.makedirs(state_dir, exist_ok=True)
    connection = sqlite3.connect(
        GOODMEMORY_REFERENCE_PRODUCT_STATE_PATH,
        isolation_level=None,
        timeout=8,
    )
    connection.execute("PRAGMA busy_timeout = 8000")
    connection.execute("PRAGMA journal_mode = WAL")
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS product_idempotency (
            operation TEXT NOT NULL,
            key TEXT NOT NULL,
            digest TEXT NOT NULL,
            state TEXT NOT NULL,
            error TEXT,
            response_json TEXT,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (operation, key)
        )
        """
    )
    columns = {
        row[1]
        for row in connection.execute("PRAGMA table_info(product_idempotency)")
    }
    if "response_json" not in columns:
        connection.execute(
            "ALTER TABLE product_idempotency ADD COLUMN response_json TEXT"
        )
    return connection


def reserve_operation(
    operation: str,
    key: str,
    digest: str,
    conflict_detail: str,
    failed_detail: str,
) -> bool:
    deadline = time.monotonic() + 8
    while True:
        connection = open_state_db()
        committed = False
        try:
            connection.execute("BEGIN IMMEDIATE")
            existing = connection.execute(
                """
                SELECT digest, state, error
                FROM product_idempotency
                WHERE operation = ? AND key = ?
                """,
                (operation, key),
            ).fetchone()
            if existing is not None:
                existing_digest, state, error = existing
                if existing_digest != digest:
                    raise HTTPException(status_code=409, detail=conflict_detail)
                if state == "pending":
                    connection.execute("COMMIT")
                    committed = True
                    if time.monotonic() >= deadline:
                        raise HTTPException(
                            status_code=409,
                            detail=f"{operation} idempotency key is still pending.",
                        )
                    time.sleep(0.05)
                    continue
                if state == "failed":
                    raise HTTPException(
                        status_code=502,
                        detail=error or failed_detail,
                    )
                connection.execute("COMMIT")
                committed = True
                return False

            connection.execute(
                """
                INSERT INTO product_idempotency (
                    operation,
                    key,
                    digest,
                    state,
                    error
                )
                VALUES (?, ?, ?, 'pending', NULL)
                """,
                (operation, key, digest),
            )
            connection.execute("COMMIT")
            committed = True
            return True
        finally:
            if not committed:
                try:
                    connection.execute("ROLLBACK")
                except sqlite3.Error:
                    pass
            connection.close()


def complete_operation(
    operation: str,
    key: str,
    digest: str,
    response: dict[str, Any] | None = None,
) -> None:
    connection = open_state_db()
    try:
        response_json = (
            json.dumps(response, sort_keys=True) if response is not None else None
        )
        connection.execute(
            """
            UPDATE product_idempotency
            SET state = 'completed',
                error = NULL,
                response_json = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE operation = ? AND key = ? AND digest = ?
            """,
            (response_json, operation, key, digest),
        )
    finally:
        connection.close()


def fail_operation(
    operation: str,
    key: str,
    digest: str,
    error: Exception,
) -> None:
    connection = open_state_db()
    try:
        connection.execute(
            """
            UPDATE product_idempotency
            SET state = 'failed',
                error = ?,
                response_json = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE operation = ? AND key = ? AND digest = ?
            """,
            (str(error), operation, key, digest),
        )
    finally:
        connection.close()


def reserve_chat_turn(
    key: str,
    digest: str,
) -> tuple[bool, dict[str, Any] | None]:
    deadline = time.monotonic() + 8
    while True:
        connection = open_state_db()
        committed = False
        try:
            connection.execute("BEGIN IMMEDIATE")
            existing = connection.execute(
                """
                SELECT digest, state, error, response_json
                FROM product_idempotency
                WHERE operation = 'chat' AND key = ?
                """,
                (key,),
            ).fetchone()
            if existing is not None:
                existing_digest, state, error, response_json = existing
                if existing_digest != digest:
                    raise HTTPException(
                        status_code=409,
                        detail="Reference product chat turn_id conflict.",
                    )
                if state == "pending":
                    connection.execute("COMMIT")
                    committed = True
                    if time.monotonic() >= deadline:
                        raise HTTPException(
                            status_code=409,
                            detail="chat idempotency key is still pending.",
                        )
                    time.sleep(0.05)
                    continue
                if state == "failed":
                    raise HTTPException(
                        status_code=502,
                        detail=error or "Reference product chat turn failed.",
                    )
                if response_json is None:
                    raise HTTPException(
                        status_code=502,
                        detail="Reference product chat turn has no cached response.",
                    )
                connection.execute("COMMIT")
                committed = True
                return False, json.loads(response_json)

            connection.execute(
                """
                INSERT INTO product_idempotency (
                    operation,
                    key,
                    digest,
                    state,
                    error,
                    response_json
                )
                VALUES ('chat', ?, ?, 'pending', NULL, NULL)
                """,
                (key, digest),
            )
            connection.execute("COMMIT")
            committed = True
            return True, None
        finally:
            if not committed:
                try:
                    connection.execute("ROLLBACK")
                except sqlite3.Error:
                    pass
            connection.close()


def complete_chat_turn(
    key: str,
    digest: str,
    response: dict[str, Any],
) -> None:
    complete_operation(
        "chat",
        key,
        digest,
        response,
    )


def fail_chat_turn(key: str, digest: str, error: Exception) -> None:
    fail_operation(
        "chat",
        key,
        digest,
        error,
    )


def reserve_remember_write(key: str, digest: str) -> bool:
    return reserve_operation(
        "remember",
        key,
        digest,
        "Reference product remember idempotency key conflict.",
        "Reference product remember write failed.",
    )


def complete_remember_reservation(key: str, digest: str) -> None:
    complete_operation(
        "remember",
        key,
        digest,
    )


def fail_remember_reservation(key: str, digest: str, error: Exception) -> None:
    fail_operation(
        "remember",
        key,
        digest,
        error,
    )


def summarize_export(payload: dict[str, Any]) -> dict[str, Any]:
    exported = payload.get("exported", {})
    durable = exported.get("durable", {}) if isinstance(exported, dict) else {}
    runtime = exported.get("runtime", {}) if isinstance(exported, dict) else {}
    return {
        "factCount": len(durable.get("facts", [])),
        "feedbackCount": len(durable.get("feedback", [])),
        "preferenceCount": len(durable.get("preferences", [])),
        "profileCount": 1 if durable.get("profile") else 0,
        "rawTranscriptPersisted": False,
        "referenceCount": len(durable.get("references", [])),
        "runtimeSessionInspectable": bool(runtime.get("journal")),
    }


def post_bridge(path: str, body: dict[str, Any]) -> dict[str, Any]:
    payload = dict(body)
    payload["scope"] = SCOPE
    request = urllib.request.Request(
        f"{GOODMEMORY_BRIDGE_URL}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers=HEADERS,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            parsed = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        raise HTTPException(
            status_code=error.code,
            detail=error.read().decode("utf-8"),
        ) from error
    if parsed.get("ok") is not True:
        raise HTTPException(status_code=502, detail=parsed)
    return parsed


@app.post("/chat")
def chat(request: ChatRequest) -> dict[str, Any]:
    idempotency_key = f"fastapi-chat-{request.turn_id}"
    payload_digest = stable_key(
        "fastapi-chat-payload",
        json.dumps(
            {
                "message": request.message,
                "remember": request.remember,
            },
            sort_keys=True,
        ),
    )
    reserved, cached_response = reserve_chat_turn(idempotency_key, payload_digest)
    if not reserved and cached_response is not None:
        return cached_response

    remember_reserved = False
    try:
        recall = post_bridge("/memory/recall-context", {"query": request.message})
        if request.remember:
            remember_reserved = reserve_remember_write(idempotency_key, payload_digest)
            if remember_reserved:
                post_bridge(
                    "/memory/remember",
                    {
                        "idempotencyKey": idempotency_key,
                        "messages": [{"role": "user", "content": request.message}],
                        "mode": "sync",
                    },
                )
                complete_remember_reservation(idempotency_key, payload_digest)
        response = {
            "contextIncluded": recall["hasContext"],
            "memoryItems": recall["itemCount"],
            "text": "Noted. I will use the remembered context when it is present.",
        }
        complete_chat_turn(idempotency_key, payload_digest, response)
        return response
    except Exception as error:
        if request.remember and remember_reserved:
            fail_remember_reservation(idempotency_key, payload_digest, error)
        fail_chat_turn(idempotency_key, payload_digest, error)
        raise


@app.post("/feedback")
def feedback(request: FeedbackRequest) -> dict[str, Any]:
    idempotency_key = f"fastapi-feedback-{request.event_id}"
    payload_digest = stable_key("fastapi-feedback-payload", request.signal)
    if not reserve_operation(
        "feedback",
        idempotency_key,
        payload_digest,
        "Reference product feedback idempotency key conflict.",
        "Reference product feedback write failed.",
    ):
        return {"accepted": True, "deduped": True}
    try:
        result = post_bridge(
            "/memory/feedback",
            {
                "idempotencyKey": idempotency_key,
                "signal": request.signal,
                "source": {"system": "phase45-reference-product"},
            },
        )
        complete_operation(
            "feedback",
            idempotency_key,
            payload_digest,
        )
        return result
    except Exception as error:
        fail_operation(
            "feedback",
            idempotency_key,
            payload_digest,
            error,
        )
        raise


@app.post("/memories/export")
def export_memories() -> dict[str, Any]:
    return summarize_export(post_bridge("/memory/export", {"includeRuntime": True}))


@app.post("/memories/forget")
def forget(request: ForgetRequest) -> dict[str, Any]:
    return post_bridge("/memory/forget", {"memoryId": request.memory_id})


@app.post("/memories/revise")
def revise(request: ReviseRequest) -> dict[str, Any]:
    return post_bridge(
        "/memory/revise",
        {
            "evidence": {
                "message": "User corrected this reference product memory.",
                "source": "user_message",
            },
            "idempotencyKey": stable_key(
                "fastapi-revise", f"{request.memory_id}:{request.content}"
            ),
            "reason": "user_correction",
            "revision": {"content": request.content},
            "target": {"memoryId": request.memory_id},
        },
    )
