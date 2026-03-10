import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

import type {
  GenerateRequest,
  GenerateResult,
  LocalModelRuntime,
  LocalRuntimeConfig,
  LocalRuntimeModelBinding
} from '@context-secure/types';

const execFileAsync = promisify(execFileCallback);

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const MAX_SERVER_RESPONSE_BYTES = 256 * 1024;
const MAX_BINARY_OUTPUT_BYTES = 256 * 1024;

export interface LlamaCppChatMessage {
  role: 'system' | 'user';
  content: string;
}

export interface LlamaCppChatCompletionRequest {
  model: string;
  messages: LlamaCppChatMessage[];
  max_tokens: number;
  temperature: number;
  stream: false;
}

export interface LlamaCppCompletionResponse {
  content: string;
  stop_reason?: string;
}

export interface LlamaCppTransport {
  health_check(binding: LocalRuntimeModelBinding): Promise<void>;
  complete(
    binding: LocalRuntimeModelBinding,
    request: LlamaCppChatCompletionRequest
  ): Promise<LlamaCppCompletionResponse>;
}

export interface LlamaCppHttpTransportOptions {
  fetch_impl?: typeof fetch;
  request_timeout_ms?: number;
  max_response_bytes?: number;
}

export interface ExecFileOptions {
  cwd?: string;
  encoding: 'utf8';
  maxBuffer: number;
  timeout: number;
}

export type ExecFileLike = (
  file: string,
  args: readonly string[],
  options: ExecFileOptions
) => Promise<{ stdout: string; stderr: string }>;

export interface LlamaCppBinaryTransportOptions {
  exec_file?: ExecFileLike;
  process_cwd?: string;
  request_timeout_ms?: number;
  max_response_bytes?: number;
}

export interface LlamaCppTransportOptions
  extends LlamaCppHttpTransportOptions,
    LlamaCppBinaryTransportOptions {}

export function resolveLlamaCppModelBinding(
  config: LocalRuntimeConfig,
  modelRef: string
): LocalRuntimeModelBinding {
  const runtime = config.runtimes.find((entry) => entry.runtime === 'llama.cpp');
  if (!runtime) {
    throw new Error('Missing local runtime config for llama.cpp');
  }

  const binding = runtime.models.find((entry) => entry.model_ref === modelRef);
  if (!binding) {
    throw new Error(`Missing local llama.cpp model binding for model_ref=${modelRef}`);
  }

  return binding;
}

export function buildLlamaCppCompletionRequest(
  request: GenerateRequest,
  binding?: LocalRuntimeModelBinding
): LlamaCppChatCompletionRequest {
  if (request.runtime !== 'llama.cpp') {
    throw new Error(`Unsupported runtime=${request.runtime}`);
  }

  const messages: LlamaCppChatMessage[] = [];
  if (request.system_prompt !== undefined) {
    messages.push({
      role: 'system',
      content: request.system_prompt
    });
  }
  messages.push({
    role: 'user',
    content: request.prompt
  });

  return {
    model: binding?.server_model_name ?? request.model_ref,
    messages,
    max_tokens: request.max_tokens ?? 256,
    temperature: request.temperature ?? 0.2,
    stream: false
  };
}

export function buildLlamaCppBinaryArgs(
  binding: LocalRuntimeModelBinding,
  request: LlamaCppChatCompletionRequest
): string[] {
  const ggufPath = requireBinaryModelPath(binding);
  const args = [
    '-m',
    ggufPath,
    '--simple-io',
    '--no-display-prompt',
    '-n',
    String(request.max_tokens),
    '--temp',
    String(request.temperature)
  ];

  if (binding.context_size !== undefined) {
    args.push('--ctx-size', String(binding.context_size));
  }
  if (binding.threads !== undefined) {
    args.push('--threads', String(binding.threads));
  }
  if (binding.gpu_layers !== undefined) {
    args.push('-ngl', String(binding.gpu_layers));
  }

  args.push('-p', renderBinaryPrompt(request));

  if (binding.default_args !== undefined) {
    args.push(...binding.default_args);
  }

  return args;
}

