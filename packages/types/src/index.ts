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
