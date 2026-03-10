import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import type { LocalRuntimeConfig } from '@context-secure/types';

import {
  loadLocalRuntimeConfig,
  LOCAL_RUNTIME_CONFIG_FILENAME,
  resolveLocalRuntimeConfigPath,
  saveLocalRuntimeConfig,
  validateLocalRuntimeConfig
} from './index.js';

const sampleConfig: LocalRuntimeConfig = {
  local_runtime_config_version: 'lrc/1',
  default_runtime: 'llama.cpp',
  runtimes: [
    {
      runtime: 'llama.cpp',
      models: [
        {
          model_ref: 'qwen2.5-7b-instruct-q4_k_m',
          source: 'server',
          endpoint: 'http://127.0.0.1:8080',
          server_model_name: 'qwen2.5-7b-instruct',
          context_size: 8192,
          gpu_layers: 35
        }
      ]
    }
  ]
};

test('resolveLocalRuntimeConfigPath uses config_dir when provided', () => {
  const resolved = resolveLocalRuntimeConfigPath({
    config_dir: '/tmp/context-secure-local'
  });

  assert.equal(resolved, '/tmp/context-secure-local/local-runtime-config.json');
});

test('saveLocalRuntimeConfig persists and loadLocalRuntimeConfig reads the same lrc/1 config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'context-secure-store-local-'));

  try {
    const savedPath = await saveLocalRuntimeConfig(sampleConfig, { config_dir: dir });
    assert.equal(savedPath, join(dir, LOCAL_RUNTIME_CONFIG_FILENAME));

    const loaded = await loadLocalRuntimeConfig({ config_dir: dir });
    assert.deepEqual(loaded, sampleConfig);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadLocalRuntimeConfig returns undefined when config does not exist', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'context-secure-store-local-'));

  try {
    const loaded = await loadLocalRuntimeConfig({ config_dir: dir });
    assert.equal(loaded, undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('validateLocalRuntimeConfig rejects duplicate model refs', () => {
  assert.throws(
    () =>
      validateLocalRuntimeConfig({
        local_runtime_config_version: 'lrc/1',
        default_runtime: 'llama.cpp',
        runtimes: [
          {
            runtime: 'llama.cpp',
            models: [
              {
                model_ref: 'duplicate',
                source: 'server',
                endpoint: 'http://127.0.0.1:8080'
              },
              {
                model_ref: 'duplicate',
                source: 'server',
                endpoint: 'http://127.0.0.1:8081'
              }
            ]
          }
        ]
      }),
    /Duplicate model_ref/
  );
});

test('validateLocalRuntimeConfig rejects binary bindings without required paths', () => {
  assert.throws(
    () =>
      validateLocalRuntimeConfig({
        local_runtime_config_version: 'lrc/1',
        default_runtime: 'llama.cpp',
        runtimes: [
          {
            runtime: 'llama.cpp',
            models: [
              {
                model_ref: 'local-qwen',
                source: 'binary',
                binary_path: '/opt/llama.cpp/llama-cli'
              }
            ]
          }
        ]
      }),
    /requires gguf_path/
  );
});
