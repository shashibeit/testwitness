import { ActionRecorder } from '../capture/ActionRecorder';
import { AutomaticScreenshotScheduler } from '../capture/AutomaticScreenshotScheduler';
import { ConsoleRecorder } from '../capture/ConsoleRecorder';
import { NetworkRecorder } from '../capture/NetworkRecorder';
import { ScreenshotCapture } from '../capture/ScreenshotCapture';
import { VideoRecorder } from '../capture/VideoRecorder';
import { EvidenceExporter } from '../evidence/EvidenceExporter';
import { InMemoryEvidenceStore, type MemoryWarning } from '../evidence/EvidenceStore';
import { MetadataCollector } from '../metadata/MetadataCollector';
import { DataSanitizer } from '../privacy/DataSanitizer';
import { ElementMasker } from '../privacy/ElementMasker';
import {
  mountTestWitnessToolbar,
  type TestWitnessToolbarHandle,
} from '../toolbar/TestWitnessToolbar';
import type { TestWitnessConfig } from '../types/config';
import type { NoteRecord, ScreenshotRecord } from '../types/evidence';
import type {
  DownloadEvidenceResult,
  SessionResultStatus,
  SessionStartMetadata,
  SessionStartOptions,
  SessionStatus,
  SessionSummary,
  SessionWarning,
  SessionWarningCode,
  TestSessionResult,
  VideoCaptureStatus,
} from '../types/session';
import { createId } from '../utils/ids';
import { TestWitnessError } from '../utils/errors';
import { EventBus } from './EventBus';
import { SessionManager, type SessionSummaryMetrics } from './SessionManager';
import { resolveTestWitnessConfig } from './config';

interface TestWitnessEvents {
  summary: SessionSummary;
  warning: SessionWarning;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Public framework-independent coordinator for one in-browser evidence session at a time.
 * Browser APIs are installed only while a session is active and are always restored on stop.
 */
export class TestWitness {
  readonly #config;
  readonly #sanitizer: DataSanitizer;
  readonly #metadataCollector: MetadataCollector;
  readonly #store: InMemoryEvidenceStore;
  readonly #exporter: EvidenceExporter;
  readonly #automaticScreenshots: AutomaticScreenshotScheduler;
  readonly #events = new EventBus<TestWitnessEvents>();
  #sessionManager = new SessionManager();
  #actionRecorder?: ActionRecorder;
  #consoleRecorder?: ConsoleRecorder;
  #networkRecorder?: NetworkRecorder;
  #screenshotCapture?: ScreenshotCapture;
  #videoRecorder?: VideoRecorder;
  #toolbar?: TestWitnessToolbarHandle;
  #initialized = false;
  #evidenceAvailable = false;
  #warnings: SessionWarning[] = [];
  #lastResult?: TestSessionResult;
  #pendingScreenshots = new Set<Promise<ScreenshotRecord>>();
  #stopPromise?: Promise<TestSessionResult>;
  #stopping = false;
  #lifecycleGeneration = 0;
  #initializing = false;
  #videoRequested = false;
  #videoUnavailable = false;

