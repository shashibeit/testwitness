import { describe, expect, it, vi } from 'vitest';

import { ScreenshotCapture } from '../src/capture/ScreenshotCapture';
import { DataSanitizer } from '../src/privacy/DataSanitizer';
import type { ElementMasker } from '../src/privacy/ElementMasker';
import type { ResolvedTestWitnessConfig } from '../src/types/config';
import { TestWitnessError } from '../src/utils/errors';

const SCREENSHOT_CONFIG: ResolvedTestWitnessConfig['screenshot'] = {
  enabled: true,
  format: 'png',
  quality: 0.92,
  captureOnError: false,
  captureOnStart: true,
  captureOnNavigation: true,
  autoCaptureIntervalSeconds: 0,
  maxAutomaticScreenshots: 50,
};

function masker(restore = vi.fn()): ElementMasker {
  return {
    prepare: () => ({ filter: () => true, restore }),
  } as unknown as ElementMasker;
}

function fakeCanvas(): HTMLCanvasElement {
  return document.createElement('canvas');
}

describe('ScreenshotCapture', () => {
  it('returns a typed record and privacy-safe deterministic filename', async () => {
    window.history.replaceState(null, '', '/page?access_token=secret');
    const render = vi.fn((node: HTMLElement) => {
      expect(node).toBeInstanceOf(HTMLElement);
      return Promise.resolve(fakeCanvas());
    });
    const encoder = vi.fn(() => Promise.resolve(new Blob(['png'], { type: 'image/png' })));
    const restore = vi.fn();
    let suppressionCalls = 0;
    const suppress = async <Result>(operation: () => Promise<Result>): Promise<Result> => {
      suppressionCalls += 1;
      return await operation();
    };
    const capture = new ScreenshotCapture({
      config: SCREENSHOT_CONFIG,
      sanitizer: new DataSanitizer(),
      masker: masker(restore),
      actionSequenceProvider: () => 12,
      renderer: render,
      canvasEncoder: encoder,
      runWithoutNetworkRecording: suppress,
      timestampProvider: () => '2026-09-07T19:00:00.000Z',
      idFactory: () => 'screenshot-1',
      document,
      window,
    });

    const record = await capture.capture('Login completed / token=private');

    expect(record).toMatchObject({
      id: 'screenshot-1',
      timestamp: '2026-09-07T19:00:00.000Z',
      label: 'Login completed / token=[REDACTED]',
      actionSequence: 12,
      fileName: '001-login-completed-token-redacted.png',
    });
    expect(record.url).not.toContain('secret');
    expect(record.blob.type).toBe('image/png');
    expect(render).toHaveBeenCalledOnce();
    expect(render.mock.calls[0]?.[0]).toBe(document.body);
    expect(suppressionCalls).toBe(1);
    expect(restore).toHaveBeenCalledOnce();
  });

  it('always restores masking and wraps renderer security failures', async () => {
    const restore = vi.fn();
    const capture = new ScreenshotCapture({
      config: SCREENSHOT_CONFIG,
      sanitizer: new DataSanitizer(),
      masker: masker(restore),
      actionSequenceProvider: () => 0,
      renderer: () => Promise.reject(new DOMException('Canvas is tainted', 'SecurityError')),
      document,
      window,
    });

    const result = capture.capture();
    await expect(result).rejects.toBeInstanceOf(TestWitnessError);
    await result.catch((error: unknown) => {
      expect(error).toBeInstanceOf(TestWitnessError);
      if (error instanceof TestWitnessError) {
        expect(error.code).toBe('SCREENSHOT_FAILED');
        expect(error.message).toContain('Canvas is tainted');
      }
    });
    expect(restore).toHaveBeenCalledOnce();
  });

  it('serializes concurrent captures and continues after a failure', async () => {
    let active = 0;
    let maximumActive = 0;
    let invocation = 0;
    const render = vi.fn(async () => {
      invocation += 1;
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      active -= 1;
      if (invocation === 1) throw new Error('first failed');
      return fakeCanvas();
    });
    const capture = new ScreenshotCapture({
      config: SCREENSHOT_CONFIG,
      sanitizer: new DataSanitizer(),
      masker: masker(),
      actionSequenceProvider: () => 0,
      renderer: render,
      canvasEncoder: () => Promise.resolve(new Blob(['ok'])),
      document,
      window,
    });

    const first = capture.capture('First');
    const second = capture.capture('Second');

    await expect(first).rejects.toBeInstanceOf(TestWitnessError);
    await expect(second).resolves.toMatchObject({ fileName: '001-second.png' });
    expect(maximumActive).toBe(1);
  });

  it('throws a typed error when screenshots are disabled', async () => {
    const capture = new ScreenshotCapture({
      config: { ...SCREENSHOT_CONFIG, enabled: false },
      sanitizer: new DataSanitizer(),
      masker: masker(),
      actionSequenceProvider: () => 0,
      document,
      window,
    });

    await expect(capture.capture()).rejects.toMatchObject({ code: 'SCREENSHOT_DISABLED' });
  });
});
