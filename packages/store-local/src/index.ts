import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import type { LocalRuntimeConfig, LocalRuntimeModelBinding } from '@context-secure/types';

export const STORE_LOCAL_BOUNDARY =
  'SQLite/migrations/local cleartext cache boundary, including unsynced device-local runtime config. Implementation is currently a local JSON-file store for lrc/1 only.';

export const LOCAL_RUNTIME_CONFIG_FILENAME = 'local-runtime-config.json';

type StringBindingKey =
  | 'endpoint'
  | 'server_model_name'
  | 'binary_path'
  | 'gguf_path';
type StringArrayBindingKey = 'default_args';
type NumberBindingKey = 'context_size' | 'gpu_layers' | 'threads';

export interface LocalRuntimeConfigStoreOptions {
  config_path?: string;
  config_dir?: string;
}

export function resolveDefaultLocalRuntimeConfigPath(): string {
  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  const baseDir =
    xdgConfigHome && xdgConfigHome.trim() !== ''
      ? resolve(xdgConfigHome, 'context-secure')
      : resolve(homedir(), '.config', 'context-secure');

  return join(baseDir, LOCAL_RUNTIME_CONFIG_FILENAME);
}

export function resolveLocalRuntimeConfigPath(
  options: LocalRuntimeConfigStoreOptions = {}
): string {
  if (options.config_path) {
    return resolve(options.config_path);
  }
  if (options.config_dir) {
    return resolve(options.config_dir, LOCAL_RUNTIME_CONFIG_FILENAME);
  }
  return resolveDefaultLocalRuntimeConfigPath();
}

export async function loadLocalRuntimeConfig(
  options: LocalRuntimeConfigStoreOptions = {}
): Promise<LocalRuntimeConfig | undefined> {
  const configPath = resolveLocalRuntimeConfigPath(options);

  let bytes: Buffer;
  try {
    bytes = await readFile(configPath);
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined;
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8')) as unknown;
  } catch {
    throw new Error(`Invalid local runtime config JSON at ${configPath}`);
  }

  return validateLocalRuntimeConfig(parsed);
}

export async function saveLocalRuntimeConfig(
  config: LocalRuntimeConfig,
  options: LocalRuntimeConfigStoreOptions = {}
): Promise<string> {
  const validated = validateLocalRuntimeConfig(config);
  const configPath = resolveLocalRuntimeConfigPath(options);
  const configDir = dirname(configPath);
  const tempPath = `${configPath}.tmp`;
  const serialized = JSON.stringify(validated, null, 2) + '\n';

  await mkdir(configDir, { recursive: true, mode: 0o700 });
  await writeFile(tempPath, serialized, { mode: 0o600 });
  await rename(tempPath, configPath);

  return configPath;
}

export function validateLocalRuntimeConfig(value: unknown): LocalRuntimeConfig {
  if (!isRecord(value)) {
    throw new Error('Local runtime config must be a JSON object');
  }
  if (value.local_runtime_config_version !== 'lrc/1') {
    throw new Error('Unsupported local_runtime_config_version');
  }
  if (value.default_runtime !== 'llama.cpp') {
    throw new Error('Unsupported default_runtime');
  }
  if (!Array.isArray(value.runtimes)) {
    throw new Error('Local runtime config runtimes must be an array');
  }

  const seenRuntimes = new Set<string>();
  const runtimes: LocalRuntimeConfig['runtimes'] = value.runtimes.map((runtimeEntry) => {
    if (!isRecord(runtimeEntry)) {
      throw new Error('Runtime entry must be an object');
    }
    if (runtimeEntry.runtime !== 'llama.cpp') {
      throw new Error('Unsupported runtime entry');
    }
    if (seenRuntimes.has(runtimeEntry.runtime)) {
      throw new Error(`Duplicate runtime entry: ${runtimeEntry.runtime}`);
    }
    seenRuntimes.add(runtimeEntry.runtime);

    if (!Array.isArray(runtimeEntry.models)) {
      throw new Error(`Runtime ${runtimeEntry.runtime} models must be an array`);
    }

    const seenModelRefs = new Set<string>();
    const models = runtimeEntry.models.map((binding) => {
      const validatedBinding = validateModelBinding(binding);
      if (seenModelRefs.has(validatedBinding.model_ref)) {
        throw new Error(
          `Duplicate model_ref in runtime ${runtimeEntry.runtime}: ${validatedBinding.model_ref}`
        );
      }
      seenModelRefs.add(validatedBinding.model_ref);
      return validatedBinding;
    });

    return {
      runtime: 'llama.cpp',
      models
    };
  });

  return {
    local_runtime_config_version: 'lrc/1',
    default_runtime: 'llama.cpp',
    runtimes
  };
}

function validateModelBinding(value: unknown): LocalRuntimeModelBinding {
  if (!isRecord(value)) {
    throw new Error('Model binding must be an object');
  }
  if (typeof value.model_ref !== 'string' || value.model_ref.trim() === '') {
    throw new Error('Model binding model_ref must be a non-empty string');
  }
  if (value.source !== 'server' && value.source !== 'binary') {
    throw new Error(`Unsupported model binding source for model_ref=${String(value.model_ref)}`);
  }

  const binding: Partial<LocalRuntimeModelBinding> = {
    model_ref: value.model_ref,
    source: value.source
  };

  copyOptionalString(value, 'endpoint', binding);
  copyOptionalString(value, 'server_model_name', binding);
  copyOptionalString(value, 'binary_path', binding);
  copyOptionalString(value, 'gguf_path', binding);
  copyOptionalStringArray(value, 'default_args', binding);
  copyOptionalInteger(value, 'context_size', binding);
  copyOptionalInteger(value, 'gpu_layers', binding);
  copyOptionalInteger(value, 'threads', binding);

  if (binding.source === 'server' && !binding.endpoint) {
    throw new Error(`Server model binding requires endpoint for model_ref=${binding.model_ref}`);
  }
  if (binding.source === 'binary') {
    if (!binding.binary_path) {
      throw new Error(`Binary model binding requires binary_path for model_ref=${binding.model_ref}`);
    }
    if (!binding.gguf_path) {
      throw new Error(`Binary model binding requires gguf_path for model_ref=${binding.model_ref}`);
    }
  }

  return binding as LocalRuntimeModelBinding;
}

function copyOptionalString(
  input: Record<string, unknown>,
  key: StringBindingKey,
  target: Partial<LocalRuntimeModelBinding>
): void {
  const value = input[key];
  if (value === undefined) {
    return;
  }
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Expected ${String(key)} to be a non-empty string`);
  }
  target[key] = value;
}

function copyOptionalStringArray(
  input: Record<string, unknown>,
  key: StringArrayBindingKey,
  target: Partial<LocalRuntimeModelBinding>
): void {
  const value = input[key];
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    throw new Error(`Expected ${String(key)} to be a string array`);
  }
  target[key] = [...value];
}

function copyOptionalInteger(
  input: Record<string, unknown>,
  key: NumberBindingKey,
  target: Partial<LocalRuntimeModelBinding>
): void {
  const value = input[key];
  if (value === undefined) {
    return;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`Expected ${String(key)} to be a non-negative integer`);
  }
  target[key] = value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
