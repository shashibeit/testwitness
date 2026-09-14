import { describe, expect, it } from 'vitest';

import { SessionManager } from '../src/core/SessionManager';
import type { SessionResultStatus } from '../src/types/session';
import { TestWitnessError } from '../src/utils/errors';

function expectErrorCode(callback: () => unknown, code: TestWitnessError['code']): void {
  try {
    callback();
    throw new Error('Expected callback to throw');
  } catch (error) {
    expect(error).toBeInstanceOf(TestWitnessError);
    expect((error as TestWitnessError).code).toBe(code);
  }
}

describe('SessionManager', () => {
  it('follows idle -> recording -> paused -> recording -> stopped', () => {
    let now = new Date('2026-09-07T10:00:00.000Z');
    const manager = new SessionManager({
      clock: () => new Date(now),
      idFactory: () => 'session-fixed',
    });

    expect(manager.getStatus()).toBe('idle');
    expect(manager.start()).toMatchObject({
      sessionId: 'session-fixed',
      status: 'recording',
      result: 'not-set',
      durationMs: 0,
      videoStatus: 'off',
    });

    now = new Date('2026-09-07T10:00:02.000Z');
    expect(manager.pause()).toMatchObject({ status: 'paused', durationMs: 2_000 });

    now = new Date('2026-09-07T10:00:05.000Z');
    expect(manager.resume()).toMatchObject({ status: 'recording', durationMs: 5_000 });

    now = new Date('2026-09-07T10:00:08.250Z');
    expect(manager.stop()).toMatchObject({
      status: 'stopped',
      startedAt: '2026-09-07T10:00:00.000Z',
      endedAt: '2026-09-07T10:00:08.250Z',
      durationMs: 8_250,
    });
  });

  it('enforces strict state transitions with typed errors', () => {
    const idleManager = new SessionManager();
    expectErrorCode(() => idleManager.pause(), 'NO_ACTIVE_SESSION');
    expectErrorCode(() => idleManager.resume(), 'NO_ACTIVE_SESSION');
    expectErrorCode(() => idleManager.stop(), 'NO_ACTIVE_SESSION');

    idleManager.start();
    expectErrorCode(() => idleManager.start(), 'SESSION_ALREADY_ACTIVE');
    expectErrorCode(() => idleManager.resume(), 'INVALID_SESSION_STATE');
    idleManager.pause();
    expectErrorCode(() => idleManager.pause(), 'INVALID_SESSION_STATE');
    idleManager.stop();
    expectErrorCode(() => idleManager.start(), 'INVALID_SESSION_STATE');
    expectErrorCode(() => idleManager.setResult('passed'), 'NO_ACTIVE_SESSION');
  });

  it('holds a cross-instance active-session lease until the owner stops', () => {
    const first = new SessionManager({ idFactory: () => 'session-one' });
    const second = new SessionManager({ idFactory: () => 'session-two' });

    first.start();
    expectErrorCode(() => second.start(), 'SESSION_ALREADY_ACTIVE');

    first.stop();
    expect(second.start().sessionId).toBe('session-two');
    second.stop();
  });

  it('sets all supported tester results while recording or paused', () => {
    const manager = new SessionManager();
    manager.start();

    expect(manager.setResult('failed').result).toBe('failed');
    manager.pause();
    expect(manager.setResult('blocked').result).toBe('blocked');
    expect(manager.setResult('not-set').result).toBe('not-set');
    expectErrorCode(
      () => manager.setResult('unexpected' as SessionResultStatus),
      'INVALID_SESSION_STATE',
    );

    manager.stop();
  });

  it('includes supplied evidence metrics and clamps negative sizes', () => {
    const manager = new SessionManager();
    manager.start();

    const summary = manager.getSummary({
      evidence: { screenshots: 2, actions: 4, hasVideo: true },
      approximateSizeBytes: -100,
      memoryWarningReached: true,
      videoStatus: 'captured',
    });

    expect(summary.evidence).toEqual({
      screenshots: 2,
      actions: 4,
      consoleLogs: 0,
      networkRequests: 0,
      successfulRequests: 0,
      networkErrors: 0,
      notes: 0,
      hasVideo: true,
    });
    expect(summary.approximateSizeBytes).toBe(0);
    expect(summary.memoryWarningReached).toBe(true);
    expect(summary.videoStatus).toBe('captured');

    manager.stop();
  });

  it('never reports a negative duration if the wall clock moves backwards', () => {
    let now = new Date('2026-09-07T10:00:10.000Z');
    const manager = new SessionManager({ clock: () => new Date(now) });
    manager.start();

    now = new Date('2026-09-07T10:00:00.000Z');
    expect(manager.stop().durationMs).toBe(0);
  });
});
