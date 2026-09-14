import type { ConsoleLevel } from '../types/config';
import type { ConsoleLogRecord } from '../types/evidence';
import { createId } from '../utils/ids';
import { TestWitnessError } from '../utils/errors';
import type { DataSanitizer } from '../privacy/DataSanitizer';

export interface ConsoleTarget {
  warn: (...arguments_: unknown[]) => void;
  error: (...arguments_: unknown[]) => void;
}

export interface ConsoleRecorderOptions {
  sanitizer: DataSanitizer;
  levels: readonly ConsoleLevel[];
  onRecord: (record: ConsoleLogRecord) => void;
  onError?: (error: unknown) => void;
  consoleTarget?: ConsoleTarget;
  urlProvider?: () => string;
  timestampProvider?: () => string;
  idFactory?: () => string;
}

type ConsoleMethod = (...arguments_: unknown[]) => void;

interface ConsolePatch {
  original: ConsoleMethod;
  wrapper: ConsoleMethod;
  descriptor?: PropertyDescriptor;
}

interface ConsoleSubscriber {
  levels: ReadonlySet<ConsoleLevel>;
  isCapturing: () => boolean;
  capture: (level: ConsoleLevel, arguments_: readonly unknown[]) => void;
  reportError: (error: unknown) => void;
}

interface ConsoleHub {
  target: ConsoleTarget;
  subscribers: Set<ConsoleSubscriber>;
  patches: Partial<Record<ConsoleLevel, ConsolePatch>>;
  notifying: boolean;
}

const hubs = new WeakMap<object, ConsoleHub>();

function restorePatch(hub: ConsoleHub, level: ConsoleLevel): void {
  const patch = hub.patches[level];
  if (!patch || hub.target[level] !== patch.wrapper) return;

  if (patch.descriptor) {
    Object.defineProperty(hub.target, level, patch.descriptor);
  } else {
    Reflect.deleteProperty(hub.target, level);
  }
}

function reportSubscriberError(hub: ConsoleHub, error: unknown): void {
  for (const subscriber of hub.subscribers) {
    try {
      subscriber.reportError(error);
    } catch {
      // A consumer error callback must not affect the host application's console call.
    }
  }
}

function notify(hub: ConsoleHub, level: ConsoleLevel, arguments_: readonly unknown[]): void {
  if (hub.notifying) return;

  hub.notifying = true;
  try {
    for (const subscriber of [...hub.subscribers]) {
      if (!subscriber.isCapturing() || !subscriber.levels.has(level)) continue;
      try {
        subscriber.capture(level, arguments_);
      } catch (error) {
        try {
          subscriber.reportError(error);
        } catch {
          // Capture failures are isolated from both the host and other subscribers.
        }
      }
    }
  } finally {
    hub.notifying = false;
  }
}

function installPatch(hub: ConsoleHub, level: ConsoleLevel): void {
  if (hub.patches[level]) return;

  const original = hub.target[level];
  if (typeof original !== 'function') {
    throw new TestWitnessError(
      'INSTRUMENTATION_FAILED',
      `console.${level} is unavailable and cannot be recorded.`,
    );
  }

  const descriptor = Object.getOwnPropertyDescriptor(hub.target, level);
  const wrapper: ConsoleMethod = function (this: unknown, ...arguments_: unknown[]): void {
    Reflect.apply(original, this, arguments_);
    notify(hub, level, arguments_);
  };

  try {
    if (descriptor && 'value' in descriptor) {
      Object.defineProperty(hub.target, level, { ...descriptor, value: wrapper });
    } else if (descriptor) {
      Object.defineProperty(hub.target, level, {
        configurable: descriptor.configurable,
        enumerable: descriptor.enumerable,
        value: wrapper,
        writable: true,
      });
    } else {
      Object.defineProperty(hub.target, level, {
        configurable: true,
        enumerable: false,
        value: wrapper,
        writable: true,
      });
    }
  } catch (error) {
    reportSubscriberError(hub, error);
    throw new TestWitnessError(
      'INSTRUMENTATION_FAILED',
      `console.${level} could not be instrumented.`,
      error,
    );
  }

  hub.patches[level] = { original, wrapper, descriptor };
}

