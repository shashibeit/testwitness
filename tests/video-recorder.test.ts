import { afterEach, describe, expect, it, vi } from 'vitest';

import { VideoRecorder, type MediaRecorderConstructor } from '../src/capture/VideoRecorder';
import type { ResolvedTestWitnessConfig } from '../src/types/config';
import type { VideoRecord } from '../src/types/evidence';
import { TestWitnessError } from '../src/utils/errors';

const VIDEO_CONFIG: ResolvedTestWitnessConfig['video'] = {
  enabled: true,
  mimeType: 'video/webm;codecs=vp9',
  maxDurationMinutes: 30,
  includeAudio: false,
};

class FakeTrack extends EventTarget {
  public stopCalls = 0;

  public constructor(private readonly displaySurface: DisplayCaptureSurfaceType = 'browser') {
    super();
  }

  public getSettings(): MediaTrackSettings {
    return { displaySurface: this.displaySurface };
  }

  public stop(): void {
    this.stopCalls += 1;
  }

  public userEnd(): void {
    this.dispatchEvent(new Event('ended'));
  }
}

class FakeStream {
  public constructor(
    public readonly videoTracks: FakeTrack[],
    public readonly otherTracks: FakeTrack[] = [],
  ) {}

  public getVideoTracks(): MediaStreamTrack[] {
    return this.videoTracks as unknown as MediaStreamTrack[];
  }

  public getTracks(): MediaStreamTrack[] {
    return [...this.videoTracks, ...this.otherTracks] as unknown as MediaStreamTrack[];
  }
}

class FakeMediaRecorder extends EventTarget {
  public static instances: FakeMediaRecorder[] = [];
  public static supported = new Set([
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ]);
  public static throwOnStart = false;
  public static throwOnStopAfterQueue = false;
  public static emitFinalData = true;
  public static emitStopEvent = true;

  public static isTypeSupported(mimeType: string): boolean {
    return this.supported.has(mimeType);
  }

  public state: RecordingState = 'inactive';
  public readonly mimeType: string;
  public readonly stream: MediaStream;
  public stopCalls = 0;

  public constructor(stream: MediaStream, options?: MediaRecorderOptions) {
    super();
    this.stream = stream;
    this.mimeType = options?.mimeType ?? 'video/webm';
    FakeMediaRecorder.instances.push(this);
  }

  public start(): void {
    if (FakeMediaRecorder.throwOnStart) throw new Error('start failed');
    this.state = 'recording';
  }

  public pause(): void {
    this.state = 'paused';
  }

  public resume(): void {
    this.state = 'recording';
  }

  public stop(): void {
    this.stopCalls += 1;
    this.state = 'inactive';
    queueMicrotask(() => {
      if (FakeMediaRecorder.emitFinalData) {
        this.emitData(new Blob(['final-chunk'], { type: this.mimeType }));
      }
      if (FakeMediaRecorder.emitStopEvent) this.dispatchEvent(new Event('stop'));
    });
    if (FakeMediaRecorder.throwOnStopAfterQueue) {
      throw new DOMException('recorder became inactive', 'InvalidStateError');
    }
  }

  public endNatively(data = new Blob(['native-final-chunk'], { type: this.mimeType })): void {
    this.state = 'inactive';
    queueMicrotask(() => {
      this.emitData(data);
      this.dispatchEvent(new Event('stop'));
    });
  }

  public failNatively(
    error: unknown,
    data = new Blob(['error-final-chunk'], { type: this.mimeType }),
  ): void {
    this.state = 'inactive';
    const errorEvent = new Event('error');
    Object.defineProperty(errorEvent, 'error', { value: error });
    this.dispatchEvent(errorEvent);
    queueMicrotask(() => {
      this.emitData(data);
      this.dispatchEvent(new Event('stop'));
    });
  }

  public emitData(data: Blob): void {
    const event = new Event('dataavailable');
    Object.defineProperty(event, 'data', { value: data });
    this.dispatchEvent(event);
  }
}

function recorderConstructor(): MediaRecorderConstructor {
  return FakeMediaRecorder as unknown as MediaRecorderConstructor;
}

function navigatorWithStream(stream: FakeStream): {
  navigator: Navigator;
  getDisplayMedia: ReturnType<typeof vi.fn>;
} {
  const getDisplayMedia = vi.fn(() => Promise.resolve(stream as unknown as MediaStream));
  return {
    navigator: {
      mediaDevices: {
        getDisplayMedia,
        getSupportedConstraints: () => ({ displaySurface: true }),
      },
    } as unknown as Navigator,
    getDisplayMedia,
  };
}

