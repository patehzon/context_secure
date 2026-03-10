# Architecture Boundaries

Dependency rules:

- `sync-engine` MAY depend on `types`, `crypto-ts`, `store-local`, `store-remote`.
- `adapters-s3` MAY depend on `store-remote`, `types`.
- `runtime-llama-cpp` MAY depend on `types` only and MUST remain local-runtime-only.
- `runtime-llama-cpp` MAY call a local `llama-server` over the OpenAI-compatible HTTP surface (`/v1/models`, `/v1/chat/completions`) and MUST enforce strict parsing and response size limits.
- `runtime-llama-cpp` MAY also invoke a local `llama-cli`-style binary for `source="binary"` bindings using explicit model path, prompt, timeout, and output-size controls.
- `crypto-ts` MUST NOT implement primitives, only call Rust crypto crate via FFI.
- `cli` MAY depend on `types` and local runtime adapters for non-sync local inference commands.
- `cli` currently supports `agent run` by loading unsynced `lrc/1` config from `store-local` and dispatching to the local runtime adapter.
- `store-local` owns unsynced device-local runtime config (`lrc/1`) such as loopback endpoints, binary paths, and GGUF paths.
- `store-local` currently persists `lrc/1` as a local JSON file only; broader local persistence remains future work.
- Rust crate (`crypto/ctxsync_crypto`) MUST NOT contain business/storage/network logic.
