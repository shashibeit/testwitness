import { afterEach, describe, expect, it, vi } from 'vitest';

import { AutomaticScreenshotScheduler } from '../src/capture/AutomaticScreenshotScheduler';
import type { ResolvedTestWitnessConfig } from '../src/types/config';

const CONFIG: ResolvedTestWitnessConfig['screenshot'] = {
  enabled: true,
  format: 'png',
  quality: 0.92,
  captureOnError: true,
  captureOnStart: true,
  captureOnNavigation: true,
  autoCaptureIntervalSeconds: 0,
  maxAutomaticScreenshots: 50,
};

afterEach(() => {
  vi.useRealTimers();
});

describe('AutomaticScreenshotScheduler', () => {
  it('captures after session start and coalesces navigation triggers', async () => {
    vi.useFakeTimers();
    const capture = vi.fn(() => Promise.resolve());
    const scheduler = new AutomaticScreenshotScheduler({
      config: CONFIG,
      capture,
      canCapture: () => true,
      onError: vi.fn(),
      onLimitReached: vi.fn(),
    });

    scheduler.start();
    scheduler.navigation();
    scheduler.navigation();
    await vi.advanceTimersByTimeAsync(150);

    expect(capture).toHaveBeenCalledOnce();
    expect(capture).toHaveBeenCalledWith('Session started');

    scheduler.navigation();
    await vi.advanceTimersByTimeAsync(150);
    expect(capture).toHaveBeenLastCalledWith('Page navigation');
    expect(capture).toHaveBeenCalledTimes(2);
    await scheduler.stop();
  });

  it('captures periodic checkpoints only while capture is allowed', async () => {
    vi.useFakeTimers();
    let allowed = true;
    const capture = vi.fn(() => Promise.resolve());
    const scheduler = new AutomaticScreenshotScheduler({
      config: {
        ...CONFIG,
        captureOnStart: false,
        autoCaptureIntervalSeconds: 5,
      },
      capture,
      canCapture: () => allowed,
      onError: vi.fn(),
      onLimitReached: vi.fn(),
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(5_150);
    expect(capture).toHaveBeenCalledWith('Automatic checkpoint');

    allowed = false;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(capture).toHaveBeenCalledOnce();

    allowed = true;
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(150);
    expect(capture).toHaveBeenCalledTimes(2);
    await scheduler.stop();
  });

  it('enforces the automatic limit without blocking manual capture code', async () => {
    vi.useFakeTimers();
    const capture = vi.fn(() => Promise.resolve());
    const onLimitReached = vi.fn();
    const scheduler = new AutomaticScreenshotScheduler({
      config: { ...CONFIG, captureOnStart: false, maxAutomaticScreenshots: 2 },
      capture,
      canCapture: () => true,
      onError: vi.fn(),
      onLimitReached,
      settleDelayMs: 0,
    });

    scheduler.start();
    scheduler.request('First');
    await scheduler.drain();
    scheduler.request('Second');
    await scheduler.drain();
    scheduler.request('Third');
    scheduler.request('Fourth');

    expect(capture).toHaveBeenCalledTimes(2);
    expect(onLimitReached).toHaveBeenCalledOnce();
    expect(onLimitReached).toHaveBeenCalledWith(2);
    await scheduler.stop();
  });

  it('reports a failed automatic capture and permits a later retry', async () => {
    vi.useFakeTimers();
    const failure = new Error('renderer failed');
    const capture = vi
      .fn<(_: string) => Promise<void>>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce();
    const onError = vi.fn();
    const onLimitReached = vi.fn();
    const scheduler = new AutomaticScreenshotScheduler({
      config: { ...CONFIG, captureOnStart: false, maxAutomaticScreenshots: 2 },
      capture,
      canCapture: () => true,
      onError,
      onLimitReached,
      settleDelayMs: 0,
    });

    scheduler.start();
    scheduler.error('Console error');
    await scheduler.drain();
    scheduler.error('Failed network request');
    await scheduler.drain();
    scheduler.error('Another failed request');

    expect(onError).toHaveBeenCalledWith(failure);
    expect(capture).toHaveBeenCalledTimes(2);
    expect(onLimitReached).toHaveBeenCalledOnce();
    await scheduler.stop();
  });

  it('cancels delayed and periodic work at stop', async () => {
    vi.useFakeTimers();
    const capture = vi.fn(() => Promise.resolve());
    const scheduler = new AutomaticScreenshotScheduler({
      config: { ...CONFIG, autoCaptureIntervalSeconds: 1 },
      capture,
      canCapture: () => true,
      onError: vi.fn(),
      onLimitReached: vi.fn(),
    });

    scheduler.start();
    await scheduler.stop();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(capture).not.toHaveBeenCalled();
  });
});