function subscribe(target: ConsoleTarget, subscriber: ConsoleSubscriber): () => void {
  const existing = hubs.get(target);
  const hub: ConsoleHub =
    existing ??
    ({
      target,
      subscribers: new Set<ConsoleSubscriber>(),
      patches: {},
      notifying: false,
    } satisfies ConsoleHub);

  if (!existing) hubs.set(target, hub);
  hub.subscribers.add(subscriber);

  try {
    for (const level of subscriber.levels) installPatch(hub, level);
  } catch (error) {
    hub.subscribers.delete(subscriber);
    if (hub.subscribers.size === 0) {
      restorePatch(hub, 'warn');
      restorePatch(hub, 'error');
      hubs.delete(target);
    }
    throw error;
  }

  return () => {
    hub.subscribers.delete(subscriber);
    if (hub.subscribers.size !== 0) return;

    restorePatch(hub, 'warn');
    restorePatch(hub, 'error');
    hubs.delete(target);
  };
}

/** Records selected console calls without changing their host-visible behavior. */
export class ConsoleRecorder {
  readonly #sanitizer: DataSanitizer;
  readonly #onRecord: (record: ConsoleLogRecord) => void;
  readonly #onError: (error: unknown) => void;
  readonly #target: ConsoleTarget;
  readonly #urlProvider: () => string;
  readonly #timestampProvider: () => string;
  readonly #idFactory: () => string;
  readonly #subscriber: ConsoleSubscriber;
  #unsubscribe?: () => void;
  #running = false;
  #paused = false;

  public constructor(options: ConsoleRecorderOptions) {
    this.#sanitizer = options.sanitizer;
    this.#onRecord = options.onRecord;
    this.#onError = options.onError ?? (() => undefined);
    this.#target = options.consoleTarget ?? globalThis.console;
    this.#urlProvider = options.urlProvider ?? (() => globalThis.location?.href ?? '');
    this.#timestampProvider = options.timestampProvider ?? (() => new Date().toISOString());
    this.#idFactory = options.idFactory ?? (() => createId('console'));
    this.#subscriber = {
      levels: new Set(options.levels),
      isCapturing: () => this.#running && !this.#paused,
      capture: (level, arguments_) => this.capture(level, arguments_),
      reportError: (error) => this.#onError(error),
    };
  }

  public start(): void {
    if (this.#running) return;
    this.#running = true;
    this.#paused = false;
    try {
      this.#unsubscribe = subscribe(this.#target, this.#subscriber);
    } catch (error) {
      this.#running = false;
      throw error;
    }
  }

  public pause(): void {
    if (this.#running) this.#paused = true;
  }

  public resume(): void {
    if (this.#running) this.#paused = false;
  }

  public stop(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    this.#running = false;
    this.#paused = false;
  }

  public isRunning(): boolean {
    return this.#running;
  }

  private capture(level: ConsoleLevel, arguments_: readonly unknown[]): void {
    const sanitizedArguments = arguments_.map((value) => this.#sanitizer.sanitizeValue(value));
    const first = arguments_[0];
    const message =
      first === null ||
      first === undefined ||
      typeof first === 'string' ||
      typeof first === 'number' ||
      typeof first === 'boolean' ||
      typeof first === 'bigint' ||
      typeof first === 'symbol'
        ? this.#sanitizer.sanitizeText(first ?? '')
        : first instanceof Error
          ? this.#sanitizer.sanitizeText(`${first.name}: ${first.message}`)
          : Array.isArray(first)
            ? '[Array]'
            : '[Object]';

    this.#onRecord({
      id: this.#idFactory(),
      timestamp: this.#timestampProvider(),
      level,
      message,
      arguments: sanitizedArguments,
      url: this.#sanitizer.sanitizeUrl(this.#urlProvider()),
    });
  }
}
