import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { saveLocalRuntimeConfig } from '@context-secure/store-local';

import {
  buildGenerateRequest,
  executeCli,
  loadCliDeps,
  parseCliArgs,
  runCli,
  runCliCommand
} from './index.js';

test('parseCliArgs parses agent run smoke path and config dir', () => {
  const command = parseCliArgs([
    'agent',
    'run',
    '--runtime',
    'llama.cpp',
    '--model-ref',
    'qwen2.5-7b-instruct-q4_k_m',
    '--prompt',
    'Summarize this workspace.',
    '--system-prompt',
    'Be concise.',
    '--config-dir',
    '/tmp/context-secure-config'
  ]);

  assert.deepEqual(command, {
    kind: 'agent.run',
    runtime: 'llama.cpp',
    model_ref: 'qwen2.5-7b-instruct-q4_k_m',
    prompt: 'Summarize this workspace.',
    system_prompt: 'Be concise.',
    config_dir: '/tmp/context-secure-config'
  });
});

test('buildGenerateRequest maps parsed CLI command into runtime request', () => {
  const request = buildGenerateRequest({
    kind: 'agent.run',
    runtime: 'llama.cpp',
    model_ref: 'qwen2.5-7b-instruct-q4_k_m',
    prompt: 'Hello',
    system_prompt: 'Be brief.'
  });

  assert.deepEqual(request, {
    runtime: 'llama.cpp',
    model_ref: 'qwen2.5-7b-instruct-q4_k_m',
    prompt: 'Hello',
    system_prompt: 'Be brief.'
  });
});

test('runCliCommand dispatches to configured runtime', async () => {
  const result = await runCliCommand(
    {
      kind: 'agent.run',
      runtime: 'llama.cpp',
      model_ref: 'qwen2.5-7b-instruct-q4_k_m',
      prompt: 'Hello'
    },
    {
      runtimes: {
        'llama.cpp': {
          id: 'llama.cpp',
          async health_check() {
            return undefined;
          },
          async generate(request) {
            return {
              runtime: request.runtime,
              model_ref: request.model_ref,
              text: `stubbed:${request.prompt}`,
              finish_reason: 'stop'
            };
          }
        }
      }
    }
  );

  assert.equal(result.runtime, 'llama.cpp');
  assert.equal(result.model_ref, 'qwen2.5-7b-instruct-q4_k_m');
  assert.equal(result.text, 'stubbed:Hello');
});

test('runCli remains a convenience wrapper over parse + dispatch', async () => {
  const result = await runCli(
    [
      'agent',
      'run',
      '--runtime',
      'llama.cpp',
      '--model-ref',
      'qwen2.5-7b-instruct-q4_k_m',
      '--prompt',
      'Hello'
    ],
    {
      runtimes: {
        'llama.cpp': {
          id: 'llama.cpp',
          async health_check() {
            return undefined;
          },
          async generate(request) {
            return {
              runtime: request.runtime,
              model_ref: request.model_ref,
              text: `wrapped:${request.prompt}`,
              finish_reason: 'stop'
            };
          }
        }
      }
    }
  );

  assert.equal(result.text, 'wrapped:Hello');
});

