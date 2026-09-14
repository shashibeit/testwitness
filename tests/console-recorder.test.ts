import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConsoleRecorder, type ConsoleTarget } from '../src/capture/ConsoleRecorder';
import { DataSanitizer } from '../src/privacy/DataSanitizer';
import type { ConsoleLogRecord } from '../src/types/evidence';

const activeRecorders: ConsoleRecorder[] = [];

function createTarget(): ConsoleTarget {
  return {
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function createRecorder(
  target: ConsoleTarget,
  records: ConsoleLogRecord[],
  overrides: Partial<ConstructorParameters<typeof ConsoleRecorder>[0]> = {},
): ConsoleRecorder {
  const recorder = new ConsoleRecorder({
    sanitizer: new DataSanitizer(),
    levels: ['warn', 'error'],
    onRecord: (record) => records.push(record),
    consoleTarget: target,
    urlProvider: () => 'https://example.test/page?access_token=secret',
    timestampProvider: () => '2026-09-07T12:00:00.000Z',
    idFactory: () => `console-${records.length + 1}`,
    ...overrides,
  });
  activeRecorders.push(recorder);
  return recorder;
}

afterEach(() => {
  for (const recorder of activeRecorders.splice(0)) recorder.stop();
});

describe('ConsoleRecorder', () => {
  it('preserves original behavior while recording sanitized calls', () => {
    const target = createTarget();
    const originalError = target.error;
    const records: ConsoleLogRecord[] = [];
    const recorder = createRecorder(target, records);
    recorder.start();

    target.error('Login failed', { password: 'do-not-store', retry: 2 });

    expect(originalError).toHaveBeenCalledOnce();
    expect(originalError).toHaveBeenCalledWith('Login failed', {
      password: 'do-not-store',
      retry: 2,
    });
    expect(records).toEqual([
      {
        id: 'console-1',
        timestamp: '2026-09-07T12:00:00.000Z',
        level: 'error',
        message: 'Login failed',
        arguments: ['Login failed', { password: '[REDACTED]', retry: 2 }],
        url: 'https://example.test/page?access_token=%5BREDACTED%5D',
      },
    ]);
  });

  it('filters levels and gates capture while paused', () => {
    const target = createTarget();
    const records: ConsoleLogRecord[] = [];
    const recorder = createRecorder(target, records, { levels: ['error'] });
    recorder.start();

    target.warn('ignored');
    recorder.pause();
    target.error('paused');
    recorder.resume();
    target.error('recorded');

    expect(records.map((record) => record.message)).toEqual(['recorded']);
  });

  it('is idempotent and restores the exact original methods on stop', () => {
    const target = createTarget();
    const originalWarn = target.warn;
    const originalError = target.error;
    const records: ConsoleLogRecord[] = [];
    const recorder = createRecorder(target, records);

    recorder.start();
    const wrappedError = target.error;
    recorder.start();
    expect(target.error).toBe(wrappedError);
    recorder.stop();

    expect(target.warn).toBe(originalWarn);
    expect(target.error).toBe(originalError);
  });

  it('shares one patch between recorders and restores after the final subscriber', () => {
    const target = createTarget();
    const original = target.error;
    const firstRecords: ConsoleLogRecord[] = [];
    const secondRecords: ConsoleLogRecord[] = [];
    const first = createRecorder(target, firstRecords);
    const second = createRecorder(target, secondRecords);

    first.start();
    const wrapper = target.error;
    second.start();
    expect(target.error).toBe(wrapper);

    target.error('once');
    first.stop();
    expect(target.error).toBe(wrapper);
    second.stop();
    expect(target.error).toBe(original);
    expect(firstRecords).toHaveLength(1);
    expect(secondRecords).toHaveLength(1);
  });

  it('does not recurse when a record callback itself logs', () => {
    const target = createTarget();
    const originalError = target.error;
    const records: ConsoleLogRecord[] = [];
    const recorder = createRecorder(target, records, {
      onRecord: (record) => {
        records.push(record);
        target.error('callback diagnostic');
      },
    });
    recorder.start();

    target.error('host error');

    expect(records).toHaveLength(1);
    expect(originalError).toHaveBeenCalledTimes(2);
  });

  it('does not coerce logged objects while deriving the message', () => {
    const target = createTarget();
    const records: ConsoleLogRecord[] = [];
    let coercions = 0;
    const loggedValue = {
      safe: true,
      toString: () => {
        coercions += 1;
        return 'coerced';
      },
    };
    const recorder = createRecorder(target, records);
    recorder.start();

    target.error(loggedValue);

    expect(coercions).toBe(0);
    expect(records[0]?.message).toBe('[Object]');
  });

  it('does not overwrite a method patched by another library after start', () => {
    const target = createTarget();
    const records: ConsoleLogRecord[] = [];
    const recorder = createRecorder(target, records);
    recorder.start();
    const laterPatch = vi.fn();
    target.error = laterPatch;

    recorder.stop();

    expect(target.error).toBe(laterPatch);
  });
});
