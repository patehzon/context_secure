import assert from 'node:assert/strict';
import test from 'node:test';

import type { AgentConfigObject, LocalRuntimeConfig } from './index.js';

test('agent config object matches dm/1 shape', () => {
  const agentConfig: AgentConfigObject = {
    model_version: 'dm/1',
    workspace_id: '018f3f8e-8f91-7f13-9a03-a0cb2af5e6e1',
    object_id: '018f3f90-1898-78a8-bce0-b0574a24c5e0',
    object_type: 'agent_config',
    created_at: '2026-01-01T10:01:00.000Z',
    updated_at: '2026-01-01T10:01:00.000Z',
    device_id: 'device-laptop-a',
    lww_clock: {
      wall_time_ms: 1767261660000,
      logical_counter: 0,
      device_id: 'device-laptop-a'
    },
    content_hash: '6c88abf6dffba5e8f72ce7eb8f908dd9faafe0500f408714f5f93275b616a206',
    content: {
      name: 'Local Qwen',
      runtime: 'llama.cpp',
      model_ref: 'qwen2.5-7b-instruct-q4_k_m'
    }
  };

  assert.equal(agentConfig.content.runtime, 'llama.cpp');
});

test('local runtime config is versioned from day one', () => {
  const config: LocalRuntimeConfig = {
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
            server_model_name: 'qwen2.5-7b-instruct'
          }
        ]
      }
    ]
  };

  assert.equal(config.local_runtime_config_version, 'lrc/1');
  assert.equal(config.runtimes[0]?.models[0]?.model_ref, 'qwen2.5-7b-instruct-q4_k_m');
  assert.equal(config.runtimes[0]?.models[0]?.server_model_name, 'qwen2.5-7b-instruct');
});