test('loadCliDeps reads local runtime config and constructs HTTP runtime', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'context-secure-cli-'));

  try {
    await saveLocalRuntimeConfig(
      {
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
      },
      { config_dir: configDir }
    );

    const deps = await loadCliDeps(
      {
        kind: 'agent.run',
        runtime: 'llama.cpp',
        model_ref: 'qwen2.5-7b-instruct-q4_k_m',
        prompt: 'Hello',
        config_dir: configDir
      },
      {
        fetch_impl: async (input) => {
          const url = String(input);
          if (url.endsWith('/v1/chat/completions')) {
            return new Response(
              JSON.stringify({
                choices: [
                  {
                    message: { role: 'assistant', content: 'Live from fake server' },
                    finish_reason: 'stop'
                  }
                ]
              }),
              { status: 200, headers: { 'content-type': 'application/json' } }
            );
          }

          return new Response(
            JSON.stringify({
              data: [{ id: 'qwen2.5-7b-instruct' }]
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
      }
    );

    const result = await deps.runtimes['llama.cpp'].generate({
      runtime: 'llama.cpp',
      model_ref: 'qwen2.5-7b-instruct-q4_k_m',
      prompt: 'Hello'
    });
    assert.equal(result.text, 'Live from fake server');
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});

test('executeCli writes model output to stdout', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'context-secure-cli-'));
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  try {
    await saveLocalRuntimeConfig(
      {
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
      },
      { config_dir: configDir }
    );

    const exitCode = await executeCli(
      [
        'agent',
        'run',
        '--runtime',
        'llama.cpp',
        '--model-ref',
        'qwen2.5-7b-instruct-q4_k_m',
        '--prompt',
        'Hello',
        '--config-dir',
        configDir
      ],
      {
        stdout: { write(chunk) { stdoutChunks.push(chunk); } },
        stderr: { write(chunk) { stderrChunks.push(chunk); } },
        fetch_impl: async (input) => {
          const url = String(input);
          if (url.endsWith('/v1/chat/completions')) {
            return new Response(
              JSON.stringify({
                choices: [
                  {
                    message: { role: 'assistant', content: 'CLI answer' },
                    finish_reason: 'stop'
                  }
                ]
              }),
              { status: 200, headers: { 'content-type': 'application/json' } }
            );
          }

          return new Response(
            JSON.stringify({
              data: [{ id: 'qwen2.5-7b-instruct' }]
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
      }
    );

    assert.equal(exitCode, 0);
    assert.deepEqual(stdoutChunks, ['CLI answer\n']);
    assert.deepEqual(stderrChunks, []);
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});

test('executeCli supports binary llama.cpp bindings through exec_file injection', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'context-secure-cli-'));
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  const calls: Array<{ file: string; args: readonly string[] }> = [];

  try {
    await saveLocalRuntimeConfig(
      {
        local_runtime_config_version: 'lrc/1',
        default_runtime: 'llama.cpp',
        runtimes: [
          {
            runtime: 'llama.cpp',
            models: [
              {
                model_ref: 'qwen2.5-7b-instruct-q4_k_m',
                source: 'binary',
                binary_path: '/opt/llama.cpp/llama-cli',
                gguf_path: '/models/qwen2.5.gguf'
              }
            ]
          }
        ]
      },
      { config_dir: configDir }
    );

    const exitCode = await executeCli(
      [
        'agent',
        'run',
        '--runtime',
        'llama.cpp',
        '--model-ref',
        'qwen2.5-7b-instruct-q4_k_m',
        '--prompt',
        'Hello',
        '--config-dir',
        configDir
      ],
      {
        stdout: { write(chunk) { stdoutChunks.push(chunk); } },
        stderr: { write(chunk) { stderrChunks.push(chunk); } },
        exec_file: async (file, args) => {
          calls.push({ file, args });
          if (args[0] === '--version') {
            return { stdout: 'version', stderr: '' };
          }
          return { stdout: 'Binary CLI answer', stderr: '' };
        }
      }
    );

    assert.equal(exitCode, 0);
    assert.equal(calls[0]?.file, '/opt/llama.cpp/llama-cli');
    assert.equal(calls.length, 1);
    assert.deepEqual(stdoutChunks, ['Binary CLI answer\n']);
    assert.deepEqual(stderrChunks, []);
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});

test('executeCli reports missing config cleanly', async () => {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  const exitCode = await executeCli(
    [
      'agent',
      'run',
      '--runtime',
      'llama.cpp',
      '--model-ref',
      'qwen2.5-7b-instruct-q4_k_m',
      '--prompt',
      'Hello',
      '--config-dir',
      '/tmp/context-secure-does-not-exist'
    ],
    {
      stdout: { write(chunk) { stdoutChunks.push(chunk); } },
      stderr: { write(chunk) { stderrChunks.push(chunk); } }
    }
  );

  assert.equal(exitCode, 1);
  assert.deepEqual(stdoutChunks, []);
  assert.match(stderrChunks[0] ?? '', /Local runtime config not found/);
});
