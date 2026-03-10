import {
  createConfiguredLlamaCppRuntime,
  type LlamaCppTransportOptions
} from '@context-secure/runtime-llama-cpp';
import {
  loadLocalRuntimeConfig,
  resolveLocalRuntimeConfigPath,
  type LocalRuntimeConfigStoreOptions
} from '@context-secure/store-local';
import type {
  GenerateResult,
  GenerateRequest,
  LocalModelRuntime,
  LocalRuntimeBackend
} from '@context-secure/types';

export const CLI_COMMANDS = [
  'init',
  'unlock',
  'status',
  'sync',
  'snapshot',
  'delete',
  'restore',
  'purge',
  'agent'
] as const;

export interface AgentRunCommand extends LocalRuntimeConfigStoreOptions {
  kind: 'agent.run';
  runtime: LocalRuntimeBackend;
  model_ref: string;
  prompt: string;
  system_prompt?: string;
}

export interface CliDeps {
  runtimes: Record<LocalRuntimeBackend, LocalModelRuntime>;
}

export interface CliExecuteOptions {
  stderr?: { write(chunk: string): unknown };
  stdout?: { write(chunk: string): unknown };
  fetch_impl?: typeof fetch;
  exec_file?: LlamaCppTransportOptions['exec_file'];
  process_cwd?: string;
}

export function parseCliArgs(argv: string[]): AgentRunCommand {
  if (argv[0] !== 'agent' || argv[1] !== 'run') {
    throw new Error('Unsupported command. Expected: agent run');
  }

  let runtime: LocalRuntimeBackend | undefined;
  let modelRef: string | undefined;
  let prompt: string | undefined;
  let systemPrompt: string | undefined;
  let configPath: string | undefined;
  let configDir: string | undefined;

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--runtime') {
      runtime = argv[i + 1] as LocalRuntimeBackend | undefined;
      i += 1;
      continue;
    }
    if (token === '--model-ref') {
      modelRef = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === '--prompt') {
      prompt = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === '--system-prompt') {
      systemPrompt = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === '--config-path') {
      configPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === '--config-dir') {
      configDir = argv[i + 1];
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  if (configPath && configDir) {
    throw new Error('Use either --config-path or --config-dir, not both');
  }
  if (runtime !== 'llama.cpp') {
    throw new Error('Missing or unsupported --runtime');
  }
  if (!modelRef) {
    throw new Error('Missing --model-ref');
  }
  if (!prompt) {
    throw new Error('Missing --prompt');
  }

  const command: AgentRunCommand = {
    kind: 'agent.run',
    runtime,
    model_ref: modelRef,
    prompt
  };

  if (systemPrompt !== undefined) {
    command.system_prompt = systemPrompt;
  }
  if (configPath !== undefined) {
    command.config_path = configPath;
  }
  if (configDir !== undefined) {
    command.config_dir = configDir;
  }

  return command;
}

export function buildGenerateRequest(command: AgentRunCommand): GenerateRequest {
  const request: GenerateRequest = {
    runtime: command.runtime,
    model_ref: command.model_ref,
    prompt: command.prompt
  };
  if (command.system_prompt !== undefined) {
    request.system_prompt = command.system_prompt;
  }
  return request;
}

export async function runCliCommand(
  command: AgentRunCommand,
  deps: CliDeps
): Promise<GenerateResult> {
  const runtime = deps.runtimes[command.runtime];
  if (!runtime) {
    throw new Error(`Runtime not configured: ${command.runtime}`);
  }

  return runtime.generate(buildGenerateRequest(command));
}

export async function runCli(argv: string[], deps: CliDeps): Promise<GenerateResult> {
  return runCliCommand(parseCliArgs(argv), deps);
}

export async function loadCliDeps(
  command: AgentRunCommand,
  options: Pick<LlamaCppTransportOptions, 'fetch_impl' | 'exec_file' | 'process_cwd'> = {}
): Promise<CliDeps> {
  const configOptions: LocalRuntimeConfigStoreOptions = {};
  if (command.config_path !== undefined) {
    configOptions.config_path = command.config_path;
  }
  if (command.config_dir !== undefined) {
    configOptions.config_dir = command.config_dir;
  }

  const config = await loadLocalRuntimeConfig(configOptions);
  if (!config) {
    const resolvedPath = resolveLocalRuntimeConfigPath(configOptions);
    throw new Error(`Local runtime config not found: ${resolvedPath}`);
  }

  const runtimeOptions: LlamaCppTransportOptions = {};
  if (options.fetch_impl !== undefined) {
    runtimeOptions.fetch_impl = options.fetch_impl;
  }
  if (options.exec_file !== undefined) {
    runtimeOptions.exec_file = options.exec_file;
  }
  if (options.process_cwd !== undefined) {
    runtimeOptions.process_cwd = options.process_cwd;
  }

  return {
    runtimes: {
      'llama.cpp': createConfiguredLlamaCppRuntime(config, runtimeOptions)
    }
  };
}

export async function executeCli(
  argv: string[],
  options: CliExecuteOptions = {}
): Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;

  try {
    const command = parseCliArgs(argv);
    const depOptions: Pick<LlamaCppTransportOptions, 'fetch_impl' | 'exec_file' | 'process_cwd'> =
      {};
    if (options.fetch_impl !== undefined) {
      depOptions.fetch_impl = options.fetch_impl;
    }
    if (options.exec_file !== undefined) {
      depOptions.exec_file = options.exec_file;
    }
    if (options.process_cwd !== undefined) {
      depOptions.process_cwd = options.process_cwd;
    }
    const deps = await loadCliDeps(command, depOptions);
    const result = await runCliCommand(command, deps);
    stdout.write(`${result.text}\n`);
    return 0;
  } catch (error) {
    stderr.write(`${formatCliError(error)}\n`);
    return 1;
  }
}

function formatCliError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unknown CLI error';
}
