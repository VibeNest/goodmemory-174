# GoodMemory Reference Chat Product

This Phase 45 example is a small product-shaped chat backend that treats
GoodMemory as the memory layer. It uses public package exports and the
authenticated `goodmemory/http` bridge; it is not a new GoodMemory API surface.

## Start

Run the packaged bridge:

```bash
goodmemory-http-bridge --host 127.0.0.1 --port 8739 --profile life-coach --token "$GOODMEMORY_BRIDGE_TOKEN"
```

Run the FastAPI backend:

```bash
cd examples/reference-chat-product
python -m venv .venv
. .venv/bin/activate
pip install fastapi uvicorn
GOODMEMORY_BRIDGE_URL=http://127.0.0.1:8739 GOODMEMORY_BRIDGE_TOKEN="$GOODMEMORY_BRIDGE_TOKEN" uvicorn fastapi_backend:app --reload
```

The FastAPI backend stores product-level idempotency reservations in SQLite.
Set `GOODMEMORY_REFERENCE_PRODUCT_STATE_PATH` to choose the file path; by
default it writes `.goodmemory/reference-product.sqlite` under the process
working directory.

Run the Bun smoke path from the repository:

```bash
bun run example:reference-product
```

Run the Phase 45 adoption report and quality gate:

```bash
bun run eval:phase-45
bun run gate:phase-45
```

## Boundary

The product backend may call authenticated bridge mutation endpoints for
explicit product actions: remember, feedback, export, forget, and revise. The
runtime viewer is deprecated and now delegates to the local-only, token-gated,
scope-bound read-only Inspector. Product mutations remain explicit backend
operations in this historical reference product.

The accepted Phase 45 path must keep these boundaries:

- no root `goodmemory` API widening
- no mutation routes through the deprecated runtime viewer
- no CORS-enabled remote viewer API
- no raw transcript archive
- no hosted dashboard, account system, cloud sync, or analytics claim
