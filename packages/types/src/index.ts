export type ObjectType =
  | 'workspace'
  | 'chat'
  | 'message'
  | 'context_snapshot'
  | 'agent_config'
  | 'template'
  | 'attachment'
  | 'tombstone';

export interface LwwClock {
  wall_time_ms: number;
  logical_counter: number;
  device_id: string;
}

export interface BaseObject<TType extends ObjectType, TContent> {
  model_version: 'dm/1';
  workspace_id: string;
  object_id: string;
  object_type: TType;
  created_at: string;
  updated_at: string;
  device_id: string;
  lww_clock: LwwClock;
  content_hash: string;
  content: TContent;
}

export interface AgentConfigContent {
  name: string;
  runtime: string;
  model_ref: string;
  tool_config_ref?: string;
}

export type AgentConfigObject = BaseObject<'agent_config', AgentConfigContent>;

export type LocalRuntimeBackend = 'llama.cpp';

export interface LocalRuntimeModelBinding {
  model_ref: string;
  source: 'server' | 'binary';
  endpoint?: string;
  server_model_name?: string;
  binary_path?: string;
  gguf_path?: string;
  default_args?: string[];
  context_size?: number;
  gpu_layers?: number;
  threads?: number;
}

export interface LocalRuntimeConfig {
  local_runtime_config_version: 'lrc/1';
  default_runtime: LocalRuntimeBackend;
  runtimes: Array<{
    runtime: LocalRuntimeBackend;
    models: LocalRuntimeModelBinding[];
  }>;
}

export interface GenerateRequest {
  runtime: string;
  model_ref: string;
  prompt: string;
  system_prompt?: string;
  max_tokens?: number;
  temperature?: number;
}

export interface GenerateResult {
  runtime: string;
  model_ref: string;
  text: string;
  finish_reason: 'stop' | 'length' | 'tool_call' | 'unknown';
}

export interface LocalModelRuntime {
  id: LocalRuntimeBackend;
  health_check(): Promise<void>;
  generate(request: GenerateRequest): Promise<GenerateResult>;
}
