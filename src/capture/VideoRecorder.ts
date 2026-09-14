import type { ResolvedTestWitnessConfig } from '../types/config';
import type { VideoRecord } from '../types/evidence';
import { TestWitnessError } from '../utils/errors';
import { createId } from '../utils/ids';
import { systemClock, toIsoTimestamp, type Clock } from '../utils/timestamps';

export type VideoRecorderState =
  'idle' | 'requesting-permission' | 'recording' | 'paused' | 'stopping' | 'stopped';

export type VideoStopReason = VideoRecord['stopReason'];

const FINALIZATION_TIMEOUT_MS = 5_000;

export interface MediaRecorderConstructor {
  new (stream: MediaStream, options?: MediaRecorderOptions): MediaRecorder;
  isTypeSupported?: (mimeType: string) => boolean;
}

export interface VideoRecorderOptions {
  config: ResolvedTestWitnessConfig['video'];
  navigator?: Navigator;
  mediaRecorderConstructor?: MediaRecorderConstructor;
  clock?: Clock;
  monotonicTimeProvider?: () => number;
  idFactory?: () => string;
  onStateChange?: (state: VideoRecorderState) => void;
  onFinalized?: (record: VideoRecord) => void;
  onError?: (error: unknown) => void;
  setTimer?: (handler: () => void, timeoutMs: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (handle: ReturnType<typeof setTimeout>) => void;
}

interface Completion {
  promise: Promise<VideoRecord | undefined>;
  resolve: (record: VideoRecord | undefined) => void;
}

function createCompletion(): Completion {
  let resolve: ((record: VideoRecord | undefined) => void) | undefined;
  const promise = new Promise<VideoRecord | undefined>((complete) => {
    resolve = complete;
  });
  return { promise, resolve: (record) => resolve?.(record) };
}

function errorName(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'name' in error) {
    const value: unknown = Reflect.get(error, 'name');
    return typeof value === 'string' ? value : '';
  }
  return '';
}

function permissionError(error: unknown): boolean {
  const name = errorName(error);
  return name === 'NotAllowedError' || name === 'SecurityError';
}

function defaultNavigator(): Navigator | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator;
}

function defaultMediaRecorderConstructor(): MediaRecorderConstructor | undefined {
  return typeof MediaRecorder === 'undefined' ? undefined : MediaRecorder;
}

/** Owns browser display-capture permission, MediaRecorder state, and media cleanup. */
export class VideoRecorder {
  readonly #config: ResolvedTestWitnessConfig['video'];
  readonly #navigator?: Navigator;
  readonly #mediaRecorderConstructor?: MediaRecorderConstructor;
  readonly #clock: Clock;
  readonly #monotonicTimeProvider: () => number;
  readonly #idFactory: () => string;
  readonly #onStateChange: (state: VideoRecorderState) => void;
  readonly #onFinalized: (record: VideoRecord) => void;
  readonly #onError: (error: unknown) => void;
  readonly #setTimer: (handler: () => void, timeoutMs: number) => ReturnType<typeof setTimeout>;
  readonly #clearTimer: (handle: ReturnType<typeof setTimeout>) => void;
  #state: VideoRecorderState = 'idle';
  #stream?: MediaStream;
  #recorder?: MediaRecorder;
  #chunks: Blob[] = [];
  #startedAt?: Date;
  #activeSegmentStartedAt?: number;
  #accumulatedActiveMs = 0;
  #durationTimer?: ReturnType<typeof setTimeout>;
  #finalizationTimer?: ReturnType<typeof setTimeout>;
  #completion?: Completion;
  #completedRecord?: VideoRecord;
  #stopReason?: VideoStopReason;
  #selectedMimeType?: string;
  #startGeneration = 0;
  #trackEndedListeners = new Map<MediaStreamTrack, () => void>();
  #stoppedTracks = new WeakSet<MediaStreamTrack>();

