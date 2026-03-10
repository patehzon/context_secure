import assert from 'node:assert/strict';
import test from 'node:test';

import type { GenerateRequest, LocalRuntimeConfig } from '@context-secure/types';

import {
  buildLlamaCppBinaryArgs,
  buildLlamaCppCompletionRequest,
  createConfiguredLlamaCppRuntime,
  createLlamaCppBinaryTransport,
  createLlamaCppCompositeTransport,
  createLlamaCppHttpRuntime,
  createLlamaCppHttpTransport,
  createLlamaCppRuntime,
  resolveLlamaCppModelBinding
} from './index.js';

const serverConfig: LocalRuntimeConfig = {
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

const binaryConfig: LocalRuntimeConfig = {
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
          gguf_path: '/models/qwen2.5.gguf',
          context_size: 8192,
          gpu_layers: 35,
          threads: 8,
          default_args: ['--seed', '42']
        }
      ]
    }
  ]
};

test('resolveLlamaCppModelBinding returns local binding for model_ref', () => {
  const binding = resolveLlamaCppModelBinding(serverConfig, 'qwen2.5-7b-instruct-q4_k_m');

  assert.equal(binding.endpoint, 'http://127.0.0.1:8080');
  assert.equal(binding.source, 'server');
});

test('buildLlamaCppCompletionRequest maps generic request into OAI-compatible chat request', () => {
  const request: GenerateRequest = {
    runtime: 'llama.cpp',
    model_ref: 'qwen2.5-7b-instruct-q4_k_m',
    prompt: 'Summarize this chat.',
    system_prompt: 'Be concise.',
    max_tokens: 128,
    temperature: 0.1
  };

  const completion = buildLlamaCppCompletionRequest(
    request,
    resolveLlamaCppModelBinding(serverConfig, request.model_ref)
  );
  assert.deepEqual(completion, {
    model: 'qwen2.5-7b-instruct',
    messages: [
      {
        role: 'system',
        content: 'Be concise.'
      },
      {
        role: 'user',
        content: 'Summarize this chat.'
      }
    ],
    max_tokens: 128,
    temperature: 0.1,
    stream: false
  });
});

test('buildLlamaCppBinaryArgs renders one-shot llama-cli invocation', () => {
  const binding = resolveLlamaCppModelBinding(binaryConfig, 'qwen2.5-7b-instruct-q4_k_m');
  const args = buildLlamaCppBinaryArgs(binding, {
    model: 'qwen2.5-7b-instruct-q4_k_m',
    messages: [
      { role: 'system', content: 'Be concise.' },
      { role: 'user', content: 'Summarize this chat.' }
    ],
    max_tokens: 128,
    temperature: 0.1,
    stream: false
  });

  assert.deepEqual(args, [
    '-m',
    '/models/qwen2.5.gguf',
    '--simple-io',
    '--no-display-prompt',
    '-n',
    '128',
    '--temp',
    '0.1',
    '--ctx-size',
    '8192',
    '--threads',
    '8',
    '-ngl',
    '35',
    '-p',
    'System:\nBe concise.\n\nUser:\nSummarize this chat.\n\nAssistant:',
    '--seed',
    '42'
  ]);
});

test('createLlamaCppRuntime delegates generate through transport', async () => {
  const calls: string[] = [];
  const runtime = createLlamaCppRuntime(serverConfig, {
    async health_check(binding) {
      calls.push(`health:${binding.model_ref}`);
    },
    async complete(binding, request) {
      calls.push(`complete:${binding.model_ref}:${request.max_tokens}:${request.model}`);
      return {
        content: `stubbed response for ${request.model}`,
        stop_reason: 'stop'
      };
    }
  });

  await runtime.health_check();
  const result = await runtime.generate({
    runtime: 'llama.cpp',
    model_ref: 'qwen2.5-7b-instruct-q4_k_m',
    prompt: 'Hello'
  });

  assert.deepEqual(calls, [
    'health:qwen2.5-7b-instruct-q4_k_m',
    'complete:qwen2.5-7b-instruct-q4_k_m:256:qwen2.5-7b-instruct'
  ]);
  assert.equal(result.text, 'stubbed response for qwen2.5-7b-instruct');
  assert.equal(result.finish_reason, 'stop');
});

test('createLlamaCppHttpTransport performs health check against v1/models', async () => {
  const requests: Array<{ input: string; init: RequestInit | undefined }> = [];
  const transport = createLlamaCppHttpTransport({
    fetch_impl: async (input, init) => {
      requests.push({ input: String(input), init });
      return new Response(
        JSON.stringify({
          data: [{ id: 'qwen2.5-7b-instruct' }]
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json'
          }
        }
      );
    }
  });

  await transport.health_check(resolveLlamaCppModelBinding(serverConfig, 'qwen2.5-7b-instruct-q4_k_m'));

  assert.equal(requests[0]?.input, 'http://127.0.0.1:8080/v1/models');
  assert.equal(requests[0]?.init?.method, 'GET');
});

