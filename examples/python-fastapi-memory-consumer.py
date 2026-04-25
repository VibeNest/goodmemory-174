#!/usr/bin/env python3
"""Minimal Python backend smoke for the Phase 39 GoodMemory HTTP bridge.

The same calls can sit behind FastAPI route handlers. The browser or mobile
client should call the product backend, not the GoodMemory bridge directly.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any


BRIDGE_URL = os.environ.get("GOODMEMORY_BRIDGE_URL", "http://127.0.0.1:8739")
BRIDGE_TOKEN = os.environ.get("GOODMEMORY_BRIDGE_TOKEN")
HEADERS = {
    "content-type": "application/json",
    "x-goodmemory-user-id": "python-user",
    "x-goodmemory-workspace-id": "life-workspace",
    "x-goodmemory-operations": "recall-context,remember,feedback,export,forget,revise",
}
if BRIDGE_TOKEN:
    HEADERS["authorization"] = f"Bearer {BRIDGE_TOKEN}"
SCOPE = {
    "userId": "python-user",
    "workspaceId": "life-workspace",
    "agentId": "life-coach",
    "sessionId": "python-session-1",
}


def post(path: str, body: dict[str, Any]) -> dict[str, Any]:
    request = urllib.request.Request(
        f"{BRIDGE_URL}{path}",
        data=json.dumps(body).encode("utf-8"),
        headers=HEADERS,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8")
        raise RuntimeError(f"{path} failed with {error.code}: {detail}") from error

    if payload.get("ok") is not True:
        raise RuntimeError(f"{path} failed: {payload}")

    return payload


def main() -> int:
    post(
        "/memory/remember",
        {
            "scope": SCOPE,
            "messages": [
                {
                    "role": "user",
                    "content": "My top priority this quarter is rebuilding my sleep routine.",
                }
            ],
            "mode": "sync",
            "idempotencyKey": "python-turn-1",
        },
    )
    recall = post(
        "/memory/recall-context",
        {
            "scope": SCOPE,
            "query": "What is my quarterly priority?",
        },
    )
    memory_id = recall["items"][0]["memoryId"]
    feedback = post(
        "/memory/feedback",
        {
            "scope": SCOPE,
            "signal": "Use checklist summaries after coaching sessions.",
            "idempotencyKey": "python-feedback-1",
            "source": {
                "system": "fastapi-reference",
                "eventId": "coach-review-1",
            },
        },
    )
    revised = post(
        "/memory/revise",
        {
            "scope": SCOPE,
            "target": {"memoryId": memory_id},
            "revision": {
                "content": "My top priority this quarter is rebuilding my sleep routine with a consistent wind-down.",
            },
            "reason": "user_correction",
            "evidence": {
                "source": "user_message",
                "message": "Actually include the wind-down.",
            },
            "idempotencyKey": "python-revise-1",
        },
    )
    post(
        "/memory/export",
        {
            "scope": SCOPE,
        },
    )

    print(
        json.dumps(
            {
                "feedbackAccepted": feedback["result"]["accepted"],
                "hasContext": recall["hasContext"],
                "itemCount": recall["itemCount"],
                "revised": revised["result"]["accepted"],
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