  public constructor(options: VideoRecorderOptions) {
    this.#config = options.config;
    this.#navigator = options.navigator ?? defaultNavigator();
    this.#mediaRecorderConstructor =
      options.mediaRecorderConstructor ?? defaultMediaRecorderConstructor();
    this.#clock = options.clock ?? systemClock;
    this.#monotonicTimeProvider =
      options.monotonicTimeProvider ?? (() => globalThis.performance?.now() ?? Date.now());
    this.#idFactory = options.idFactory ?? (() => createId('video'));
    this.#onStateChange = options.onStateChange ?? (() => undefined);
    this.#onFinalized = options.onFinalized ?? (() => undefined);
    this.#onError = options.onError ?? (() => undefined);
    this.#setTimer = options.setTimer ?? ((handler, timeoutMs) => setTimeout(handler, timeoutMs));
    this.#clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle));
  }

  public isSupported(): boolean {
    return Boolean(
      this.#navigator?.mediaDevices?.getDisplayMedia && this.#mediaRecorderConstructor,
    );
  }

  public getState(): VideoRecorderState {
    return this.#state;
  }

  public isRecording(): boolean {
    return this.#state === 'recording' || this.#state === 'paused';
  }

  public getCompletedRecord(): VideoRecord | undefined {
    return this.#completedRecord;
  }

