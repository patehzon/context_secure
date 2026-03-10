# Next Steps

Recently completed:

1. Added local `llama.cpp` HTTP transport scaffold.
2. Added `lrc/1` JSON-file persistence in `store-local` and kept it unsynced.
3. Added a CLI entrypoint that loads local runtime config and invokes `agent run`.
4. Added direct `source="binary"` support for `llama.cpp` process execution.
5. Added an opt-in live smoke test for a running local `llama-server`.

Remaining:

1. Finish the Rust crypto implementation and replace `TODO_OFFLINE_*` vector placeholders.
2. Implement concrete workspace/chat/message object types and serialization helpers in `packages/types`.
3. Build sync-engine around real encrypted object persistence instead of scaffolds.