export function createLlamaCppRuntime(
  config: LocalRuntimeConfig,
  transport: LlamaCppTransport
): LocalModelRuntime {
  return {
    id: 'llama.cpp',
    async health_check() {
      const runtime = config.runtimes.find((entry) => entry.runtime === 'llama.cpp');
      const binding = runtime?.models[0];
      if (!binding) {
        throw new Error('No llama.cpp models configured');
      }

      await transport.health_check(binding);
    },
    async generate(request: GenerateRequest): Promise<GenerateResult> {
      const binding = resolveLlamaCppModelBinding(config, request.model_ref);
      const completionRequest = buildLlamaCppCompletionRequest(request, binding);
      const response = await transport.complete(binding, completionRequest);

      return {
        runtime: 'llama.cpp',
        model_ref: request.model_ref,
        text: response.content,
        finish_reason: normalizeFinishReason(response.stop_reason)
      };
    }
  };
}

export function createLlamaCppHttpTransport(
  options: LlamaCppHttpTransportOptions = {}
): LlamaCppTransport {
  const fetchImpl = options.fetch_impl ?? fetch;
  const timeoutMs = options.request_timeout_ms ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const maxResponseBytes = options.max_response_bytes ?? MAX_SERVER_RESPONSE_BYTES;

  return {
    async health_check(binding) {
      const baseUrl = requireServerBaseUrl(binding);
      const response = await fetchWithTimeout(
        fetchImpl,
        `${baseUrl}/v1/models`,
        {
          method: 'GET',
          headers: {
            accept: 'application/json'
          }
        },
        timeoutMs
      );
      const payload = await readJsonResponse(response, maxResponseBytes);
      assertModelsPayload(payload, binding);
    },
    async complete(binding, request) {
      const baseUrl = requireServerBaseUrl(binding);
      const response = await fetchWithTimeout(
        fetchImpl,
        `${baseUrl}/v1/chat/completions`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json'
          },
          body: JSON.stringify(request)
        },
        timeoutMs
      );
      const payload = await readJsonResponse(response, maxResponseBytes);
      return parseChatCompletionPayload(payload);
    }
  };
}

export function createLlamaCppBinaryTransport(
  options: LlamaCppBinaryTransportOptions = {}
): LlamaCppTransport {
  const execFileImpl = options.exec_file ?? defaultExecFile;
  const timeoutMs = options.request_timeout_ms ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const maxResponseBytes = options.max_response_bytes ?? MAX_BINARY_OUTPUT_BYTES;

  return {
    async health_check(binding) {
      const binaryPath = requireBinaryPath(binding);
      const execOptions = buildExecFileOptions(timeoutMs, maxResponseBytes, options.process_cwd);
      try {
        await execFileImpl(binaryPath, ['--version'], execOptions);
      } catch (error) {
        throw new Error(formatBinaryExecutionError(error, binding.model_ref));
      }
    },
    async complete(binding, request) {
      const binaryPath = requireBinaryPath(binding);
      const args = buildLlamaCppBinaryArgs(binding, request);
      const execOptions = buildExecFileOptions(timeoutMs, maxResponseBytes, options.process_cwd);
      try {
        const result = await execFileImpl(binaryPath, args, execOptions);
        const content = result.stdout.trim();
        if (!content) {
          throw new Error(`llama.cpp binary returned empty stdout for model_ref=${binding.model_ref}`);
        }
        return {
          content
        };
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('llama.cpp binary returned empty stdout')) {
          throw error;
        }
        throw new Error(formatBinaryExecutionError(error, binding.model_ref));
      }
    }
  };
}

