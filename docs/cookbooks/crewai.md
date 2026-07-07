# Cookbook: CrewAI (Python)

Give a CrewAI crew durable memory through the GoodMemory HTTP bridge and the
official Python client.

Run the bridge (Docker one-liner; see the
[bridge guide](../GoodMemory-Python-HTTP-Integration-Bridge.md)) — or skip it and
point at the hosted instance at `https://goodmemory.vibenest.net` (needs a
bearer token):

```bash
GOODMEMORY_HTTP_BRIDGE_TOKEN=your-token docker compose up -d
pip install goodmemory-client crewai
```

Expose memory as CrewAI tools:

```python
from crewai import Agent, Crew, Task
from crewai.tools import tool
from goodmemory_client import GoodMemoryClient, Scope

client = GoodMemoryClient(
    # Local bridge — or the hosted instance "https://goodmemory.vibenest.net"
    "http://127.0.0.1:8739",
    token="your-token",
    scope=Scope(user_id="u-1", workspace_id="workspace-a"),
)

@tool("Recall memory")
def recall_memory(question: str) -> str:
    """Look up durable user/project memory before answering."""
    return client.recall_context(question).context_text

@tool("Remember fact")
def remember_fact(note: str) -> str:
    """Persist a memory-worthy fact for future sessions."""
    result = client.remember([{"role": "user", "content": note}])
    return f"accepted={result['result']['accepted']}"

researcher = Agent(
    role="assistant",
    goal="Answer using what is already known about the user and project",
    backstory="You consult GoodMemory before answering and persist durable facts.",
    tools=[recall_memory, remember_fact],
)

crew = Crew(agents=[researcher], tasks=[Task(
    description="What is the user's top priority this quarter?",
    agent=researcher,
    expected_output="A direct answer grounded in recalled memory.",
)])
```

Notes:

- One bridge serves every crew member; scope isolation comes from the `Scope`
  each client instance carries (per-user or per-workspace).
- Writes are governed: GoodMemory's classification/dedupe may reject or merge
  (`accepted=0` is a signal, not an error).
- The same database also serves the MCP server and installed hosts — memory
  written by the crew is auditable via `client.export()`.
