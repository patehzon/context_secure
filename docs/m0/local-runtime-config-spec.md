# M0 Local Runtime Config Specification

Status: Draft v1 (normative for local-only config)
Scope: device-local runtime bindings for local model execution. This format is not synced.

## 1. Versioning

- `local_runtime_config_version` is required.
- Initial version is `"lrc/1"`.
- Consumers MUST reject unknown major versions.

## 2. Storage and trust boundary

- `lrc/1` is stored only in device-local configuration.
- `lrc/1` MUST NOT be uploaded through sync or embedded in encrypted workspace objects.
- Values in `lrc/1` are machine-specific and may contain local paths or loopback endpoints.

## 3. Canonical shape

Top-level object:

- `local_runtime_config_version: "lrc/1"`
- `default_runtime: "llama.cpp"`
- `runtimes: RuntimeEntry[]`

`RuntimeEntry`:

- `runtime: "llama.cpp"`
- `models: ModelBinding[]`

`ModelBinding`:

- `model_ref: string`
- `source: "server"|"binary"`
- `endpoint?: string`
- `server_model_name?: string`
- `binary_path?: string`
- `gguf_path?: string`
- `default_args?: string[]`
- `context_size?: number`
- `gpu_layers?: number`
- `threads?: number`

## 4. Field semantics

- `model_ref` is the portable logical model identifier referenced from synced `agent_config`.
- `endpoint` is the base URL for a local `llama-server` instance.
- `server_model_name` overrides the OpenAI-compatible `model` name sent to `llama-server` when it differs from `model_ref`.
- `binary_path` and `gguf_path` are local absolute or resolved paths for direct process execution.
- `default_args` is an ordered argument list appended for local process launches.
- Current `source="binary"` execution uses a one-shot `llama-cli`-style invocation with explicit prompt injection and bounded stdout capture.

## 5. Validation rules

- Each `runtime` entry MUST be unique by `runtime`.
- Each `model_ref` MUST be unique within a runtime entry.
- `source="server"` requires `endpoint`.
- `source="binary"` requires `binary_path` and `gguf_path`.
- Unknown additive fields MAY be ignored within `lrc/1`.

## 6. Security requirements

- Local paths and loopback endpoints from `lrc/1` MUST NOT be logged together with prompts or decrypted content.
- Implementations MUST treat runtime responses as untrusted input and enforce strict JSON parsing and response size limits.
- `endpoint` SHOULD default to loopback addresses only unless the user explicitly opts into remote access.

## 7. Example

```json
{
  "local_runtime_config_version": "lrc/1",
  "default_runtime": "llama.cpp",
  "runtimes": [
    {
      "runtime": "llama.cpp",
      "models": [
        {
          "model_ref": "qwen2.5-7b-instruct-q4_k_m",
          "source": "server",
          "endpoint": "http://127.0.0.1:8080",
          "server_model_name": "qwen2.5-7b-instruct",
          "context_size": 8192,
          "gpu_layers": 35
        }
      ]
    }
  ]
}
```
