import type { ResolvedTestWitnessConfig } from '../types/config';

type ScreenshotConfig = ResolvedTestWitnessConfig['screenshot'];
type TimerHandle = ReturnType<typeof setTimeout>;

export interface AutomaticScreenshotSchedulerOptions {
  config: ScreenshotConfig;
  capture: (label: string) => Promise<void>;
  canCapture: () => boolean;
  onError: (error: unknown) => void;
  onLimitReached: (maximum: number) => void;
  settleDelayMs?: number;
  setTimeout?: (handler: () => void, delayMs: number) => TimerHandle;
  clearTimeout?: (handle: TimerHandle) => void;
  setInterval?: (handler: () => void, delayMs: number) => TimerHandle;
  clearInterval?: (handle: TimerHandle) => void;
}

interface PendingDelay {
  handle?: TimerHandle;
  resolve: () => void;
}

/**
 * Coalesces and bounds automatic screenshot triggers without affecting explicit manual captures.
 * A short settle delay lets UI frameworks render navigation and error states first.
 */
export class AutomaticScreenshotScheduler {
  readonly #config: ScreenshotConfig;
  readonly #capture: (label: string) => Promise<void>;
  readonly #canCapture: () => boolean;
  readonly #onError: (error: unknown) => void;
  readonly #onLimitReached: (maximum: number) => void;
  readonly #settleDelayMs: number;
  readonly #setTimeout: (handler: () => void, delayMs: number) => TimerHandle;
  readonly #clearTimeout: (handle: TimerHandle) => void;
  readonly #setInterval: (handler: () => void, delayMs: number) => TimerHandle;
  readonly #clearInterval: (handle: TimerHandle) => void;
  readonly #delays = new Set<PendingDelay>();
  readonly #operations = new Set<Promise<void>>();
  #interval?: TimerHandle;
  #generation = 0;
  #running = false;
  #pending = false;
  #automaticAttempts = 0;
  #limitWarningSent = false;

  public constructor(options: AutomaticScreenshotSchedulerOptions) {
    this.#config = options.config;
    this.#capture = options.capture;
    this.#canCapture = options.canCapture;
    this.#onError = options.onError;
    this.#onLimitReached = options.onLimitReached;
    this.#settleDelayMs = options.settleDelayMs ?? 150;
    this.#setTimeout = options.setTimeout ?? ((handler, delayMs) => setTimeout(handler, delayMs));
    this.#clearTimeout = options.clearTimeout ?? ((handle) => clearTimeout(handle));
    this.#setInterval =
      options.setInterval ?? ((handler, delayMs) => setInterval(handler, delayMs));
    this.#clearInterval = options.clearInterval ?? ((handle) => clearInterval(handle));
  }

  public start(): void {
    this.cancelSchedule();
    this.#generation += 1;
    this.#running = true;
    this.#automaticAttempts = 0;
    this.#limitWarningSent = false;

    if (!this.#config.enabled) return;
    if (this.#config.captureOnStart) this.request('Session started');
    if (this.#config.autoCaptureIntervalSeconds > 0) {
      this.#interval = this.#setInterval(
        () => this.request('Automatic checkpoint'),
        this.#config.autoCaptureIntervalSeconds * 1_000,
      );
    }
  }

  public navigation(): void {
    if (this.#config.captureOnNavigation) this.request('Page navigation');
  }

  public error(label: string): void {
    if (this.#config.captureOnError) this.request(label);
  }

  public request(label: string): void {
    if (!this.#running || !this.#config.enabled || this.#pending || !this.#canCapture()) return;
    if (this.#automaticAttempts >= this.#config.maxAutomaticScreenshots) {
      if (!this.#limitWarningSent) {
        this.#limitWarningSent = true;
        this.#onLimitReached(this.#config.maxAutomaticScreenshots);
      }
      return;
    }

    // Failed renderers can be expensive too, so the resource cap counts accepted attempts.
    this.#automaticAttempts += 1;
    this.#pending = true;
    const generation = this.#generation;
    const operation = (async (): Promise<void> => {
      await this.waitForSettle();
      if (generation !== this.#generation || !this.#canCapture()) return;
      await this.#capture(label);
    })()
      .catch((error: unknown) => this.#onError(error))
      .finally(() => {
        if (generation === this.#generation) this.#pending = false;
      });

    this.#operations.add(operation);
    void operation.finally(() => this.#operations.delete(operation));
  }

  public async stop(): Promise<void> {
    this.#generation += 1;
    this.#running = false;
    this.cancelSchedule();
    this.resolveDelays();
    this.#pending = false;
    await this.drain();
  }

  /** Waits for automatic work already in progress; primarily used during lifecycle cleanup. */
  public async drain(): Promise<void> {
    await Promise.allSettled([...this.#operations]);
  }

  private cancelSchedule(): void {
    if (this.#interval !== undefined) this.#clearInterval(this.#interval);
    this.#interval = undefined;
  }

  private waitForSettle(): Promise<void> {
    if (this.#settleDelayMs <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      const delay: PendingDelay = {
        resolve: () => {
          this.#delays.delete(delay);
          resolve();
        },
      };
      delay.handle = this.#setTimeout(delay.resolve, this.#settleDelayMs);
      this.#delays.add(delay);
    });
  }

  private resolveDelays(): void {
    for (const delay of [...this.#delays]) {
      if (delay.handle !== undefined) this.#clearTimeout(delay.handle);
      delay.resolve();
    }
  }
}
