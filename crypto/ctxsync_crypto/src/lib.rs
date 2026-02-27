use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum CryptoError {
    #[error("not implemented: {0}")]
    NotImplemented(&'static str),
    #[error("invalid envelope: {0}")]
    InvalidEnvelope(&'static str),
    #[error("serialization error")]
    Serialization,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Envelope {
    pub envelope_version: String,
    pub crypto_suite_id: String,
    pub workspace_id: String,
    pub object_id: String,
    pub object_type: String,
    pub wrapped_object_key: String,
    pub nonce: String,
    pub ciphertext: String,
    pub aad_digest: String,
    pub created_at: String,
}

pub fn derive_master_key(_passphrase: &[u8], _salt: &[u8], _kdf_params: &[u8]) -> Result<Vec<u8>, CryptoError> {
    Err(CryptoError::NotImplemented("derive_master_key"))
}

pub fn wrap_key(_kek: &[u8], _plaintext_key: &[u8], _aad: &[u8]) -> Result<Vec<u8>, CryptoError> {
    Err(CryptoError::NotImplemented("wrap_key"))
}

pub fn unwrap_key(_kek: &[u8], _wrapped_key_blob: &[u8], _aad: &[u8]) -> Result<Vec<u8>, CryptoError> {
    Err(CryptoError::NotImplemented("unwrap_key"))
}

pub fn encrypt_object(_object_plaintext: &[u8], _object_key: &[u8], _aad: &[u8], _nonce: Option<&[u8]>) -> Result<Vec<u8>, CryptoError> {
    Err(CryptoError::NotImplemented("encrypt_object"))
}

pub fn decrypt_object(_ciphertext_blob: &[u8], _object_key: &[u8], _aad: &[u8]) -> Result<Vec<u8>, CryptoError> {
    Err(CryptoError::NotImplemented("decrypt_object"))
}

pub fn serialize_envelope(envelope: &Envelope) -> Result<Vec<u8>, CryptoError> {
    serde_json::to_vec(envelope).map_err(|_| CryptoError::Serialization)
}

pub fn parse_envelope(bytes: &[u8]) -> Result<Envelope, CryptoError> {
    let env: Envelope = serde_json::from_slice(bytes).map_err(|_| CryptoError::InvalidEnvelope("parse failed"))?;
    if env.crypto_suite_id.is_empty() {
        return Err(CryptoError::InvalidEnvelope("missing crypto_suite_id"));
    }
    Ok(env)
}

pub fn secure_compare(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff: u8 = 0;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}