export function createLlamaCppCompositeTransport(
  options: LlamaCppTransportOptions = {}
): LlamaCppTransport {
  const httpOptions: LlamaCppHttpTransportOptions = {};
  if (options.fetch_impl !== undefined) {
    httpOptions.fetch_impl = options.fetch_impl;
  }
  if (options.request_timeout_ms !== undefined) {
    httpOptions.request_timeout_ms = options.request_timeout_ms;
  }
  if (options.max_response_bytes !== undefined) {
    httpOptions.max_response_bytes = options.max_response_bytes;
  }

  const binaryOptions: LlamaCppBinaryTransportOptions = {};
  if (options.exec_file !== undefined) {
    binaryOptions.exec_file = options.exec_file;
  }
  if (options.process_cwd !== undefined) {
    binaryOptions.process_cwd = options.process_cwd;
  }
  if (options.request_timeout_ms !== undefined) {
    binaryOptions.request_timeout_ms = options.request_timeout_ms;
  }
  if (options.max_response_bytes !== undefined) {
    binaryOptions.max_response_bytes = options.max_response_bytes;
  }

  const httpTransport = createLlamaCppHttpTransport(httpOptions);
  const binaryTransport = createLlamaCppBinaryTransport(binaryOptions);

  return {
    async health_check(binding) {
      return binding.source === 'server'
        ? httpTransport.health_check(binding)
        : binaryTransport.health_check(binding);
    },
    async complete(binding, request) {
      return binding.source === 'server'
        ? httpTransport.complete(binding, request)
        : binaryTransport.complete(binding, request);
    }
  };
}

export function createConfiguredLlamaCppRuntime(
  config: LocalRuntimeConfig,
  options: LlamaCppTransportOptions = {}
): LocalModelRuntime {
  return createLlamaCppRuntime(config, createLlamaCppCompositeTransport(options));
}

export function createLlamaCppHttpRuntime(
  config: LocalRuntimeConfig,
  options: LlamaCppHttpTransportOptions = {}
): LocalModelRuntime {
  return createLlamaCppRuntime(config, createLlamaCppHttpTransport(options));
}

function renderBinaryPrompt(request: LlamaCppChatCompletionRequest): string {
  const lines: string[] = [];
  for (const message of request.messages) {
    const header = message.role === 'system' ? 'System' : 'User';
    lines.push(`${header}:`);
    lines.push(message.content);
    lines.push('');
  }
  lines.push('Assistant:');
  return lines.join('\n');
}

function requireServerBaseUrl(binding: LocalRuntimeModelBinding): string {
  if (binding.source !== 'server') {
    throw new Error(`Unsupported llama.cpp binding source=${binding.source}`);
  }
  if (!binding.endpoint) {
    throw new Error(`Missing endpoint for llama.cpp server binding model_ref=${binding.model_ref}`);
  }

  return normalizeServerBaseUrl(binding.endpoint);
}

function requireBinaryPath(binding: LocalRuntimeModelBinding): string {
  if (binding.source !== 'binary') {
    throw new Error(`Unsupported llama.cpp binding source=${binding.source}`);
  }
  if (!binding.binary_path) {
    throw new Error(`Missing binary_path for llama.cpp binary binding model_ref=${binding.model_ref}`);
  }
  return binding.binary_path;
}

function requireBinaryModelPath(binding: LocalRuntimeModelBinding): string {
  if (binding.source !== 'binary') {
    throw new Error(`Unsupported llama.cpp binding source=${binding.source}`);
  }
  if (!binding.gguf_path) {
    throw new Error(`Missing gguf_path for llama.cpp binary binding model_ref=${binding.model_ref}`);
  }
  return binding.gguf_path;
}

