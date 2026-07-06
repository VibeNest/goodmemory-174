# Cookbook: OpenAI Agents SDK (Python)

Give an OpenAI Agents SDK agent durable memory through the GoodMemory HTTP
bridge and the official Python client.

Run the bridge (Docker one-liner; see the
[bridge guide](../GoodMemory-Python-HTTP-Integration-Bridge.md)):

```bash
GOODMEMORY_HTTP_BRIDGE_TOKEN=your-token docker compose up -d
pip install goodmemory-client openai-agents
```

Wire memory as two function tools plus a pre-run recall:

```python
from agents import Agent, Runner, function_tool
from goodmemory_client import GoodMemoryClient, Scope

client = GoodMemoryClient(
    "http://127.0.0.1:8739",
    token="your-token",
    scope=Scope(user_id="u-1", workspace_id="workspace-a"),
)

@function_tool
def remember(note: str) -> str:
    """Persist a memory-worthy fact about the user or project."""
    result = client.remember([{"role": "user", "content": note}])
    return f"accepted={result['result']['accepted']}"

@function_tool
def recall_memory(question: str) -> str:
    """Look up what is already known before answering."""
    return client.recall_context(question).context_text

agent = Agent(
    name="assistant",
    instructions="Use recall_memory before answering questions about the user; use remember for durable facts.",
    tools=[remember, recall_memory],
)

# Or inject recall once per run instead of as a tool:
context = client.recall_context("What should the assistant know?").context_text
result = Runner.run_sync(agent, f"{context}\n\nUser: What is my top priority?")
```

Notes:

- The write goes through GoodMemory's governed remember pipeline — low-signal
  notes are rejected (`accepted=0`), which keeps tool-driven writes honest.
- `client.recall_context(...).routing` shows whether hybrid retrieval silently
  downgraded (no embedding provider configured on the bridge).
- Corrections: `client.feedback(...)`, `client.revise(...)`; audit/deletion:
  `client.export()`, `client.forget(...)`.
