# M0 Data Model Specification

Status: Draft v1 (normative)
Scope: canonical object schemas, serialization rules, and versioning contract.

## 1. Versioning

- `model_version` is required on every serialized object.
- Initial version is `"dm/1"`.
- Producers MUST write `dm/1` for MVP.
- Consumers MUST reject unknown major (`dm/2+`) and MAY accept known minor additions via unknown-field ignore.

## 2. Canonical serialization rules

- Transport encoding: UTF-8 JSON.
- Timestamps: RFC 3339 UTC with millisecond precision.
- IDs: UUIDv7 lowercase canonical string.
- Field names: `snake_case`.
- Unknown fields: ignored if `model_version` major is known.
- Required fields MUST be present and non-null.

## 3. Base object envelope (decrypted payload)

All object payloads MUST include:

- `model_version: string` (`dm/1`)
- `workspace_id: string`
- `object_id: string`
- `object_type: "workspace"|"chat"|"message"|"context_snapshot"|"agent_config"|"template"|"attachment"|"tombstone"`
- `created_at: string`
- `updated_at: string`
- `device_id: string`
- `lww_clock: { wall_time_ms: number, logical_counter: number, device_id: string }`
- `content_hash: string` (hex SHA-256 of canonical JSON content section only)

## 4. Object types and required content fields

### `workspace`
- `content`: `{ name: string, kdf_profile_id: string, sync_mode_default: "manual"|"realtime"|"hybrid" }`

### `chat`
- `content`: `{ title: string, offline_only: boolean, archived: boolean }`

### `message`
- `content`: `{ chat_id: string, role: "system"|"user"|"assistant"|"tool", text: string, token_count_estimate?: number }`

### `context_snapshot`
- `content`: `{ chat_id: string, summary: string, referenced_message_ids: string[] }`

### `agent_config`
- `content`: `{ name: string, runtime: string, model_ref: string, tool_config_ref?: string }`

### `template`
- `content`: `{ name: string, body: string, tags: string[] }`

### `attachment` (MVP text-first)
- `content`: `{ parent_object_id: string, media_type: string, text_body: string, encoding: "utf-8" }`
- Future binary design reserved via optional `chunk_manifest_id`.

### `tombstone`
- `content`: `{ target_object_id: string, target_object_type: string, reason: "user_delete"|"sync_conflict"|"purge", deleted_at: string }`

## 5. LWW semantics

- Primary order: `(lww_clock.wall_time_ms, lww_clock.logical_counter, lww_clock.device_id, object_id)`.
- Greater tuple wins.
- Equal tuple with differing `content_hash` is invalid producer behavior and MUST emit conflict artifact.

## 6. Compatibility rules

- Additive optional fields are allowed in `dm/1.x`.
- Required field additions require new major.
- Object type enum expansions require minor + explicit consumer fallback.

## 7. Concrete examples

### Example A: chat
```json
{
  "model_version": "dm/1",
  "workspace_id": "018f3f8e-8f91-7f13-9a03-a0cb2af5e6e1",
  "object_id": "018f3f8f-d8b1-7de5-8d39-e17ef4872001",
  "object_type": "chat",
  "created_at": "2026-01-01T10:00:00.000Z",
  "updated_at": "2026-01-01T10:00:00.000Z",
  "device_id": "device-laptop-a",
  "lww_clock": { "wall_time_ms": 1767261600000, "logical_counter": 0, "device_id": "device-laptop-a" },
  "content_hash": "b8d1304f54e6ff6c20f97b48ce89f19d5f8b656af29ebf6cbccca861f45b9698",
  "content": { "title": "Research", "offline_only": false, "archived": false }
}
```

### Example B: message
```json
{
  "model_version": "dm/1",
  "workspace_id": "018f3f8e-8f91-7f13-9a03-a0cb2af5e6e1",
  "object_id": "018f3f90-1898-78a8-bce0-b0574a24c5e0",
  "object_type": "message",
  "created_at": "2026-01-01T10:01:00.000Z",
  "updated_at": "2026-01-01T10:01:00.000Z",
  "device_id": "device-laptop-a",
  "lww_clock": { "wall_time_ms": 1767261660000, "logical_counter": 0, "device_id": "device-laptop-a" },
  "content_hash": "6c88abf6dffba5e8f72ce7eb8f908dd9faafe0500f408714f5f93275b616a206",
  "content": { "chat_id": "018f3f8f-d8b1-7de5-8d39-e17ef4872001", "role": "user", "text": "hello" }
}
```

### Example C: tombstone
```json
{
  "model_version": "dm/1",
  "workspace_id": "018f3f8e-8f91-7f13-9a03-a0cb2af5e6e1",
  "object_id": "018f3f95-cc28-7c19-ac7b-88f31728b7e9",
  "object_type": "tombstone",
  "created_at": "2026-01-01T11:00:00.000Z",
  "updated_at": "2026-01-01T11:00:00.000Z",
  "device_id": "device-laptop-b",
  "lww_clock": { "wall_time_ms": 1767265200000, "logical_counter": 1, "device_id": "device-laptop-b" },
  "content_hash": "dc82a5f4c7ffb7f53cbe06f84c98385bdb7ed7d6e7f351496731a0df72af2d22",
  "content": { "target_object_id": "018f3f90-1898-78a8-bce0-b0574a24c5e0", "target_object_type": "message", "reason": "user_delete", "deleted_at": "2026-01-01T11:00:00.000Z" }
}
```