function normalizeServerBaseUrl(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, '');
  if (!trimmed) {
    throw new Error('llama.cpp endpoint must not be empty');
  }

  return trimmed.endsWith('/v1') ? trimmed.slice(0, -3) : trimmed;
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(input, {
      ...init,
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`llama.cpp server request failed: ${response.status} ${response.statusText}`);
    }
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`llama.cpp server request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readJsonResponse(response: Response, maxResponseBytes: number): Promise<unknown> {
  const contentLengthHeader = response.headers.get('content-length');
  if (contentLengthHeader) {
    const parsedLength = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(parsedLength) && parsedLength > maxResponseBytes) {
      throw new Error(`llama.cpp server response exceeds size limit: ${parsedLength}`);
    }
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('llama.cpp server response body is missing');
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) {
      break;
    }

    totalBytes += result.value.byteLength;
    if (totalBytes > maxResponseBytes) {
      throw new Error(`llama.cpp server response exceeds size limit: ${totalBytes}`);
    }
    chunks.push(result.value);
  }

  const bytes = concatChunks(chunks, totalBytes);
  const text = new TextDecoder().decode(bytes);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('llama.cpp server returned invalid JSON');
  }
}

function concatChunks(chunks: Uint8Array[], totalBytes: number): Uint8Array {
  const output = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function assertModelsPayload(payload: unknown, binding: LocalRuntimeModelBinding): void {
  if (!isRecord(payload)) {
    throw new Error('llama.cpp server returned invalid models payload');
  }

  const data = payload.data;
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('llama.cpp server returned no models');
  }

  const expectedModelName = binding.server_model_name ?? binding.model_ref;
  const advertisedModelIds = data
    .map((entry) => (isRecord(entry) && typeof entry.id === 'string' ? entry.id : undefined))
    .filter((entry): entry is string => entry !== undefined);

  if (advertisedModelIds.length === 0) {
    throw new Error('llama.cpp server returned invalid model descriptors');
  }

  if (binding.server_model_name !== undefined && !advertisedModelIds.includes(expectedModelName)) {
    throw new Error(`llama.cpp server did not advertise model=${expectedModelName}`);
  }
}

function parseChatCompletionPayload(payload: unknown): LlamaCppCompletionResponse {
  if (!isRecord(payload)) {
    throw new Error('llama.cpp server returned invalid completion payload');
  }

  const choices = payload.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error('llama.cpp server returned no completion choices');
  }

  const firstChoice = choices[0];
  if (!isRecord(firstChoice)) {
    throw new Error('llama.cpp server returned invalid completion choice');
  }

  const message = firstChoice.message;
  if (!isRecord(message) || typeof message.content !== 'string') {
    throw new Error('llama.cpp server returned invalid completion message');
  }

  const response: LlamaCppCompletionResponse = {
    content: message.content
  };
  if (typeof firstChoice.finish_reason === 'string') {
    response.stop_reason = firstChoice.finish_reason;
  }
  return response;
}

function formatBinaryExecutionError(error: unknown, modelRef: string): string {
  if (isExecFileError(error)) {
    const stderr = error.stderr.trim();
    const stdout = error.stdout.trim();
    if (stderr) {
      return `llama.cpp binary failed for model_ref=${modelRef}: ${stderr}`;
    }
    if (stdout) {
      return `llama.cpp binary failed for model_ref=${modelRef}: ${stdout}`;
    }
    if (error.killed) {
      return `llama.cpp binary timed out for model_ref=${modelRef}`;
    }
  }
  if (error instanceof Error) {
    return `llama.cpp binary failed for model_ref=${modelRef}: ${error.message}`;
  }
  return `llama.cpp binary failed for model_ref=${modelRef}`;
}

function buildExecFileOptions(
  timeoutMs: number,
  maxResponseBytes: number,
  processCwd: string | undefined
): ExecFileOptions {
  const options: ExecFileOptions = {
    encoding: 'utf8',
    maxBuffer: maxResponseBytes,
    timeout: timeoutMs
  };
  if (processCwd !== undefined) {
    options.cwd = processCwd;
  }
  return options;
}

async function defaultExecFile(
  file: string,
  args: readonly string[],
  options: ExecFileOptions
): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileAsync(file, args, options);
  return {
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isExecFileError(
  value: unknown
): value is { stdout: string; stderr: string; killed?: boolean } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'stdout' in value &&
    'stderr' in value
  );
}

function normalizeFinishReason(stopReason: string | undefined): GenerateResult['finish_reason'] {
  if (stopReason === 'stop' || stopReason === 'length' || stopReason === 'tool_call') {
    return stopReason;
  }
  return 'unknown';
}
