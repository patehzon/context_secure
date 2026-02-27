/**
 * TypeScript boundary package for Rust crypto FFI bindings.
 * No cryptographic primitive implementation is allowed here.
 */
export interface CryptoBridge {
  derive_master_key(input: Uint8Array): Uint8Array;
  wrap_key(input: Uint8Array): Uint8Array;
  unwrap_key(input: Uint8Array): Uint8Array;
  encrypt_object(input: Uint8Array): Uint8Array;
  decrypt_object(input: Uint8Array): Uint8Array;
  serialize_envelope(input: Uint8Array): Uint8Array;
  parse_envelope(input: Uint8Array): Uint8Array;
}