  public constructor(config: TestWitnessConfig) {
    this.#config = resolveTestWitnessConfig(config);
    this.#sanitizer = new DataSanitizer(this.#config.privacy);
    this.#metadataCollector = new MetadataCollector(this.#config, {
      sanitizeUrl: (url) => this.#sanitizer.sanitizeUrl(url),
      sanitizeText: (text) => this.#sanitizer.sanitizeText(text, 1_000),
    });
    this.#store = new InMemoryEvidenceStore({
      warningThresholdBytes: this.#config.memory.warningThresholdMb * 1024 * 1024,
      onMemoryWarning: (warning) => this.handleMemoryWarning(warning),
    });
    this.#exporter = new EvidenceExporter(this.#config.export);
    this.#automaticScreenshots = new AutomaticScreenshotScheduler({
      config: this.#config.screenshot,
      capture: async (label) => {
        await this.captureScreenshot(label);
      },
      canCapture: () => this.#sessionManager.getStatus() === 'recording' && !this.#stopping,
      // captureScreenshot persists the typed failure as a session warning before rethrowing.
      onError: () => undefined,
      onLimitReached: (maximum) => {
        this.addWarning(
          'SCREENSHOT_LIMIT_REACHED',
          `Automatic screenshot capture stopped after reaching the configured limit of ${maximum}. Manual screenshots remain available.`,
        );
      },
    });
  }

  /** Prepares optional UI. Recording and browser patching do not begin until startSession. */
  public async initialize(): Promise<void> {
    if (this.#initialized || this.#initializing) {
      throw new TestWitnessError('ALREADY_INITIALIZED', 'TestWitness is already initialized.');
    }
    this.#initializing = true;
    const generation = this.#lifecycleGeneration + 1;
    this.#lifecycleGeneration = generation;
    try {
      await Promise.resolve();
      if (generation !== this.#lifecycleGeneration) {
        throw new TestWitnessError(
          'INVALID_SESSION_STATE',
          'TestWitness initialization was superseded by another lifecycle operation.',
        );
      }

      if (this.#config.toolbar.enabled) {
        if (typeof document === 'undefined') {
          throw new TestWitnessError(
            'INSTRUMENTATION_FAILED',
            'The configured toolbar requires an active browser document.',
          );
        }
        try {
          this.#toolbar = mountTestWitnessToolbar(this, this.#config.toolbar.position, document);
        } catch (error) {
          throw new TestWitnessError(
            'INSTRUMENTATION_FAILED',
            `The TestWitness toolbar could not be initialized: ${toMessage(error)}`,
            error,
          );
        }
      }

      this.#initialized = true;
      this.emitSummary();
    } finally {
      this.#initializing = false;
    }
  }

  /** Restores all patched browser APIs, stops media tracks, removes UI, and clears evidence. */
  public async destroy(): Promise<void> {
    this.#lifecycleGeneration += 1;
    let cleanupError: unknown;
    if (this.isActive()) {
      try {
        await this.stopInternal('destroyed');
      } catch (error) {
        cleanupError = error;
      }
    }

    try {
      await this.cleanupRecorders('destroyed');
    } catch (error) {
      cleanupError ??= error;
    }
    this.#toolbar?.destroy();
    this.#toolbar = undefined;
    this.#store.clear();
    this.#events.clear();
    this.#warnings = [];
    this.#lastResult = undefined;
    this.#evidenceAvailable = false;
    this.#pendingScreenshots.clear();
    this.#stopPromise = undefined;
    this.#stopping = false;
    this.#videoRequested = false;
    this.#videoUnavailable = false;
    this.#initialized = false;
    this.#initializing = false;
    this.#sessionManager = new SessionManager();

    if (cleanupError) {
      throw new TestWitnessError(
        'INSTRUMENTATION_FAILED',
        `TestWitness cleanup encountered an error: ${toMessage(cleanupError)}`,
        cleanupError,
      );
    }
  }

  /** Starts browser instrumentation, then requests tab-sharing consent only when selected. */
  public async startSession(
    metadata: SessionStartMetadata = {},
    options?: SessionStartOptions,
  ): Promise<SessionSummary> {
    this.assertInitialized();
    const captureVideo = this.resolveCaptureVideo(options);
    const generation = this.#lifecycleGeneration + 1;
    this.#lifecycleGeneration = generation;
    if (this.#sessionManager.getStatus() === 'stopped') this.#sessionManager = new SessionManager();
    const safeStartMetadata = this.sanitizeStartMetadata(metadata);
    const started = this.#sessionManager.start();
    this.#warnings = [];
    this.#lastResult = undefined;
    this.#stopping = false;
    this.#videoRequested = captureVideo;
    this.#videoUnavailable = false;

    try {
      const sessionMetadata = this.#metadataCollector.collect(safeStartMetadata, {
        sessionId: started.sessionId,
        startedAt: started.startedAt ? new Date(started.startedAt) : undefined,
      });
      this.#store.reset(sessionMetadata);
      this.#evidenceAvailable = true;
      this.installRecorders();
    } catch (error) {
      await this.cleanupRecorders('destroyed').catch(() => undefined);
      this.#store.clear();
      this.#evidenceAvailable = false;
      this.#videoRequested = false;
      if (this.isActive()) this.#sessionManager.stop();
      throw error instanceof TestWitnessError
        ? error
        : new TestWitnessError(
            'INSTRUMENTATION_FAILED',
            `The evidence session could not start: ${toMessage(error)}`,
            error,
          );
    }

    this.emitSummary();
    if (captureVideo) {
      try {
        await this.#videoRecorder?.start(true);
      } catch (error) {
        if (generation !== this.#lifecycleGeneration || !this.#initialized) {
          throw new TestWitnessError(
            'INVALID_SESSION_STATE',
            'Session startup was superseded while browser-tab permission was pending.',
            error,
          );
        }
        this.#videoUnavailable = true;
        this.addWarning(
          'VIDEO_UNAVAILABLE',
          `${toMessage(error)} The session remains active without video.`,
        );
      }
    }
    if (generation !== this.#lifecycleGeneration || !this.#initialized) {
      throw new TestWitnessError(
        'INVALID_SESSION_STATE',
        'Session startup was superseded by another lifecycle operation.',
      );
    }
    this.#automaticScreenshots.start();
    this.emitSummary();
    return this.getSessionSummary();
  }

  public pauseSession(): SessionSummary {
    this.assertInitialized();
    this.assertNotStopping();
    this.#sessionManager.pause();
    this.#actionRecorder?.pause();
    this.#consoleRecorder?.pause();
    this.#networkRecorder?.pause();
    if (this.#videoRecorder?.getState() === 'recording') {
      try {
        this.#videoRecorder.pause();
      } catch (error) {
        this.addWarning('RECORDER_ERROR', toMessage(error));
      }
    }
    this.emitSummary();
    return this.getSessionSummary();
  }

  public resumeSession(): SessionSummary {
    this.assertInitialized();
    this.assertNotStopping();
    this.#sessionManager.resume();
    this.#actionRecorder?.resume();
    this.#consoleRecorder?.resume();
    this.#networkRecorder?.resume();
    if (this.#videoRecorder?.getState() === 'paused') {
      try {
        this.#videoRecorder.resume();
      } catch (error) {
        this.addWarning('RECORDER_ERROR', toMessage(error));
      }
    }
    this.emitSummary();
    return this.getSessionSummary();
  }

  public async stopSession(result?: SessionResultStatus): Promise<TestSessionResult> {
    this.assertInitialized();
    if (this.#stopPromise) return await this.#stopPromise;
    if (result !== undefined) this.#sessionManager.setResult(result);
    return await this.stopInternal('session-stopped');
  }

  public async captureScreenshot(label = 'Screenshot'): Promise<ScreenshotRecord> {
    this.assertInitialized();
    if (this.#sessionManager.getStatus() !== 'recording' || this.#stopping) {
      throw new TestWitnessError(
        'INVALID_SESSION_STATE',
        'Screenshots can only be captured while the session is recording.',
      );
    }
    const capture = this.#screenshotCapture;
    if (!capture) {
      throw new TestWitnessError(
        'SCREENSHOT_FAILED',
        'Screenshot capture is not available for this session.',
      );
    }
    const operation = capture.capture(label).then((record) => {
      this.#store.addScreenshot(record);
      this.emitSummary();
      return record;
    });
    this.#pendingScreenshots.add(operation);
    try {
      return await operation;
    } catch (error) {
      this.addWarning('CAPTURE_FAILED', `Screenshot was not captured: ${toMessage(error)}`);
      throw error;
    } finally {
      this.#pendingScreenshots.delete(operation);
    }
  }

  public addNote(text: string): NoteRecord {
    this.assertInitialized();
    this.assertActive('add a note');
    const sanitizedText = this.#sanitizer.sanitizeText(text, 4_000).trim();
    if (!sanitizedText) {
      throw new TestWitnessError('INVALID_CONFIG', 'A tester note cannot be blank.');
    }
    const record: NoteRecord = {
      id: createId('note'),
      timestamp: new Date().toISOString(),
      text: sanitizedText,
      url: this.#sanitizer.sanitizeUrl(globalThis.location?.href ?? ''),
      actionSequence: this.#actionRecorder?.currentSequence ?? 0,
    };
    this.#store.addNote(record);
    this.emitSummary();
    return record;
  }

  /** Sets the outcome while a session is recording or paused. */
  public setSessionResult(result: SessionResultStatus): SessionSummary {
    this.assertInitialized();
    this.assertNotStopping();
    this.#sessionManager.setResult(result);
    this.emitSummary();
    return this.getSessionSummary();
  }

  /** Generates and starts a browser download of the completed in-memory evidence. */
  public async downloadEvidence(): Promise<DownloadEvidenceResult> {
    this.assertInitialized();
    if (this.#sessionManager.getStatus() !== 'stopped' || !this.#lastResult) {
      throw new TestWitnessError(
        'INVALID_SESSION_STATE',
        'Stop the session before downloading its evidence.',
      );
    }
    return await this.#exporter.download(this.#store.getSnapshot(), this.#lastResult.summary);
  }

  public getSessionStatus(): SessionStatus {
    return this.#sessionManager.getStatus();
  }

  public getSessionSummary(): SessionSummary {
    return this.#sessionManager.getSummary(this.summaryMetrics());
  }

  /** Subscribes the optional UI or an application adapter to current session summaries. */
  public onSummary(listener: (summary: SessionSummary) => void): () => void {
    return this.#events.on('summary', listener);
  }

  /** Subscribes to recoverable capture warnings such as declined video permission. */
  public onWarning(listener: (warning: SessionWarning) => void): () => void {
    return this.#events.on('warning', listener);
  }

  private installRecorders(): void {
    const onRecorderError = (error: unknown): void => {
      this.addWarning('RECORDER_ERROR', `Evidence recorder error: ${toMessage(error)}`);
    };
    this.#actionRecorder = new ActionRecorder({
      config: this.#config.actions,
      sanitizer: this.#sanitizer,
      onRecord: (record) => {
        this.#store.addAction(record);
        if (
          record.type === 'navigation' ||
          record.type === 'history-push' ||
          record.type === 'history-replace' ||
          record.type === 'popstate' ||
          record.type === 'hashchange'
        ) {
          this.#automaticScreenshots.navigation();
        }
      },
      onError: onRecorderError,
    });
    this.#consoleRecorder = this.#config.console.enabled
      ? new ConsoleRecorder({
          sanitizer: this.#sanitizer,
          levels: this.#config.console.levels,
          onRecord: (record) => {
            this.#store.addConsoleLog(record);
            if (record.level === 'error') this.#automaticScreenshots.error('Console error');
          },
          onError: onRecorderError,
        })
      : undefined;
    this.#networkRecorder = new NetworkRecorder({
      config: this.#config.network,
      sanitizer: this.#sanitizer,
      onRequest: (record) => {
        this.#store.addNetworkRequest(record);
        this.emitSummary();
      },
      onRecord: (record) => {
        this.#store.addNetworkError(record);
        this.#automaticScreenshots.error('Failed network request');
      },
      onError: onRecorderError,
    });
    const masker = new ElementMasker({
      privacy: this.#config.privacy,
      sanitizer: this.#sanitizer,
    });
    this.#screenshotCapture = new ScreenshotCapture({
      config: this.#config.screenshot,
      sanitizer: this.#sanitizer,
      masker,
      actionSequenceProvider: () => this.#actionRecorder?.currentSequence ?? 0,
      runWithoutNetworkRecording: async (operation) =>
        this.#networkRecorder
          ? await this.#networkRecorder.runSuppressed(operation)
          : await operation(),
    });
    this.#screenshotCapture.reset();
    this.#videoRecorder = new VideoRecorder({
      config: this.#config.video,
      onStateChange: () => this.emitSummary(),
      onFinalized: (record) => {
        if (this.#evidenceAvailable) this.#store.setVideo(record);
        if (this.isActive() && record.stopReason === 'user-ended-sharing') {
          this.addWarning(
            'VIDEO_ENDED',
            'Browser-tab video sharing ended. The recorded video was saved; screenshots, actions, and logs are still being captured.',
          );
        } else if (this.isActive() && record.stopReason === 'duration-limit') {
          this.addWarning(
            'VIDEO_ENDED',
            `The video reached its ${this.#config.video.maxDurationMinutes}-minute limit and was saved. Screenshots, actions, and logs are still being captured.`,
          );
        } else if (this.isActive() && record.stopReason === 'recorder-error') {
          this.addWarning(
            'VIDEO_ENDED',
            'Browser-tab video stopped after a recorder error. Buffered video was saved; screenshots, actions, and logs are still being captured.',
          );
        }
        this.emitSummary();
      },
      onError: onRecorderError,
    });

    try {
      this.#actionRecorder.start();
      this.#consoleRecorder?.start();
      this.#networkRecorder.start();
    } catch (error) {
      this.#actionRecorder.stop();
      this.#consoleRecorder?.stop();
      this.#networkRecorder.stop();
      throw error;
    }
  }

  private async stopInternal(
    videoReason: 'session-stopped' | 'destroyed',
  ): Promise<TestSessionResult> {
    if (this.#stopPromise) return await this.#stopPromise;
    this.assertActive('stop');
    this.#lifecycleGeneration += 1;
    this.#stopping = true;
    const operation = this.performStop(videoReason);
    this.#stopPromise = operation;
    try {
      return await operation;
    } finally {
      this.#stopPromise = undefined;
      this.#stopping = false;
    }
  }

  private async performStop(
    videoReason: 'session-stopped' | 'destroyed',
  ): Promise<TestSessionResult> {
    this.#actionRecorder?.stop();
    this.#consoleRecorder?.stop();
    this.#networkRecorder?.stop();
    await this.#networkRecorder?.drain();
    await this.#automaticScreenshots.stop();
    await Promise.allSettled([...this.#pendingScreenshots]);
    try {
      await this.#videoRecorder?.stop(videoReason);
    } catch (error) {
      this.addWarning('RECORDER_ERROR', `Video finalization failed: ${toMessage(error)}`);
    }

    const preliminary = this.#sessionManager.stop(this.summaryMetrics());
    const startSnapshot = this.#store.getSnapshot();
    const completedMetadata = this.#metadataCollector.complete(
      startSnapshot.metadata,
      preliminary.result,
      preliminary.endedAt ? new Date(preliminary.endedAt) : undefined,
    );
    this.#store.completeMetadata(completedMetadata);
    const summary = this.#sessionManager.getSummary(this.summaryMetrics());
    const result: TestSessionResult = { metadata: completedMetadata, summary };
    this.#lastResult = result;
    this.emitSummary();
    return result;
  }

  private async cleanupRecorders(videoReason: 'session-stopped' | 'destroyed'): Promise<void> {
    this.#actionRecorder?.stop();
    this.#consoleRecorder?.stop();
    this.#networkRecorder?.stop();
    await this.#networkRecorder?.drain();
    await this.#automaticScreenshots.stop();
    if (videoReason === 'destroyed') await this.#videoRecorder?.destroy();
    else await this.#videoRecorder?.stop(videoReason);
    this.#actionRecorder = undefined;
    this.#consoleRecorder = undefined;
    this.#networkRecorder = undefined;
    this.#screenshotCapture = undefined;
    this.#videoRecorder = undefined;
  }

  private summaryMetrics(): SessionSummaryMetrics {
    return {
      evidence: this.#evidenceAvailable ? this.#store.getCounts() : undefined,
      approximateSizeBytes: this.#evidenceAvailable ? this.#store.getApproximateSizeBytes() : 0,
      memoryWarningReached: this.#evidenceAvailable && this.#store.hasMemoryWarning(),
      videoStatus: this.videoStatus(),
      videoRecording: this.#videoRecorder?.isRecording() ?? false,
      warnings: this.#warnings,
    };
  }

  private handleMemoryWarning(warning: MemoryWarning): void {
    this.addWarning(
      'MEMORY_THRESHOLD_REACHED',
      `In-memory evidence reached approximately ${warning.approximateSizeBytes} bytes (configured warning threshold: ${warning.thresholdBytes} bytes).`,
    );
  }

  private addWarning(code: SessionWarningCode, message: string): void {
    const warning: SessionWarning = {
      code,
      message: this.#sanitizer.sanitizeText(message, 1_000),
      timestamp: new Date().toISOString(),
    };
    this.#warnings.push(warning);
    this.#events.emit('warning', { ...warning });
    this.emitSummary();
  }

  private sanitizeStartMetadata(metadata: SessionStartMetadata): SessionStartMetadata {
    if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
      throw new TestWitnessError('INVALID_CONFIG', 'Session metadata must be an object.');
    }
    const sanitize = (value: string | undefined): string | undefined =>
      value === undefined ? undefined : this.#sanitizer.sanitizeText(value, 500);
    const custom: NonNullable<SessionStartMetadata['custom']> = {};
    if (metadata.custom !== undefined) {
      if (typeof metadata.custom !== 'object' || metadata.custom === null) {
        throw new TestWitnessError('INVALID_CONFIG', 'Session custom metadata must be an object.');
      }
      for (const [key, value] of Object.entries(metadata.custom)) {
        const safeKey = this.#sanitizer.sanitizeText(key, 200);
        custom[safeKey] = this.#sanitizer.isSensitiveFieldName(key)
          ? '[REDACTED]'
          : typeof value === 'string'
            ? this.#sanitizer.sanitizeText(value, 1_000)
            : value;
      }
    }
    return {
      testCaseId: sanitize(metadata.testCaseId),
      testCaseName: sanitize(metadata.testCaseName),
      requirementId: sanitize(metadata.requirementId),
      testerName: sanitize(metadata.testerName),
      testerEmployeeId: sanitize(metadata.testerEmployeeId),
      custom,
    };
  }

  private resolveCaptureVideo(options: SessionStartOptions | undefined): boolean {
    if (options === undefined) return this.#config.video.enabled;
    if (typeof options !== 'object' || options === null || Array.isArray(options)) {
      throw new TestWitnessError(
        'INVALID_CONFIG',
        'Session start options must be an object when provided.',
      );
    }
    const captureVideo: unknown = Reflect.get(options, 'captureVideo');
    if (captureVideo === undefined) return this.#config.video.enabled;
    if (typeof captureVideo !== 'boolean') {
      throw new TestWitnessError(
        'INVALID_CONFIG',
        'Session start option "captureVideo" must be a boolean when provided.',
      );
    }
    return captureVideo;
  }

  private videoStatus(): VideoCaptureStatus {
    if (!this.#videoRequested) return 'off';

    const recorderState = this.#videoRecorder?.getState();
    if (
      recorderState === 'requesting-permission' ||
      recorderState === undefined ||
      (recorderState === 'idle' && !this.#videoUnavailable && this.isActive())
    ) {
      return 'requesting-permission';
    }
    if (recorderState === 'recording') return 'recording';
    if (recorderState === 'paused') return 'paused';
    if (this.#evidenceAvailable && this.#store.getCounts().hasVideo) return 'captured';
    if (recorderState === 'stopping') return 'finalizing';
    if (this.#videoUnavailable || recorderState === 'idle' || recorderState === 'stopped') {
      return 'unavailable';
    }
    return 'off';
  }

  private assertInitialized(): void {
    if (!this.#initialized) {
      throw new TestWitnessError('NOT_INITIALIZED', 'Call initialize() before using TestWitness.');
    }
  }

  private assertActive(action: string): void {
    if (!this.isActive() || this.#stopping) {
      throw new TestWitnessError('NO_ACTIVE_SESSION', `There is no active session to ${action}.`);
    }
  }

  private assertNotStopping(): void {
    if (this.#stopping) {
      throw new TestWitnessError(
        'INVALID_SESSION_STATE',
        'The evidence session is already stopping.',
      );
    }
  }

  private isActive(): boolean {
    const status = this.#sessionManager.getStatus();
    return status === 'recording' || status === 'paused';
  }

  private emitSummary(): void {
    this.#events.emit('summary', this.getSessionSummary());
  }
}
