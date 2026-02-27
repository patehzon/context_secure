use ctxsync_crypto::{parse_envelope, serialize_envelope, Envelope};

#[test]
fn envelope_roundtrip() {
    let envelope = Envelope {
        envelope_version: "env/1".to_string(),
        crypto_suite_id: "cs/1".to_string(),
        workspace_id: "w".to_string(),
        object_id: "o".to_string(),
        object_type: "message".to_string(),
        wrapped_object_key: "k".to_string(),
        nonce: "n".to_string(),
        ciphertext: "c".to_string(),
        aad_digest: "a".to_string(),
        created_at: "2026-01-01T00:00:00.000Z".to_string(),
    };

    let encoded = serialize_envelope(&envelope).expect("serialize");
    let decoded = parse_envelope(&encoded).expect("parse");
    assert_eq!(decoded, envelope);
}