afterEach(() => {
  vi.useRealTimers();
  FakeMediaRecorder.instances = [];
  FakeMediaRecorder.supported = new Set([
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ]);
  FakeMediaRecorder.throwOnStart = false;
  FakeMediaRecorder.throwOnStopAfterQueue = false;
  FakeMediaRecorder.emitFinalData = true;
  FakeMediaRecorder.emitStopEvent = true;
});

// These unit tests use deterministic media fakes; they do not cover a real browser chooser.
describe('VideoRecorder', () => {
  it('honors an explicit per-session video choice over the configured default', async () => {
    const disabledEnvironment = navigatorWithStream(new FakeStream([new FakeTrack()]));
    const disabledForSession = new VideoRecorder({
      config: VIDEO_CONFIG,
      navigator: disabledEnvironment.navigator,
      mediaRecorderConstructor: recorderConstructor(),
    });

    await disabledForSession.start(false);
    expect(disabledEnvironment.getDisplayMedia).not.toHaveBeenCalled();
    expect(disabledForSession.getState()).toBe('idle');

    const enabledEnvironment = navigatorWithStream(new FakeStream([new FakeTrack()]));
    const enabledForSession = new VideoRecorder({
      config: { ...VIDEO_CONFIG, enabled: false },
      navigator: enabledEnvironment.navigator,
      mediaRecorderConstructor: recorderConstructor(),
    });

    await enabledForSession.start(true);
    expect(enabledEnvironment.getDisplayMedia).toHaveBeenCalledOnce();
    expect(enabledForSession.getState()).toBe('recording');
    await enabledForSession.stop();
  });

  it('reports unsupported browser media APIs clearly', async () => {
    const recorder = new VideoRecorder({
      config: VIDEO_CONFIG,
      navigator: {} as Navigator,
      mediaRecorderConstructor: undefined,
    });

    await expect(recorder.start()).rejects.toMatchObject({ code: 'VIDEO_UNSUPPORTED' });
  });

  it('calls getDisplayMedia immediately with audio disabled and maps permission denial', async () => {
    let requested = false;
    const permissionError = new DOMException('denied', 'NotAllowedError');
    const getDisplayMedia = vi.fn(() => {
      requested = true;
      return Promise.reject(permissionError);
    });
    const recorder = new VideoRecorder({
      config: VIDEO_CONFIG,
      navigator: {
        mediaDevices: {
          getDisplayMedia,
          getSupportedConstraints: () => ({ displaySurface: true }),
        },
      } as unknown as Navigator,
      mediaRecorderConstructor: recorderConstructor(),
    });

    const start = recorder.start();
    expect(requested).toBe(true);
    await expect(start).rejects.toMatchObject({ code: 'VIDEO_PERMISSION_DENIED' });
    expect(getDisplayMedia).toHaveBeenCalledWith({
      audio: false,
      video: { displaySurface: 'browser' },
    });
    expect(recorder.getState()).toBe('idle');
  });

  it('uses broadly compatible display constraints when displaySurface is unsupported', async () => {
    const stream = new FakeStream([new FakeTrack()]);
    const getDisplayMedia = vi.fn(() => Promise.resolve(stream as unknown as MediaStream));
    const recorder = new VideoRecorder({
      config: VIDEO_CONFIG,
      navigator: {
        mediaDevices: {
          getDisplayMedia,
          getSupportedConstraints: () => ({ displaySurface: false }),
        },
      } as unknown as Navigator,
      mediaRecorderConstructor: recorderConstructor(),
    });

    await recorder.start();

    expect(getDisplayMedia).toHaveBeenCalledWith({ audio: false, video: true });
    await recorder.stop();
  });

  it('records final chunks, reports states, and stops every media track', async () => {
    const videoTrack = new FakeTrack();
    const audioTrack = new FakeTrack();
    const { navigator } = navigatorWithStream(new FakeStream([videoTrack], [audioTrack]));
    const states: string[] = [];
    const finalized: VideoRecord[] = [];
    const recorder = new VideoRecorder({
      config: VIDEO_CONFIG,
      navigator,
      mediaRecorderConstructor: recorderConstructor(),
      clock: () => new Date('2026-09-07T20:00:00.000Z'),
      monotonicTimeProvider: () => 100,
      idFactory: () => 'video-1',
      onStateChange: (state) => states.push(state),
      onFinalized: (record) => finalized.push(record),
    });
    await recorder.start();
    FakeMediaRecorder.instances[0]?.emitData(new Blob(['first']));

    const firstStop = recorder.stop();
    const secondStop = recorder.stop();
    expect(secondStop).toBe(firstStop);
    expect(videoTrack.stopCalls).toBe(0);
    expect(audioTrack.stopCalls).toBe(0);
    const record = await firstStop;

    expect(record).toMatchObject({
      id: 'video-1',
      mimeType: 'video/webm;codecs=vp9',
      fileName: 'recording.webm',
      stopReason: 'session-stopped',
    });
    expect(record?.blob.size).toBeGreaterThan(new Blob(['first']).size);
    expect(finalized).toHaveLength(1);
    expect(videoTrack.stopCalls).toBe(1);
    expect(audioTrack.stopCalls).toBe(1);
    expect(states).toEqual(['requesting-permission', 'recording', 'stopping', 'stopped']);
  });

  it('retains the native final chunk when the recorder becomes inactive before track-ended handling', async () => {
    const track = new FakeTrack();
    const { navigator } = navigatorWithStream(new FakeStream([track]));
    const recorder = new VideoRecorder({
      config: VIDEO_CONFIG,
      navigator,
      mediaRecorderConstructor: recorderConstructor(),
    });
    await recorder.start();
    const nativeRecorder = FakeMediaRecorder.instances[0]!;

    nativeRecorder.endNatively(new Blob(['important-final-data']));
    track.userEnd();
    expect(track.stopCalls).toBe(0);
    const record = await recorder.stop();

    expect(record?.blob.size).toBe(new Blob(['important-final-data']).size);
    expect(record?.stopReason).toBe('user-ended-sharing');
    expect(track.stopCalls).toBe(1);
  });

  it('waits for queued final media when stop throws after the recorder becomes inactive', async () => {
    FakeMediaRecorder.throwOnStopAfterQueue = true;
    const track = new FakeTrack();
    const { navigator } = navigatorWithStream(new FakeStream([track]));
    const errors: unknown[] = [];
    const recorder = new VideoRecorder({
      config: VIDEO_CONFIG,
      navigator,
      mediaRecorderConstructor: recorderConstructor(),
      onError: (error) => errors.push(error),
    });
    await recorder.start();

    const record = await recorder.stop();

    expect(record?.blob.size).toBe(new Blob(['final-chunk']).size);
    expect(record?.stopReason).toBe('session-stopped');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ code: 'VIDEO_RECORDING_FAILED' });
    expect(track.stopCalls).toBe(1);
  });

  it('retains the final chunk delivered after a native recorder error', async () => {
    const track = new FakeTrack();
    const { navigator } = navigatorWithStream(new FakeStream([track]));
    const errors: unknown[] = [];
    const recorder = new VideoRecorder({
      config: VIDEO_CONFIG,
      navigator,
      mediaRecorderConstructor: recorderConstructor(),
      onError: (error) => errors.push(error),
    });
    await recorder.start();
    const nativeRecorder = FakeMediaRecorder.instances[0]!;

    nativeRecorder.failNatively(new DOMException('encoder failed', 'UnknownError'));
    const record = await recorder.stop();

    expect(record?.blob.size).toBe(new Blob(['error-final-chunk']).size);
    expect(record?.stopReason).toBe('recorder-error');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ code: 'VIDEO_RECORDING_FAILED' });
    expect(track.stopCalls).toBe(1);
  });

  it('uses a watchdog when the browser never emits stop and preserves buffered media', async () => {
    vi.useFakeTimers();
    FakeMediaRecorder.emitStopEvent = false;
    const track = new FakeTrack();
    const { navigator } = navigatorWithStream(new FakeStream([track]));
    const errors: unknown[] = [];
    const recorder = new VideoRecorder({
      config: VIDEO_CONFIG,
      navigator,
      mediaRecorderConstructor: recorderConstructor(),
      onError: (error) => errors.push(error),
    });
    await recorder.start();

    const pending = recorder.stop();
    await vi.advanceTimersByTimeAsync(5_000);
    const record = await pending;

    expect(record?.blob.size).toBeGreaterThan(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(TestWitnessError);
    expect(errors[0]).toMatchObject({ code: 'VIDEO_RECORDING_FAILED' });
    expect((errors[0] as TestWitnessError).message).toContain('did not finish video finalization');
    expect(track.stopCalls).toBe(1);
  });

  it('does not advertise an empty recording as captured evidence', async () => {
    FakeMediaRecorder.emitFinalData = false;
    const track = new FakeTrack();
    const { navigator } = navigatorWithStream(new FakeStream([track]));
    const finalized: VideoRecord[] = [];
    const errors: unknown[] = [];
    const recorder = new VideoRecorder({
      config: VIDEO_CONFIG,
      navigator,
      mediaRecorderConstructor: recorderConstructor(),
      onFinalized: (record) => finalized.push(record),
      onError: (error) => errors.push(error),
    });
    await recorder.start();

    const record = await recorder.stop();

    expect(record).toBeUndefined();
    expect(finalized).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(TestWitnessError);
    expect(errors[0]).toMatchObject({ code: 'VIDEO_RECORDING_FAILED' });
    expect((errors[0] as TestWitnessError).message).toContain('without producing media data');
    expect(track.stopCalls).toBe(1);
  });

  it('counts only active time toward the automatic duration limit', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-07T20:00:00.000Z') });
    const track = new FakeTrack();
    const { navigator } = navigatorWithStream(new FakeStream([track]));
    const finalized: VideoRecord[] = [];
    const recorder = new VideoRecorder({
      config: { ...VIDEO_CONFIG, maxDurationMinutes: 0.001 },
      navigator,
      mediaRecorderConstructor: recorderConstructor(),
      clock: () => new Date(Date.now()),
      monotonicTimeProvider: () => Date.now(),
      onFinalized: (record) => finalized.push(record),
    });
    await recorder.start();

    await vi.advanceTimersByTimeAsync(30);
    recorder.pause();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(recorder.getState()).toBe('paused');
    recorder.resume();
    await vi.advanceTimersByTimeAsync(30);
    await Promise.resolve();

    expect(recorder.getState()).toBe('stopped');
    expect(finalized[0]?.stopReason).toBe('duration-limit');
    expect(finalized[0]?.durationMs).toBe(60);
  });

  it('handles the user ending tab sharing without ending other evidence concerns', async () => {
    const track = new FakeTrack();
    const { navigator } = navigatorWithStream(new FakeStream([track]));
    const recorder = new VideoRecorder({
      config: VIDEO_CONFIG,
      navigator,
      mediaRecorderConstructor: recorderConstructor(),
    });
    await recorder.start();

    track.userEnd();
    const record = await recorder.stop();

    expect(record?.stopReason).toBe('user-ended-sharing');
    expect(recorder.getState()).toBe('stopped');
  });

  it('rejects a non-tab surface and releases its track', async () => {
    const track = new FakeTrack('monitor');
    const { navigator } = navigatorWithStream(new FakeStream([track]));
    const recorder = new VideoRecorder({
      config: VIDEO_CONFIG,
      navigator,
      mediaRecorderConstructor: recorderConstructor(),
    });

    await expect(recorder.start()).rejects.toMatchObject({ code: 'VIDEO_START_FAILED' });
    expect(track.stopCalls).toBe(1);
    expect(recorder.getState()).toBe('idle');
  });

  it('falls back to a supported WebM MIME and cleans up start failures', async () => {
    FakeMediaRecorder.supported = new Set(['video/webm']);
    const track = new FakeTrack();
    const { navigator } = navigatorWithStream(new FakeStream([track]));
    const recorder = new VideoRecorder({
      config: VIDEO_CONFIG,
      navigator,
      mediaRecorderConstructor: recorderConstructor(),
    });
    await recorder.start();
    expect(FakeMediaRecorder.instances[0]?.mimeType).toBe('video/webm');
    await recorder.stop();

    FakeMediaRecorder.throwOnStart = true;
    const failedTrack = new FakeTrack();
    const failedEnvironment = navigatorWithStream(new FakeStream([failedTrack]));
    const failedRecorder = new VideoRecorder({
      config: VIDEO_CONFIG,
      navigator: failedEnvironment.navigator,
      mediaRecorderConstructor: recorderConstructor(),
    });
    await expect(failedRecorder.start()).rejects.toBeInstanceOf(TestWitnessError);
    expect(failedTrack.stopCalls).toBe(1);
  });

  it('rejects unsupported WebM encoders before requesting display permission', async () => {
    FakeMediaRecorder.supported.clear();
    const environment = navigatorWithStream(new FakeStream([new FakeTrack()]));
    const recorder = new VideoRecorder({
      config: VIDEO_CONFIG,
      navigator: environment.navigator,
      mediaRecorderConstructor: recorderConstructor(),
    });

    await expect(recorder.start()).rejects.toMatchObject({ code: 'VIDEO_UNSUPPORTED' });
    expect(environment.getDisplayMedia).not.toHaveBeenCalled();
  });
});
