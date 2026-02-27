# Architecture Boundaries

Dependency rules:

- `sync-engine` MAY depend on `types`, `crypto-ts`, `store-local`, `store-remote`.
- `adapters-s3` MAY depend on `store-remote`, `types`.
- `crypto-ts` MUST NOT implement primitives, only call Rust crypto crate via FFI.
- Rust crate (`crypto/ctxsync_crypto`) MUST NOT contain business/storage/network logic.
