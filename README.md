# context_secure

Local-first encrypted sync SDK + minimal CLI for single-user workspace sync over untrusted cloud storage.

## Status

- M0 specification documents are complete under `docs/m0/` and `docs/security/`.
- Implementation of core modules is intentionally deferred until M0 review sign-off.

## Monorepo layout

- `packages/types` shared schema types.
- `packages/crypto-ts` TS boundary for Rust FFI only.
- `packages/store-local` local persistence boundary.
- `packages/store-remote` provider-agnostic remote interface.
- `packages/adapters-s3` AWS S3 adapter boundary.
- `packages/sync-engine` sync orchestration boundary.
- `packages/cli` reference command surface.
- `crypto/ctxsync_crypto` standalone Rust crypto core.

## Quickstart

```bash
npm install
npm run typecheck
```
