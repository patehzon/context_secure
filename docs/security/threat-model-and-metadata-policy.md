# Threat Model and Metadata Leakage Policy

Status: Draft v1 (normative)

## 1. Security goals

- Confidentiality of workspace content against storage provider and network observers.
- Integrity/tamper detection for all remote objects.
- Cross-device convergence with untrusted remote.
- No server-side plaintext processing.

## 2. Adversaries

1. Honest-but-curious cloud provider.
2. Malicious remote object mutator.
3. Passive network observer.
4. Stolen device without passphrase.

Out of scope:
- Fully compromised endpoint while unlocked.
- User-chosen weak passphrase brute-force beyond configured KDF resistance.

## 3. Assets protected

- Chat/message content
- Prompts/templates
- Agent configs
- Context snapshots
- Attachment content
- Wrapped object keys and workspace key material

## 4. Metadata leakage (allowed by design)

- Approximate object count via listable key cardinality.
- Ciphertext object sizes.
- Timing/frequency of sync operations.
- Workspace identifier in path addressing (opaque UUID).

## 5. Metadata that MUST NOT leak

- Plaintext titles, messages, prompts, template body.
- Attachment text/body.
- Agent configuration contents.
- Decrypted content hashes of plaintext payloads.

## 6. Integrity and tamper policy

- All ciphertext verified via AEAD before acceptance.
- AAD binds object identity and envelope version.
- Parse is strict with explicit size limits.
- Unknown major versions are rejected.

## 7. Deletion and retention truthfulness

- Soft delete represented by encrypted tombstone.
- Purge attempts remote deletion and local cache wipe.
- System warns deletion cannot prove eradication from provider backups/versioning logs.

## 8. Explicit decisions and justifications

- Zero-knowledge over convenience: no server indexes/search.
- LWW default for determinism and implementation safety.
- Local cleartext index permitted to preserve UX and offline search.
- Minimal metadata leakage accepted for practical object storage interoperability.

## 9. Concrete examples

1. If attacker swaps ciphertext at same key path, decrypt fails due to AEAD mismatch.
2. If remote replays stale but valid object, LWW clock comparison prevents rollback as winner.
3. If attacker lists bucket, they can estimate count/size but cannot read content.
