"""End-to-end smoke for goodmemory_client against a live bridge.

Env-driven (mirrors examples/python-fastapi-memory-consumer.py):
    GOODMEMORY_BRIDGE_URL    required, e.g. http://127.0.0.1:8739
    GOODMEMORY_BRIDGE_TOKEN  optional bearer token

Exercises health -> sync remember -> async remember -> recall -> feedback ->
revise -> export -> forget and prints one sorted-JSON summary line.
Not test_-prefixed so unittest discovery skips it.
"""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from goodmemory_client import GoodMemoryClient, Scope  # noqa: E402


def main() -> int:
    bridge_url = os.environ.get("GOODMEMORY_BRIDGE_URL")
    if not bridge_url:
        raise SystemExit("GOODMEMORY_BRIDGE_URL is required")

    client = GoodMemoryClient(
        bridge_url,
        token=os.environ.get("GOODMEMORY_BRIDGE_TOKEN"),
        scope=Scope(
            user_id="python-client-user",
            workspace_id="python-client-workspace",
            agent_id="life-coach",
            session_id="python-client-session",
        ),
    )

    health = client.wait_until_ready()

    remembered = client.remember(
        [
            {
                "role": "user",
                "content": "Remember that my top priority this quarter is rebuilding my sleep routine.",
            }
        ],
        idempotency_key="smoke-remember-sync",
    )
    queued = client.remember(
        [
            {
                "role": "user",
                "content": "Remember that the team retro moved to Thursdays.",
            }
        ],
        mode="async",
        idempotency_key="smoke-remember-async",
    )

    recall = client.recall_context(
        "What is my top priority this quarter?",
        output="system_prompt_fragment",
    )

    feedback = client.feedback(
        "Keep coaching check-ins short and practical.",
        idempotency_key="smoke-feedback",
    )

    export = client.export()
    facts = export.get("exported", {}).get("durable", {}).get("facts", [])
    memory_id = facts[0]["id"] if facts else None

    revised = None
    forgot = None
    if memory_id:
        revised = client.revise(
            memory_id=memory_id,
            content="My top priority this quarter is rebuilding my sleep routine (revised).",
            reason="smoke revision",
            idempotency_key="smoke-revise",
        )
        new_memory_id = revised.get("result", {}).get("newMemoryId")
        forgot = client.forget(new_memory_id or memory_id)

    summary = {
        "asyncHandledBy": queued.get("idempotency", {}).get("handledBy"),
        "contractVersion": recall.contract_version,
        "feedbackAccepted": bool(feedback.get("result", {}).get("accepted")),
        "forgot": bool(forgot and forgot.get("result", {}).get("forgotten")),
        "hasContext": recall.has_context,
        "healthOk": health.get("ok") is True,
        "itemCount": recall.item_count,
        "rememberAccepted": remembered.get("result", {}).get("accepted", 0),
        "requestedStrategy": recall.routing.requested_strategy,
        "revised": bool(revised and revised.get("result", {}).get("accepted")),
    }
    print(json.dumps(summary, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