test('createLlamaCppHttpTransport sends OAI-compatible chat completion request', async () => {
  const requests: Array<{ input: string; init: RequestInit | undefined }> = [];
  const transport = createLlamaCppHttpTransport({
    fetch_impl: async (input, init) => {
      requests.push({ input: String(input), init });
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Local answer'
              },
              finish_reason: 'stop'
            }
          ]
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json'
          }
        }
      );
    }
  });

  const binding = resolveLlamaCppModelBinding(serverConfig, 'qwen2.5-7b-instruct-q4_k_m');
  const response = await transport.complete(binding, {
    model: 'qwen2.5-7b-instruct',
    messages: [{ role: 'user', content: 'Hello' }],
    max_tokens: 64,
    temperature: 0.2,
    stream: false
  });

  assert.equal(requests[0]?.input, 'http://127.0.0.1:8080/v1/chat/completions');
  assert.equal(requests[0]?.init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    model: 'qwen2.5-7b-instruct',
    messages: [{ role: 'user', content: 'Hello' }],
    max_tokens: 64,
    temperature: 0.2,
    stream: false
  });
  assert.deepEqual(response, {
    content: 'Local answer',
    stop_reason: 'stop'
  });
});

test('createLlamaCppBinaryTransport performs health check with --version', async () => {
  const calls: Array<{ file: string; args: readonly string[] }> = [];
  const transport = createLlamaCppBinaryTransport({
    exec_file: async (file, args) => {
      calls.push({ file, args });
      return { stdout: 'version', stderr: '' };
    }
  });

  await transport.health_check(resolveLlamaCppModelBinding(binaryConfig, 'qwen2.5-7b-instruct-q4_k_m'));

  assert.deepEqual(calls, [
    {
      file: '/opt/llama.cpp/llama-cli',
      args: ['--version']
    }
  ]);
});

test('createLlamaCppBinaryTransport executes one-shot binary invocation', async () => {
  const calls: Array<{ file: string; args: readonly string[] }> = [];
  const transport = createLlamaCppBinaryTransport({
    exec_file: async (file, args) => {
      calls.push({ file, args });
      return { stdout: 'Binary answer\n', stderr: '' };
    }
  });

  const binding = resolveLlamaCppModelBinding(binaryConfig, 'qwen2.5-7b-instruct-q4_k_m');
  const result = await transport.complete(binding, {
    model: 'qwen2.5-7b-instruct-q4_k_m',
    messages: [{ role: 'user', content: 'Hello' }],
    max_tokens: 64,
    temperature: 0.2,
    stream: false
  });

  assert.equal(calls[0]?.file, '/opt/llama.cpp/llama-cli');
  assert.equal(result.content, 'Binary answer');
});

test('createLlamaCppCompositeTransport routes by binding source', async () => {
  const calls: string[] = [];
  const transport = createLlamaCppCompositeTransport({
    fetch_impl: async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: { role: 'assistant', content: 'Server answer' },
              finish_reason: 'stop'
            }
          ]
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      ),
    exec_file: async (file) => {
      calls.push(file);
      return { stdout: 'Binary answer', stderr: '' };
    }
  });

  const binaryBinding = resolveLlamaCppModelBinding(binaryConfig, 'qwen2.5-7b-instruct-q4_k_m');
  const binaryResult = await transport.complete(binaryBinding, {
    model: 'qwen2.5-7b-instruct-q4_k_m',
    messages: [{ role: 'user', content: 'Hello' }],
    max_tokens: 64,
    temperature: 0.2,
    stream: false
  });

  assert.equal(binaryResult.content, 'Binary answer');
  assert.deepEqual(calls, ['/opt/llama.cpp/llama-cli']);
});

test('createConfiguredLlamaCppRuntime composes config and HTTP transport', async () => {
  const runtime = createLlamaCppHttpRuntime(serverConfig, {
    fetch_impl: async (input) => {
      const url = String(input);
      if (url.endsWith('/v1/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'qwen2.5-7b-instruct' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: { role: 'assistant', content: 'Composed runtime answer' },
              finish_reason: 'stop'
            }
          ]
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    }
  });

  await runtime.health_check();
  const result = await runtime.generate({
    runtime: 'llama.cpp',
    model_ref: 'qwen2.5-7b-instruct-q4_k_m',
    prompt: 'Hello'
  });

  assert.equal(result.text, 'Composed runtime answer');
  assert.equal(result.finish_reason, 'stop');
});

test('createConfiguredLlamaCppRuntime supports binary model bindings', async () => {
  const runtime = createConfiguredLlamaCppRuntime(binaryConfig, {
    exec_file: async (file) => {
      assert.equal(file, '/opt/llama.cpp/llama-cli');
      return { stdout: 'Binary runtime answer', stderr: '' };
    }
  });

  await runtime.health_check();
  const result = await runtime.generate({
    runtime: 'llama.cpp',
    model_ref: 'qwen2.5-7b-instruct-q4_k_m',
    prompt: 'Hello'
  });

  assert.equal(result.text, 'Binary runtime answer');
  assert.equal(result.finish_reason, 'unknown');
});

test('createLlamaCppHttpTransport rejects oversized responses', async () => {
  const oversizedBody = JSON.stringify({
    choices: [
      {
        message: {
          role: 'assistant',
          content: 'x'.repeat(64)
        }
      }
    ]
  });
  const transport = createLlamaCppHttpTransport({
    max_response_bytes: 32,
    fetch_impl: async () =>
      new Response(oversizedBody, {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'content-length': String(Buffer.byteLength(oversizedBody))
        }
      })
  });

  await assert.rejects(
    () =>
      transport.complete(resolveLlamaCppModelBinding(serverConfig, 'qwen2.5-7b-instruct-q4_k_m'), {
        model: 'qwen2.5-7b-instruct',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 64,
        temperature: 0.2,
        stream: false
      }),
    /response exceeds size limit/
  );
});
