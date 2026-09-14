import { describe, expect, it, vi } from 'vitest';

import { InMemoryEvidenceStore } from '../src/evidence/EvidenceStore';
import type {
  ActionRecord,
  ConsoleLogRecord,
  NetworkErrorRecord,
  NetworkRequestRecord,
  NoteRecord,
  ScreenshotRecord,
  VideoRecord,
} from '../src/types/evidence';
import type { SessionMetadata } from '../src/types/session';

function metadata(sessionId = 'session-1'): SessionMetadata {
  return {
    sessionId,
    applicationName: 'Portal',
    environment: 'QA',
    startedAt: '2026-09-07T12:00:00.000Z',
    durationMs: 0,
    currentUrl: 'https://example.test/',
    pageTitle: 'Portal',
    browser: { name: 'Chrome', version: '140' },
    operatingSystem: { name: 'macOS' },
    viewport: { width: 1280, height: 720 },
    screen: { width: 1920, height: 1080 },
    libraryVersion: '0.1.0',
    result: 'not-set',
    custom: { locale: '日本語' },
  };
}

const action = (): ActionRecord => ({
  sequence: 1,
  timestamp: '2026-09-07T12:00:01.000Z',
  type: 'click',
  elementTag: 'button',
  url: 'https://example.test/',
});

const note = (): NoteRecord => ({
  id: 'note-1',
  timestamp: '2026-09-07T12:00:02.000Z',
  text: 'Validated login',
  url: 'https://example.test/',
  actionSequence: 1,
});

function screenshot(blob: Blob): ScreenshotRecord {
  return {
    id: 'screenshot-1',
    timestamp: '2026-09-07T12:00:03.000Z',
    label: 'Login',
    url: 'https://example.test/',
    actionSequence: 1,
    blob,
    fileName: '001-login.png',
  };
}

function video(blob: Blob, id = 'video-1'): VideoRecord {
  return {
    id,
    startedAt: '2026-09-07T12:00:00.000Z',
    endedAt: '2026-09-07T12:00:10.000Z',
    durationMs: 10_000,
    mimeType: 'video/webm',
    blob,
    fileName: 'recording.webm',
    stopReason: 'session-stopped',
  };
}

