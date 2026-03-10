import assert from 'node:assert/strict';
import test from 'node:test';

interface LwwClock {
  wall_time_ms: number;
  logical_counter: number;
  device_id: string;
}

interface ReplicaRecord {
  object_id: string;
  content_hash: string;
  lww_clock: LwwClock;
}

function compareClock(a: LwwClock, b: LwwClock): number {
  if (a.wall_time_ms !== b.wall_time_ms) return a.wall_time_ms - b.wall_time_ms;
  if (a.logical_counter !== b.logical_counter) return a.logical_counter - b.logical_counter;
  return a.device_id.localeCompare(b.device_id);
}

function chooseWinner(a: ReplicaRecord, b: ReplicaRecord): ReplicaRecord {
  const clockCmp = compareClock(a.lww_clock, b.lww_clock);
  if (clockCmp > 0) return a;
  if (clockCmp < 0) return b;
  return a.content_hash >= b.content_hash ? a : b;
}

function converge(local: ReplicaRecord[], remote: ReplicaRecord[]): Map<string, ReplicaRecord> {
  const merged = new Map<string, ReplicaRecord>();
  for (const record of [...local, ...remote]) {
    const existing = merged.get(record.object_id);
    if (!existing) {
      merged.set(record.object_id, record);
      continue;
    }
    merged.set(record.object_id, chooseWinner(existing, record));
  }
  return merged;
}

test('local two instances converge (scaffold)', () => {
  // TODO(M1): replace this deterministic scaffold with full sync-engine pull/push harness.
  const deviceA = [
    {
      object_id: '018f3f90-1898-78a8-bce0-b0574a24c5e0',
      content_hash: '1111',
      lww_clock: { wall_time_ms: 1767261660000, logical_counter: 0, device_id: 'device-a' }
    }
  ] satisfies ReplicaRecord[];
  const deviceB = [
    {
      object_id: '018f3f90-1898-78a8-bce0-b0574a24c5e0',
      content_hash: '2222',
      lww_clock: { wall_time_ms: 1767261660000, logical_counter: 1, device_id: 'device-b' }
    }
  ] satisfies ReplicaRecord[];

  const aAfterSync = converge(deviceA, deviceB);
  const bAfterSync = converge(deviceB, deviceA);

  assert.equal(aAfterSync.size, 1);
  assert.equal(bAfterSync.size, 1);
  assert.deepEqual(
    aAfterSync.get('018f3f90-1898-78a8-bce0-b0574a24c5e0'),
    bAfterSync.get('018f3f90-1898-78a8-bce0-b0574a24c5e0')
  );
  assert.equal(
    aAfterSync.get('018f3f90-1898-78a8-bce0-b0574a24c5e0')?.content_hash,
    '2222'
  );
});
