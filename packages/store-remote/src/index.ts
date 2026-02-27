export interface RemoteStore {
  put(path: string, bytes: Uint8Array): Promise<void>;
  get(path: string): Promise<Uint8Array>;
  head(path: string): Promise<{ etag?: string; size: number }>;
  list(prefix: string): Promise<string[]>;
  delete(path: string): Promise<void>;
}
