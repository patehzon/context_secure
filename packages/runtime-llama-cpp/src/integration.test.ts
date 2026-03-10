import assert from 'node:assert/strict';
import test from 'node:test';

import type { LocalRuntimeConfig, LocalRuntimeModelBinding } from '@context-secure/types';

import { createConfiguredLlamaCppRuntime } from './index.js';

const shouldRunSmoke = process.env.CTXSECURE_LLAMA_SMOKE === '1';
const endpoint = process.env.CTXSECURE_LLAMA_ENDPOINT;
const modelRef = process.env.CTXSECURE_LLAMA_MODEL_REF;
const serverModelName = process.env.CTXSECURE_LLAMA_SERVER_MODEL_NAME;

test(
  'live llama.cpp server smoke test',
  {
    skip:
      !shouldRunSmoke || endpoint === undefined || modelRef === undefined
        ? 'Set CTXSECURE_LLAMA_SMOKE=1, CTXSECURE_LLAMA_ENDPOINT, and CTXSECURE_LLAMA_MODEL_REF to run this live smoke test.'
        : false
  },
  async () => {
    const binding: LocalRuntimeModelBinding = {
      model_ref: modelRef!,
      source: 'server' as const,
      endpoint: endpoint!
    };
    if (serverModelName !== undefined) {
      binding.server_model_name = serverModelName;
    }

    const config: LocalRuntimeConfig = {
      local_runtime_config_version: 'lrc/1',
      default_runtime: 'llama.cpp',
      runtimes: [
        {
          runtime: 'llama.cpp',
          models: [binding]
        }
      ]
    };

    const runtime = createConfiguredLlamaCppRuntime(config, {
      fetch_impl: fetch,
      request_timeout_ms: 60_000
    });

    await runtime.health_check();
    const result = await runtime.generate({
      runtime: 'llama.cpp',
      model_ref: modelRef!,
      prompt: 'Reply with a short confirmation that this smoke test reached the model.',
      max_tokens: 48,
      temperature: 0
    });

    assert.ok(result.text.trim().length > 0);
    assert.ok(result.text.length < 2048);
  }
);