describe('InMemoryEvidenceStore', () => {
  it('stores every evidence kind and reports counts', () => {
    const store = new InMemoryEvidenceStore();
    const image = new Blob(['image']);
    const recording = new Blob(['recording']);
    const consoleLog: ConsoleLogRecord = {
      id: 'console-1',
      timestamp: '2026-09-07T12:00:01.000Z',
      level: 'error',
      message: 'Failure',
      arguments: [{ code: 500 }],
      url: 'https://example.test/',
    };
    const networkError: NetworkErrorRecord = {
      id: 'network-1',
      timestamp: '2026-09-07T12:00:01.000Z',
      transport: 'fetch',
      method: 'GET',
      url: 'https://example.test/api',
      status: 500,
      durationMs: 12,
      failureType: 'http-error',
    };
    const networkRequest: NetworkRequestRecord = {
      id: 'request-1',
      timestamp: '2026-09-07T12:00:00.500Z',
      transport: 'fetch',
      method: 'GET',
      url: 'https://example.test/api/health',
      status: 200,
      durationMs: 8,
      outcome: 'success',
    };

    store.reset(metadata());
    store.addScreenshot(screenshot(image));
    store.addAction(action());
    store.addConsoleLog(consoleLog);
    store.addNetworkRequest(networkRequest);
    store.addNetworkError(networkError);
    store.addNote(note());
    store.setVideo(video(recording));

    expect(store.getCounts()).toEqual({
      screenshots: 1,
      actions: 1,
      consoleLogs: 1,
      networkRequests: 1,
      successfulRequests: 1,
      networkErrors: 1,
      notes: 1,
      hasVideo: true,
    });
    expect(store.getApproximateSizeBytes()).toBeGreaterThan(image.size + recording.size);
  });

  it('copies values on ingress and returns recursively frozen snapshots', () => {
    const store = new InMemoryEvidenceStore();
    const sourceMetadata = metadata();
    const sourceAction = action();
    const argument = { password: '[REDACTED]' };
    const log: ConsoleLogRecord = {
      id: 'console-1',
      timestamp: '2026-09-07T12:00:01.000Z',
      level: 'warn',
      message: 'warning',
      arguments: [argument],
      url: 'https://example.test/',
    };
    const blob = new Blob(['immutable']);

    store.reset(sourceMetadata);
    store.addAction(sourceAction);
    store.addConsoleLog(log);
    store.addScreenshot(screenshot(blob));
    sourceMetadata.browser.name = 'Changed';
    sourceMetadata.custom.locale = 'changed';
    sourceAction.url = 'https://changed.test/';
    argument.password = 'changed';

    const snapshot = store.getSnapshot();
    expect(snapshot.metadata.browser.name).toBe('Chrome');
    expect(snapshot.metadata.custom.locale).toBe('日本語');
    expect(snapshot.actions[0]?.url).toBe('https://example.test/');
    expect(snapshot.consoleLogs[0]?.arguments[0]).toEqual({ password: '[REDACTED]' });
    expect(snapshot.screenshots[0]?.blob).toBe(blob);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.metadata.browser)).toBe(true);
    expect(Object.isFrozen(snapshot.consoleLogs[0]?.arguments[0])).toBe(true);
    expect(Object.isFrozen(snapshot.actions)).toBe(true);
  });

  it('emits one warning per reset after crossing the threshold', () => {
    const initialMetadata = metadata();
    const metadataBytes = new TextEncoder().encode(JSON.stringify(initialMetadata)).byteLength;
    const onMemoryWarning = vi.fn();
    const store = new InMemoryEvidenceStore({
      warningThresholdBytes: metadataBytes + 1,
      onMemoryWarning,
    });

    store.reset(initialMetadata);
    expect(onMemoryWarning).not.toHaveBeenCalled();
    store.addNote(note());
    store.addNote({ ...note(), id: 'note-2' });

    expect(onMemoryWarning).toHaveBeenCalledOnce();
    expect(onMemoryWarning).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-1', thresholdBytes: metadataBytes + 1 }),
    );
    expect(store.hasMemoryWarning()).toBe(true);

    store.reset(metadata('session-2'));
    store.addNote(note());
    expect(onMemoryWarning).toHaveBeenCalledTimes(2);
  });

  it('subtracts the previous video size when replacing it', () => {
    const store = new InMemoryEvidenceStore();
    store.reset(metadata());
    const baseline = store.getApproximateSizeBytes();
    store.setVideo(video(new Blob(['a'.repeat(1_000)]), 'large'));
    const withLargeVideo = store.getApproximateSizeBytes();
    store.setVideo(video(new Blob(['b']), 'small'));
    const withSmallVideo = store.getApproximateSizeBytes();

    expect(withLargeVideo).toBeGreaterThan(withSmallVideo);
    expect(withSmallVideo).toBeGreaterThan(baseline);
    expect(store.getSnapshot().video?.id).toBe('small');
  });

  it('replaces completed metadata without retaining caller mutations', () => {
    const store = new InMemoryEvidenceStore();
    store.reset(metadata());
    const completed = {
      ...metadata(),
      endedAt: '2026-09-07T12:01:00.000Z',
      durationMs: 60_000,
      result: 'passed' as const,
    };
    store.completeMetadata(completed);
    completed.browser.name = 'Changed';

    expect(store.getSnapshot().metadata).toMatchObject({
      endedAt: '2026-09-07T12:01:00.000Z',
      durationMs: 60_000,
      result: 'passed',
    });
    expect(store.getSnapshot().metadata.browser.name).toBe('Chrome');
  });

  it('clear releases all retained evidence and rearms the store', () => {
    const store = new InMemoryEvidenceStore();
    store.reset(metadata());
    store.addNote(note());
    store.setVideo(video(new Blob(['recording'])));
    store.clear();

    expect(store.getCounts()).toEqual({
      screenshots: 0,
      actions: 0,
      consoleLogs: 0,
      networkRequests: 0,
      successfulRequests: 0,
      networkErrors: 0,
      notes: 0,
      hasVideo: false,
    });
    expect(store.getApproximateSizeBytes()).toBe(0);
    expect(store.hasMemoryWarning()).toBe(false);
    expect(() => store.getSnapshot()).toThrowError(
      expect.objectContaining({ code: 'INVALID_SESSION_STATE' }),
    );
  });

  it('rejects invalid thresholds and evidence before reset', () => {
    expect(() => new InMemoryEvidenceStore({ warningThresholdBytes: 0 })).toThrowError(
      expect.objectContaining({ code: 'INVALID_CONFIG' }),
    );
    const store = new InMemoryEvidenceStore();
    expect(() => store.addAction(action())).toThrowError(
      expect.objectContaining({ code: 'INVALID_SESSION_STATE' }),
    );
  });
});
