# M0 Sync Protocol Specification

Status: Draft v1 (normative)
Scope: remote layout, checkpoints, pull/push algorithm, LWW, snapshots, tombstones, purge.

## 1. Versioning

- Protocol version field: `sync_version`.
- Initial: `"sp/1"`.
- All checkpoint and manifest objects MUST include `sync_version`.

## 2. Remote S3 layout (`sp/1`)

Given bucket `B`, prefix `P`, workspace `W`:

- `P/W/meta/workspace-header.json` (encrypted header envelope)
- `P/W/objects/<object_type>/<object_id>/<revision_id>.env.json`
- `P/W/manifests/latest.json`
- `P/W/checkpoints/<device_id>.json`
- `P/W/conflicts/<device_id>/<event_id>.env.json`

`revision_id` is monotonically increasing ULID/UUIDv7 write id.

## 3. Manifest format

`latest.json` fields:
- `sync_version`
- `workspace_id`
- `generated_at`
- `object_index`: map `{ object_id: { object_type, winning_revision_id, lww_clock, tombstoned } }`

Manifest is encrypted envelope except top-level addressing path.

## 4. Device checkpoint format

Checkpoint fields:
- `sync_version`
- `workspace_id`
- `device_id`
- `last_pulled_manifest_etag`
- `last_pushed_at`
- `last_completed_run_id`

Checkpoint updates occur only after local transactional commit.

## 5. Sync algorithm (deterministic)

1. Acquire local sync lock.
2. Load local checkpoint.
3. Pull phase:
   - Fetch remote manifest and changed revisions since known etag/version.
   - Decrypt/validate envelopes.
   - Apply LWW per object.
4. Commit pulled changes in one local transaction.
5. Push phase:
   - Enumerate staged local changes.
   - Encrypt and upload revision objects idempotently.
   - Upload updated manifest (conditional write).
6. Commit push bookkeeping locally.
7. Write checkpoint.
8. Emit deterministic sync log and release lock.

## 6. LWW and conflict rules

- Winner chosen by `lww_clock` tuple ordering from data model spec.
- Tie with same hash: no-op.
- Tie with different hash: winner chosen by tuple; loser optionally stored under conflict artifact and logged locally.

## 7. Snapshot policy

- Lightweight snapshots created every `N` writes or `T` minutes (configurable).
- Snapshot object contains list of `(object_id, winning_revision_id)` and metadata.
- Snapshot itself is encrypted envelope type `context_snapshot` or dedicated `snapshot` internal record (non-user-visible).

## 8. Tombstone and restore

- Soft delete writes `tombstone` object targeting object_id.
- Tombstone participates in LWW as normal object for target state.
- Restore writes a new live object revision with greater `lww_clock`.

## 9. Purge semantics

- Purge requires explicit CLI confirmation.
- Operation removes local decrypted cache and requests remote delete of all known workspace keys.
- System MUST warn provider-side backups/versioning may preserve historical ciphertext.

## 10. Concrete examples

### Example A: object path
`sync-root/ws-123/objects/message/obj-456/0195e6b6-bf1f-7f63-b7f5-8ec98cc8436e.env.json`

### Example B: checkpoint
```json
{
  "sync_version": "sp/1",
  "workspace_id": "018f3f8e-8f91-7f13-9a03-a0cb2af5e6e1",
  "device_id": "device-laptop-a",
  "last_pulled_manifest_etag": "\"9f620d4\"",
  "last_pushed_at": "2026-01-01T10:05:00.000Z",
  "last_completed_run_id": "0195e6b6-c197-75cc-9f91-7dd7f6cdf1d3"
}
```

### Example C: deterministic conflict log record
```json
{
  "event_id": "0195e6b7-8a33-7f5f-95a9-2fd4b9f67fa4",
  "workspace_id": "018f3f8e-8f91-7f13-9a03-a0cb2af5e6e1",
  "object_id": "018f3f90-1898-78a8-bce0-b0574a24c5e0",
  "winner_revision_id": "0195e6b6-bf1f-7f63-b7f5-8ec98cc8436e",
  "loser_revision_id": "0195e6b6-d092-79c4-a62a-81f4dfc7194b",
  "reason": "lww_tie_different_hash"
}
```