  public async start(captureVideo = this.#config.enabled): Promise<void> {
    if (!captureVideo) return;
    if (
      this.#state === 'requesting-permission' ||
      this.#state === 'recording' ||
      this.#state === 'paused' ||
      this.#state === 'stopping'
    ) {
      throw new TestWitnessError('INVALID_SESSION_STATE', 'Video recording is already active.');
    }
    if (!this.isSupported()) {
      throw new TestWitnessError(
        'VIDEO_UNSUPPORTED',
        'This browser does not support getDisplayMedia and MediaRecorder tab recording.',
      );
    }

    const mimeType = this.selectMimeType();
    const startGeneration = this.#startGeneration + 1;
    this.#startGeneration = startGeneration;
    this.resetForStart(mimeType);
    this.setState('requesting-permission');

    let stream: MediaStream;
    try {
      const mediaDevices = this.#navigator?.mediaDevices;
      if (!mediaDevices) throw new Error('navigator.mediaDevices is unavailable.');
      const streamPromise = mediaDevices.getDisplayMedia(this.displayMediaOptions(mediaDevices));
      stream = await streamPromise;
    } catch (error) {
      this.setState('idle');
      if (permissionError(error)) {
        throw new TestWitnessError(
          'VIDEO_PERMISSION_DENIED',
          'Browser-tab recording permission was denied. The evidence session can continue without video.',
          error,
        );
      }
      throw new TestWitnessError(
        'VIDEO_START_FAILED',
        `Browser-tab recording could not start: ${this.errorMessage(error)}`,
        error,
      );
    }

    if (startGeneration !== this.#startGeneration || this.getState() !== 'requesting-permission') {
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch (error) {
          this.reportError(error);
        }
      }
      throw new TestWitnessError(
        'VIDEO_START_FAILED',
        'Browser-tab recording was cancelled before permission completed.',
      );
    }
    this.#stream = stream;
    try {
      const videoTracks = stream.getVideoTracks();
      if (videoTracks.length === 0) {
        throw new Error('The selected display stream did not provide a video track.');
      }
      const displaySurface = videoTracks[0]?.getSettings().displaySurface;
      if (displaySurface && displaySurface !== 'browser') {
        throw new Error('Select a browser tab in the browser sharing dialog.');
      }

      const RecorderConstructor = this.#mediaRecorderConstructor;
      if (!RecorderConstructor) throw new Error('MediaRecorder is unavailable.');
      const recorder = new RecorderConstructor(stream, { mimeType });
      this.#recorder = recorder;
      recorder.addEventListener('dataavailable', this.handleDataAvailable);
      recorder.addEventListener('stop', this.handleRecorderStop);
      recorder.addEventListener('error', this.handleRecorderError);
      for (const track of videoTracks) {
        const listener = (): void => {
          if (this.#state === 'recording' || this.#state === 'paused') {
            void this.stop('user-ended-sharing').catch((error: unknown) => this.reportError(error));
          }
        };
        track.addEventListener('ended', listener);
        this.#trackEndedListeners.set(track, listener);
      }

      recorder.start(1_000);
      this.#startedAt = this.#clock();
      this.#activeSegmentStartedAt = this.safeMonotonicTime();
      this.setState('recording');
      this.scheduleDurationLimit();
    } catch (error) {
      this.cleanupMedia();
      this.setState('idle');
      throw new TestWitnessError(
        'VIDEO_START_FAILED',
        `Browser-tab recording could not start: ${this.errorMessage(error)}`,
        error,
      );
    }
  }

  public pause(): void {
    if (this.#state !== 'recording' || !this.#recorder) {
      throw new TestWitnessError(
        'INVALID_SESSION_STATE',
        'Only an active video recording can be paused.',
      );
    }
    try {
      this.#recorder.pause();
    } catch (error) {
      throw new TestWitnessError(
        'VIDEO_RECORDING_FAILED',
        `Video recording could not be paused: ${this.errorMessage(error)}`,
        error,
      );
    }
    this.accumulateActiveTime();
    this.clearDurationTimer();
    this.setState('paused');
  }

  public resume(): void {
    if (this.#state !== 'paused' || !this.#recorder) {
      throw new TestWitnessError(
        'INVALID_SESSION_STATE',
        'Only a paused video recording can be resumed.',
      );
    }
    try {
      this.#recorder.resume();
    } catch (error) {
      throw new TestWitnessError(
        'VIDEO_RECORDING_FAILED',
        `Video recording could not be resumed: ${this.errorMessage(error)}`,
        error,
      );
    }
    this.#activeSegmentStartedAt = this.safeMonotonicTime();
    this.setState('recording');
    this.scheduleDurationLimit();
  }

  public stop(reason: VideoStopReason = 'session-stopped'): Promise<VideoRecord | undefined> {
    if (this.#state === 'idle') return Promise.resolve(undefined);
    if (this.#state === 'stopped') return Promise.resolve(this.#completedRecord);
    if (this.#state === 'stopping') {
      return this.#completion?.promise ?? Promise.resolve(this.#completedRecord);
    }

    if (this.#state === 'requesting-permission') {
      this.#startGeneration += 1;
      this.#stopReason ??= reason;
      this.setState('stopping');
      const completion = this.#completion;
      this.cleanupMedia();
      this.setState('stopped');
      completion?.resolve(undefined);
      return completion?.promise ?? Promise.resolve(undefined);
    }

    this.#stopReason ??= reason;
    if (this.#state === 'recording') this.accumulateActiveTime();
    this.clearDurationTimer();
    this.setState('stopping');
    this.removeTrackEndedListeners();

    const recorder = this.#recorder;
    if (!recorder) {
      this.finalize();
      return this.#completion?.promise ?? Promise.resolve(this.#completedRecord);
    }

    this.scheduleFinalizationWatchdog();
    if (recorder.state === 'inactive') {
      // The browser may already have queued its final dataavailable and stop events.
      // Keep the listeners and tracks alive so that final WebM chunk is not discarded.
      return this.#completion?.promise ?? Promise.resolve(this.#completedRecord);
    }

    try {
      recorder.stop();
    } catch (error) {
      // A recorder can become inactive between the state check above and stop().
      // In that case the browser may already have queued final dataavailable/stop
      // events, so keep the listeners alive and let those events finish the Blob.
      this.reportError(
        new TestWitnessError(
          'VIDEO_RECORDING_FAILED',
          `Video recording stop reported an error while final media was pending: ${this.errorMessage(error)}`,
          error,
        ),
      );
      if (String(recorder.state) !== 'inactive') this.stopTracks();
    }
    return this.#completion?.promise ?? Promise.resolve(this.#completedRecord);
  }

  public async destroy(): Promise<void> {
    if (this.#state !== 'idle' && this.#state !== 'stopped') await this.stop('destroyed');
    this.cleanupMedia();
    this.#completedRecord = undefined;
    this.#completion = undefined;
    this.setState('idle');
  }

  private readonly handleDataAvailable = (event: Event): void => {
    const data = (event as BlobEvent).data;
    if (data instanceof Blob && data.size > 0) this.#chunks.push(data);
  };

  private readonly handleRecorderStop = (): void => {
    if (this.#state === 'recording') this.accumulateActiveTime();
    this.clearDurationTimer();
    if (this.#state !== 'stopping' && this.#state !== 'stopped') this.setState('stopping');
    this.finalize();
  };

  private readonly handleRecorderError = (event: Event): void => {
    const nativeError: unknown =
      typeof event === 'object' && event !== null && 'error' in event
        ? Reflect.get(event, 'error')
        : event;
    this.reportError(
      new TestWitnessError(
        'VIDEO_RECORDING_FAILED',
        `The browser video recorder reported an error: ${this.errorMessage(nativeError)}`,
        nativeError,
      ),
    );
    if (this.#state === 'recording' || this.#state === 'paused') {
      void this.stop('recorder-error').catch((error: unknown) => this.reportError(error));
    }
  };

  private selectMimeType(): string {
    const configured = this.#config.mimeType.trim();
    if (!configured.toLowerCase().startsWith('video/webm')) {
      throw new TestWitnessError(
        'VIDEO_UNSUPPORTED',
        'MVP 1 exports WebM video; configure a video/webm MIME type.',
      );
    }
    const candidates = [
      configured,
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ].filter((value, index, values) => value && values.indexOf(value) === index);
    const supportCheck = this.#mediaRecorderConstructor?.isTypeSupported;
    const selected = supportCheck
      ? candidates.find((candidate) => supportCheck.call(this.#mediaRecorderConstructor, candidate))
      : candidates[0];
    if (!selected) {
      throw new TestWitnessError(
        'VIDEO_UNSUPPORTED',
        'This browser does not expose a supported WebM MediaRecorder MIME type.',
      );
    }
    return selected;
  }

  private displayMediaOptions(mediaDevices: MediaDevices): DisplayMediaStreamOptions {
    let supportsDisplaySurface = false;
    if (typeof mediaDevices.getSupportedConstraints !== 'function') {
      return { audio: this.#config.includeAudio, video: true };
    }
    try {
      supportsDisplaySurface = mediaDevices.getSupportedConstraints().displaySurface === true;
    } catch (error) {
      this.reportError(
        new TestWitnessError(
          'VIDEO_START_FAILED',
          `Browser display-capture capabilities could not be inspected; continuing with compatible defaults: ${this.errorMessage(error)}`,
          error,
        ),
      );
    }
    return {
      audio: this.#config.includeAudio,
      video: supportsDisplaySurface ? { displaySurface: 'browser' } : true,
    };
  }

  private resetForStart(mimeType: string): void {
    this.cleanupMedia();
    this.#chunks = [];
    this.#startedAt = undefined;
    this.#activeSegmentStartedAt = undefined;
    this.#accumulatedActiveMs = 0;
    this.clearFinalizationTimer();
    this.#completedRecord = undefined;
    this.#stopReason = undefined;
    this.#selectedMimeType = mimeType;
    this.#completion = createCompletion();
  }

  private finalize(diagnostic?: unknown): void {
    if (this.#state === 'stopped') return;
    if (this.#state === 'recording') this.accumulateActiveTime();
    const startedAt = this.#startedAt ?? this.#clock();
    const endedAt = this.#clock();
    const mimeType = this.#recorder?.mimeType || this.#selectedMimeType || 'video/webm';
    const blob = new Blob(this.#chunks, { type: mimeType });
    if (diagnostic) this.reportError(diagnostic);
    if (blob.size === 0) {
      this.#completedRecord = undefined;
      this.cleanupMedia();
      this.setState('stopped');
      if (!diagnostic) {
        this.reportError(
          new TestWitnessError(
            'VIDEO_RECORDING_FAILED',
            'Video recording ended without producing media data. No empty video was added to the evidence.',
          ),
        );
      }
      this.#completion?.resolve(undefined);
      return;
    }
    const record: VideoRecord = {
      id: this.#idFactory(),
      startedAt: toIsoTimestamp(startedAt),
      endedAt: toIsoTimestamp(endedAt),
      durationMs: Math.max(0, Math.round(this.#accumulatedActiveMs)),
      mimeType,
      blob,
      fileName: 'recording.webm',
      stopReason: this.#stopReason ?? 'session-stopped',
    };
    this.#completedRecord = record;
    this.cleanupMedia();
    try {
      this.#onFinalized(record);
    } catch (error) {
      this.reportError(error);
    }
    this.setState('stopped');
    this.#completion?.resolve(record);
  }

  private accumulateActiveTime(): void {
    if (this.#activeSegmentStartedAt === undefined) return;
    this.#accumulatedActiveMs += Math.max(
      0,
      this.safeMonotonicTime() - this.#activeSegmentStartedAt,
    );
    this.#activeSegmentStartedAt = undefined;
  }

  private scheduleDurationLimit(): void {
    this.clearDurationTimer();
    const limitMs = this.#config.maxDurationMinutes * 60_000;
    const remaining = Math.max(0, limitMs - this.#accumulatedActiveMs);
    this.#durationTimer = this.#setTimer(() => {
      void this.stop('duration-limit').catch((error: unknown) => this.reportError(error));
    }, remaining);
  }

  private clearDurationTimer(): void {
    if (this.#durationTimer === undefined) return;
    this.#clearTimer(this.#durationTimer);
    this.#durationTimer = undefined;
  }

  private scheduleFinalizationWatchdog(): void {
    this.clearFinalizationTimer();
    this.#finalizationTimer = this.#setTimer(() => {
      this.#finalizationTimer = undefined;
      this.finalize(
        new TestWitnessError(
          'VIDEO_RECORDING_FAILED',
          'The browser did not finish video finalization within 5 seconds. Buffered media was preserved when available.',
        ),
      );
    }, FINALIZATION_TIMEOUT_MS);
  }

  private clearFinalizationTimer(): void {
    if (this.#finalizationTimer === undefined) return;
    this.#clearTimer(this.#finalizationTimer);
    this.#finalizationTimer = undefined;
  }

  private removeTrackEndedListeners(): void {
    for (const [track, listener] of this.#trackEndedListeners) {
      track.removeEventListener('ended', listener);
    }
    this.#trackEndedListeners.clear();
  }

  private stopTracks(): void {
    for (const track of this.#stream?.getTracks() ?? []) {
      if (this.#stoppedTracks.has(track)) continue;
      try {
        track.stop();
        this.#stoppedTracks.add(track);
      } catch (error) {
        this.reportError(error);
      }
    }
  }

  private cleanupMedia(): void {
    this.clearDurationTimer();
    this.clearFinalizationTimer();
    this.removeTrackEndedListeners();
    this.#recorder?.removeEventListener('dataavailable', this.handleDataAvailable);
    this.#recorder?.removeEventListener('stop', this.handleRecorderStop);
    this.#recorder?.removeEventListener('error', this.handleRecorderError);
    this.stopTracks();
    this.#stream = undefined;
    this.#recorder = undefined;
  }

  private setState(state: VideoRecorderState): void {
    this.#state = state;
    try {
      this.#onStateChange(state);
    } catch (error) {
      this.reportError(error);
    }
  }

  private safeMonotonicTime(): number {
    try {
      const value = this.#monotonicTimeProvider();
      return Number.isFinite(value) ? value : Date.now();
    } catch (error) {
      this.reportError(error);
      return Date.now();
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private reportError(error: unknown): void {
    try {
      this.#onError(error);
    } catch {
      // Diagnostics must never interfere with media cleanup.
    }
  }
}
