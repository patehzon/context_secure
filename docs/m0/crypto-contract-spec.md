# M0 Crypto Contract Specification

Status: Draft v1 (normative)
Scope: Rust crypto core API contract, envelope format, parameters, and vectors.

## 1. Versioning and algorithm registry

- `crypto_suite_id` is mandatory and versioned.
- MVP suite: `cs/1`.
- `cs/1` components:
  - KDF: Argon2id (`m_cost_kib=262144`, `t_cost=3`, `p=1`, `out_len=32`)
  - AEAD: XChaCha20-Poly1305
  - Wrap mode: key wrapping via AEAD (`wrap_aead=xchacha20poly1305`)
  - Hash: SHA-256 (for local `content_hash` helper only)

Consumers MUST reject unknown major suite versions.

## 2. Rust crate boundary

Crate name: `ctxsync_crypto`.

Allowed responsibilities only:
- key derivation
- key wrapping/unwrapping
- envelope serialization/parsing
- encrypt/decrypt
- nonce generation
- secure compare
- zeroization hooks

Forbidden in crate:
- storage logic
- network logic
- business/sync logic

## 3. FFI surface (minimal)

- `derive_master_key(passphrase, salt, kdf_params) -> master_key`
- `wrap_key(kek, plaintext_key, aad) -> wrapped_key_blob`
- `unwrap_key(kek, wrapped_key_blob, aad) -> plaintext_key`
- `encrypt_object(object_plaintext, object_key, aad, nonce?) -> ciphertext_blob`
- `decrypt_object(ciphertext_blob, object_key, aad) -> object_plaintext`
- `serialize_envelope(envelope_struct) -> bytes`
- `parse_envelope(bytes) -> envelope_struct`

Errors are explicit tagged enums; no panic for attacker-controlled input.

Blob framing for AEAD outputs:
- `wrapped_key_blob` is `nonce(24 bytes) || ciphertext_with_tag`.
- `ciphertext_blob` is `nonce(24 bytes) || ciphertext_with_tag`.

## 4. Envelope format (`env/1`)

Canonical encoding: JSON UTF-8 with required stable key ordering at serialization:
1. `envelope_version`
2. `crypto_suite_id`
3. `workspace_id`
4. `object_id`
5. `object_type`
6. `wrapped_object_key`
7. `nonce`
8. `ciphertext`
9. `aad_digest`
10. `created_at`

Fields:
- `envelope_version`: `"env/1"`
- `crypto_suite_id`: `"cs/1"`
- `workspace_id`: UUIDv7 string
- `object_id`: UUIDv7 string
- `object_type`: from data model
- `wrapped_object_key`: base64
- `nonce`: base64 (24 bytes for XChaCha20)
- `ciphertext`: base64 (includes AEAD tag)
- `aad_digest`: hex SHA-256 of canonical AAD bytes
- `created_at`: RFC3339 UTC millis

AAD canonical JSON object:
```json
{
  "workspace_id": "...",
  "object_type": "...",
  "object_id": "...",
  "envelope_version": "env/1"
}
```

## 5. Nonce strategy

- `cs/1` uses CSPRNG-generated 24-byte random nonce per encryption.
- Nonce MUST never be reused with same object key.
- Collision risk is negligible; nevertheless each encrypt call MUST freshly generate nonce.
- Optional deterministic nonce input for test vectors only (not production path).

## 6. Security requirements

- Tampering MUST fail decryption.
- AAD mismatch MUST fail decryption.
- Wrapped key blob corruption MUST fail unwrap.
- `secure_compare` used for MAC/key material equality checks.
- Zeroization hook called on key buffers after use where feasible.

## 7. Deterministic test vectors (required)

Vector IDs (fixtures in `docs/m0/test-vectors/crypto-vectors.json`):
1. `kdf_v1_basic`
2. `wrap_unwrap_v1`
3. `encrypt_decrypt_v1`
4. `decrypt_fail_aad_mismatch_v1`
5. `decrypt_fail_corrupt_ciphertext_v1`

Determinism rules for fixtures:
- `kdf_v1_basic` is deterministic by Argon2id inputs.
- `wrap_unwrap_v1` fixture blob is generated with a fixed all-zero 24-byte nonce for test reproducibility only.
- `encrypt_decrypt_v1` uses the fixture-provided nonce (`nonce_b64`) for deterministic output.
- Production `wrap_key` and `encrypt_object` must generate fresh random nonces when no test nonce is supplied.

Offline bootstrap note:
- If deterministic vectors cannot be materialized due network-restricted dependency resolution, fixture values MUST be explicitly marked with `TODO_OFFLINE_*`.

## 8. Concrete examples

### Example A: envelope metadata
```json
{
  "envelope_version": "env/1",
  "crypto_suite_id": "cs/1",
  "workspace_id": "018f3f8e-8f91-7f13-9a03-a0cb2af5e6e1",
  "object_id": "018f3f90-1898-78a8-bce0-b0574a24c5e0",
  "object_type": "message",
  "wrapped_object_key": "n2I2w3wW3v...",
  "nonce": "95CpkUEdA2dXqPDq4kRkhh3UL2fYkW3B",
  "ciphertext": "0m35nDHo4+...",
  "aad_digest": "e8f7da676f0c2f7ab8aefc046bcfe06b84f0e52088fbef4b6fb2f2f329b3789f",
  "created_at": "2026-01-01T10:01:00.000Z"
}
```

### Example B: AAD mismatch failure
- Same envelope decrypted with `object_id` changed in AAD input MUST return error `AuthFailed`.

### Example C: parse failure
- Envelope parse failure (missing required field, malformed JSON, or invalid major version) MUST return `InvalidEnvelope(...)`.
