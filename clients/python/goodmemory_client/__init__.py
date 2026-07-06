"""Official Python client for the GoodMemory HTTP bridge (stdlib only)."""

from .client import (
    GoodMemoryBridgeError,
    GoodMemoryClient,
    GoodMemoryClientError,
    GoodMemoryConnectionError,
    RecallContextResult,
    RecallRouting,
    Scope,
)

# Versioned independently of the goodmemory npm package: this tracks the wire
# contract (phase-39.http-memory.v1), not the server release.
__version__ = "0.1.0"

__all__ = [
    "GoodMemoryBridgeError",
    "GoodMemoryClient",
    "GoodMemoryClientError",
    "GoodMemoryConnectionError",
    "RecallContextResult",
    "RecallRouting",
    "Scope",
    "__version__",
]
