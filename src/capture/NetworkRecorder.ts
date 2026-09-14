import type { DataSanitizer } from '../privacy/DataSanitizer';
import type { ResolvedTestWitnessConfig } from '../types/config';
import type {
  NetworkErrorRecord,
  NetworkFailureType,
  NetworkRequestOutcome,
  NetworkRequestRecord,
  NetworkTransport,
  SanitizedValue,
} from '../types/evidence';
import { TestWitnessError } from '../utils/errors';
import { createId } from '../utils/ids';

const MAX_BODY_BYTES = 64 * 1024;

export interface NetworkTarget {
  fetch?: typeof fetch;
  XMLHttpRequest?: typeof XMLHttpRequest;
  Request?: typeof Request;
  URL?: typeof URL;
}

export interface NetworkRecorderOptions {
  config: ResolvedTestWitnessConfig['network'];
  sanitizer: DataSanitizer;
  onRecord: (record: NetworkErrorRecord) => void;
  onRequest?: (record: NetworkRequestRecord) => void;
  onError?: (error: unknown) => void;
  target?: NetworkTarget;
  timestampProvider?: () => string;
  monotonicTimeProvider?: () => number;
  idFactory?: () => string;
}

interface MethodPatch {
  owner: object;
  key: PropertyKey;
  original: (...arguments_: unknown[]) => unknown;
  wrapper: (...arguments_: unknown[]) => unknown;
  descriptor?: PropertyDescriptor;
}

interface RequestDetails {
  method: string;
  url: string;
  requestHeaders?: Record<string, string>;
  requestBody?: SanitizedValue;
}

interface XhrContext {
  method: string;
  url: string;
  headers: Record<string, string>;
  startedAt?: number;
  requestBody?: SanitizedValue;
  recorded: boolean;
  cleanup?: () => void;
}

type FetchOutcome = { succeeded: true; response: Response } | { succeeded: false; error: unknown };

function installMethod(
  owner: object,
  key: PropertyKey,
  wrapperFactory: (
    original: (...arguments_: unknown[]) => unknown,
  ) => (...arguments_: unknown[]) => unknown,
): MethodPatch {
  const originalValue: unknown = Reflect.get(owner, key);
  if (typeof originalValue !== 'function') {
    throw new TestWitnessError(
      'INSTRUMENTATION_FAILED',
      `${String(key)} is unavailable and cannot be instrumented.`,
    );
  }

  const original = originalValue as (...arguments_: unknown[]) => unknown;
  const wrapper = wrapperFactory(original);
  const descriptor = Object.getOwnPropertyDescriptor(owner, key);

  try {
    if (descriptor && 'value' in descriptor) {
      Object.defineProperty(owner, key, { ...descriptor, value: wrapper });
    } else if (descriptor) {
      Object.defineProperty(owner, key, {
        configurable: descriptor.configurable,
        enumerable: descriptor.enumerable,
        value: wrapper,
        writable: true,
      });
    } else {
      Object.defineProperty(owner, key, {
        configurable: true,
        enumerable: false,
        value: wrapper,
        writable: true,
      });
    }
  } catch (error) {
    throw new TestWitnessError(
      'INSTRUMENTATION_FAILED',
      `${String(key)} could not be instrumented.`,
      error,
    );
  }

  return { owner, key, original, wrapper, descriptor };
}

function restoreMethod(patch: MethodPatch | undefined): void {
  if (!patch || Reflect.get(patch.owner, patch.key) !== patch.wrapper) return;
  if (patch.descriptor) Object.defineProperty(patch.owner, patch.key, patch.descriptor);
  else Reflect.deleteProperty(patch.owner, patch.key);
}

function defaultTarget(): NetworkTarget {
  if (typeof window === 'undefined') return {};
  return window;
}

function argumentString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof URL) return value.href;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return '';
}

function errorName(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'name' in error) {
    const name: unknown = Reflect.get(error, 'name');
    return typeof name === 'string' ? name : '';
  }
  return '';
}

function rejectedFailureType(error: unknown): NetworkFailureType {
  const name = errorName(error);
  if (name === 'AbortError') return 'abort';
  if (name === 'TimeoutError') return 'timeout';
  return 'network-error';
}

function boundedBody(value: unknown): unknown {
  return typeof value === 'string' && value.length > MAX_BODY_BYTES
    ? `${value.slice(0, MAX_BODY_BYTES)}…`
    : value;
}

/** Instruments failed fetch and XMLHttpRequest calls while preserving host behavior. */
export class NetworkRecorder {
  readonly #config: ResolvedTestWitnessConfig['network'];
  readonly #sanitizer: DataSanitizer;
  readonly #onRecord: (record: NetworkErrorRecord) => void;
  readonly #onRequest: (record: NetworkRequestRecord) => void;
  readonly #onError: (error: unknown) => void;
  readonly #target: NetworkTarget;
  readonly #timestampProvider: () => string;
  readonly #monotonicTimeProvider: () => number;
  readonly #idFactory: () => string;
  readonly #pending = new Set<Promise<void>>();
  readonly #xhrContexts = new WeakMap<XMLHttpRequest, XhrContext>();
  readonly #activeXhrCleanups = new Set<() => void>();
  #fetchPatch?: MethodPatch;
  #xhrPatches: MethodPatch[] = [];
  #started = false;
  #paused = false;
  #suppressionDepth = 0;
  #generation = 0;

  public constructor(options: NetworkRecorderOptions) {
    this.#config = options.config;
    this.#sanitizer = options.sanitizer;
    this.#onRecord = options.onRecord;
    this.#onRequest = options.onRequest ?? (() => undefined);
    this.#onError = options.onError ?? (() => undefined);
    this.#target = options.target ?? defaultTarget();
    this.#timestampProvider = options.timestampProvider ?? (() => new Date().toISOString());
    this.#monotonicTimeProvider =
      options.monotonicTimeProvider ?? (() => globalThis.performance?.now() ?? Date.now());
    this.#idFactory = options.idFactory ?? (() => createId('network'));
  }

  public start(): void {
    if (this.#started) return;
    this.#started = true;
    this.#generation += 1;
    this.#paused = false;
    if (!this.#config.enabled) return;

    try {
      if (
        (this.#config.captureFailedFetch || this.#config.captureSuccessfulRequests) &&
        typeof this.#target.fetch === 'function'
      ) {
        this.installFetch();
      }
      if (
        (this.#config.captureFailedXhr || this.#config.captureSuccessfulRequests) &&
        this.#target.XMLHttpRequest
      ) {
        this.installXhr(this.#target.XMLHttpRequest.prototype);
      }
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  public pause(): void {
    if (this.#started) this.#paused = true;
  }

  public resume(): void {
    if (this.#started) this.#paused = false;
  }

  public stop(): void {
    this.#generation += 1;
    restoreMethod(this.#fetchPatch);
    this.#fetchPatch = undefined;
    for (const patch of this.#xhrPatches.reverse()) restoreMethod(patch);
    this.#xhrPatches = [];
    for (const cleanup of [...this.#activeXhrCleanups]) cleanup();
    this.#activeXhrCleanups.clear();
    this.#started = false;
    this.#paused = false;
    this.#suppressionDepth = 0;
  }

  public async drain(): Promise<void> {
    while (this.#pending.size > 0) {
      await Promise.allSettled([...this.#pending]);
    }
  }

  public async runSuppressed<Result>(operation: () => Promise<Result>): Promise<Result> {
    this.#suppressionDepth += 1;
    try {
      return await operation();
    } finally {
      this.#suppressionDepth = Math.max(0, this.#suppressionDepth - 1);
    }
  }

  private installFetch(): void {
    const target = this.#target;
    this.#fetchPatch = installMethod(target, 'fetch', (original) => {
      // A normal function must preserve the host-provided fetch receiver.
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const recorder = this;
      return function wrappedFetch(this: unknown, ...arguments_: unknown[]): unknown {
        const input = arguments_[0] as RequestInfo | URL;
        const init = arguments_[1] as RequestInit | undefined;
        const shouldCapture = recorder.isCapturing();
        const generation = recorder.#generation;
        const startedAt = recorder.safeMonotonicTime();
        const requestClone = shouldCapture
          ? recorder.cloneRequestForBodyCapture(input, init)
          : undefined;
        let promise: Promise<Response>;
        try {
          promise = Reflect.apply(original, this, arguments_) as Promise<Response>;
        } catch (error) {
          if (shouldCapture && recorder.isGenerationCapturing(generation)) {
            recorder.safeRecordFrom(() => {
              const details = recorder.fetchDetails(input, init);
              return recorder.baseRecord('fetch', details, rejectedFailureType(error), startedAt);
            });
          }
          throw error;
        }

        if (shouldCapture) {
          const outcome = promise.then<FetchOutcome, FetchOutcome>(
            (response) => ({ succeeded: true, response }),
            (error: unknown) => ({ succeeded: false, error }),
          );
          const observation = Promise.all([
            recorder.prepareFetchDetails(input, init, requestClone),
            outcome,
          ]).then(async ([details, result]) => {
            if (!recorder.isGenerationCapturing(generation)) return;
            if (result.succeeded) {
              await recorder.observeFetchResponse(result.response, details, startedAt, generation);
            } else {
              recorder.recordFetchFailure(
                details,
                rejectedFailureType(result.error),
                startedAt,
                generation,
              );
            }
          });
          recorder.track(observation);
        }
        return promise;
      };
    });
  }

  private installXhr(prototype: XMLHttpRequest): void {
    const openPatch = installMethod(prototype, 'open', (original) => {
      // A normal function must preserve each XMLHttpRequest instance as `this`.
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const recorder = this;
      return function wrappedOpen(this: XMLHttpRequest, ...arguments_: unknown[]): unknown {
        const result = Reflect.apply(original, this, arguments_);
        if (!recorder.#started) return result;
        recorder.#xhrContexts.get(this)?.cleanup?.();
        try {
          recorder.#xhrContexts.set(this, {
            method: typeof arguments_[0] === 'string' ? arguments_[0].toUpperCase() : 'GET',
            url: recorder.#sanitizer.sanitizeUrl(argumentString(arguments_[1])),
            headers: Object.create(null) as Record<string, string>,
            recorded: false,
          });
        } catch (error) {
          recorder.reportError(error);
        }
        return result;
      };
    });
    this.#xhrPatches.push(openPatch);

    const headerPatch = installMethod(prototype, 'setRequestHeader', (original) => {
      // A normal function must preserve each XMLHttpRequest instance as `this`.
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const recorder = this;
      return function wrappedSetRequestHeader(
        this: XMLHttpRequest,
        ...arguments_: unknown[]
      ): unknown {
        const result = Reflect.apply(original, this, arguments_);
        const context = recorder.#xhrContexts.get(this);
        const name = argumentString(arguments_[0]);
        const value = argumentString(arguments_[1]);
        if (context && name) {
          try {
            const sanitized = recorder.#sanitizer.sanitizeHeaders({ [name]: value });
            const normalizedName = name.toLowerCase();
            const sanitizedValue = sanitized[normalizedName] ?? '[REDACTED]';
            context.headers[normalizedName] = context.headers[normalizedName]
              ? `${context.headers[normalizedName]}, ${sanitizedValue}`
              : sanitizedValue;
          } catch (error) {
            recorder.reportError(error);
          }
        }
        return result;
      };
    });
    this.#xhrPatches.push(headerPatch);

    const sendPatch = installMethod(prototype, 'send', (original) => {
      // A normal function must preserve each XMLHttpRequest instance as `this`.
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const recorder = this;
      return function wrappedSend(this: XMLHttpRequest, ...arguments_: unknown[]): unknown {
        const context = recorder.#xhrContexts.get(this);
        const shouldCapture = Boolean(context && recorder.isCapturing());
        if (context && shouldCapture) {
          try {
            context.startedAt = recorder.safeMonotonicTime();
            context.recorded = false;
            if (recorder.#config.captureRequestBody && arguments_[0] != null) {
              context.requestBody = recorder.#sanitizer.sanitizeBody(boundedBody(arguments_[0]));
            }
            recorder.attachXhrListeners(this, context);
          } catch (error) {
            recorder.reportError(error);
            context.cleanup?.();
          }
        }

        try {
          return Reflect.apply(original, this, arguments_);
        } catch (error) {
          context?.cleanup?.();
          throw error;
        }
      };
    });
    this.#xhrPatches.push(sendPatch);
  }

  private fetchDetails(input: RequestInfo | URL, init?: RequestInit): RequestDetails {
    const request = this.requestFromInput(input);
    const rawUrl = request?.url ?? argumentString(input);
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
    const headers = init?.headers ?? request?.headers;
    const requestHeaders = headers ? this.#sanitizer.sanitizeHeaders(headers) : undefined;
    const rawBody = init?.body;
    const requestBody =
      this.#config.captureRequestBody && rawBody != null
        ? this.#sanitizer.sanitizeBody(boundedBody(rawBody))
        : undefined;
    return {
      method,
      url: this.#sanitizer.sanitizeUrl(rawUrl),
      requestHeaders,
      requestBody,
    };
  }

  private async prepareFetchDetails(
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    requestClone: Request | undefined,
  ): Promise<RequestDetails> {
    const details = this.fetchDetails(input, init);
    if (this.#config.captureRequestBody && init?.body == null && requestClone?.body) {
      details.requestBody = this.#sanitizer.sanitizeBody(
        await this.readBodyStream(requestClone.body),
      );
    }
    return details;
  }

  private requestFromInput(input: RequestInfo | URL): Request | undefined {
    const constructor = this.#target.Request ?? globalThis.Request;
    return typeof constructor === 'function' && input instanceof constructor ? input : undefined;
  }

  private cloneRequestForBodyCapture(
    input: RequestInfo | URL,
    init: RequestInit | undefined,
  ): Request | undefined {
    if (!this.#config.captureRequestBody || init?.body != null) return undefined;
    try {
      return this.requestFromInput(input)?.clone();
    } catch (error) {
      this.reportError(error);
      return undefined;
    }
  }

  private async observeFetchResponse(
    response: Response,
    details: RequestDetails,
    startedAt: number,
    generation: number,
  ): Promise<void> {
    if (response.status < 400 || response.status > 599) {
      if (this.#config.captureSuccessfulRequests && this.isGenerationCapturing(generation)) {
        this.safeRequestFrom(() =>
          this.baseRequest('fetch', details, 'success', startedAt, response.status),
        );
      }
      return;
    }
    const record = this.baseRecord('fetch', details, 'http-error', startedAt, response.status);
    if (this.#config.captureFailedFetch) {
      record.responseHeaders = this.#sanitizer.sanitizeHeaders(response.headers);
    }
    if (this.#config.captureFailedFetch && this.#config.captureResponseBody) {
      try {
        const body = await this.readResponseText(response);
        if (!this.isGenerationCapturing(generation)) return;
        record.responseBody = this.#sanitizer.sanitizeBody(body);
      } catch (error) {
        this.reportError(error);
      }
    }
    if (this.isGenerationCapturing(generation)) this.safeRecord(record);
  }

  private recordFetchFailure(
    details: RequestDetails,
    failureType: NetworkFailureType,
    startedAt: number,
    generation: number,
  ): void {
    if (!this.isGenerationCapturing(generation)) return;
    this.safeRecordFrom(() => this.baseRecord('fetch', details, failureType, startedAt));
  }

  private baseRecord(
    transport: NetworkTransport,
    details: RequestDetails,
    failureType: NetworkFailureType,
    startedAt: number,
    status?: number,
  ): NetworkErrorRecord {
    return {
      id: this.#idFactory(),
      timestamp: this.#timestampProvider(),
      transport,
      method: details.method,
      url: details.url,
      status,
      durationMs: Math.max(0, this.safeMonotonicTime() - startedAt),
      failureType,
      requestHeaders: details.requestHeaders,
      requestBody: details.requestBody,
    };
  }

  private baseRequest(
    transport: NetworkTransport,
    details: RequestDetails,
    outcome: NetworkRequestOutcome,
    startedAt: number,
    status?: number,
  ): NetworkRequestRecord {
    return {
      id: this.#idFactory(),
      timestamp: this.#timestampProvider(),
      transport,
      method: details.method,
      url: details.url,
      status,
      durationMs: Math.max(0, this.safeMonotonicTime() - startedAt),
      outcome,
    };
  }

  private attachXhrListeners(xhr: XMLHttpRequest, context: XhrContext): void {
    context.cleanup?.();

    const record = (failureType: NetworkFailureType): void => {
      if (context.recorded) return;
      context.recorded = true;
      this.safeRecordFrom(() => this.createXhrRecord(xhr, context, failureType));
    };
    const handleError = (): void => record('network-error');
    const handleTimeout = (): void => record('timeout');
    const handleAbort = (): void => record('abort');
    const handleLoadEnd = (): void => {
      const status = this.readXhrStatus(xhr);
      if (!context.recorded) {
        if (status >= 400 && status <= 599) {
          record('http-error');
        } else if (status === 0) {
          record('network-error');
        } else if (this.#config.captureSuccessfulRequests) {
          context.recorded = true;
          this.safeRequestFrom(() => this.createXhrRequest(xhr, context, 'success'));
        }
      }
      cleanup();
    };
    const cleanup = (): void => {
      xhr.removeEventListener('error', handleError);
      xhr.removeEventListener('timeout', handleTimeout);
      xhr.removeEventListener('abort', handleAbort);
      xhr.removeEventListener('loadend', handleLoadEnd);
      this.#activeXhrCleanups.delete(cleanup);
      if (context.cleanup === cleanup) context.cleanup = undefined;
      this.#xhrContexts.delete(xhr);
    };

    xhr.addEventListener('error', handleError);
    xhr.addEventListener('timeout', handleTimeout);
    xhr.addEventListener('abort', handleAbort);
    xhr.addEventListener('loadend', handleLoadEnd);
    context.cleanup = cleanup;
    this.#activeXhrCleanups.add(cleanup);
  }

  private createXhrRecord(
    xhr: XMLHttpRequest,
    context: XhrContext,
    failureType: NetworkFailureType,
  ): NetworkErrorRecord {
    const details: RequestDetails = {
      method: context.method,
      url: context.url,
      requestHeaders: { ...context.headers },
      requestBody: context.requestBody,
    };
    const status = this.readXhrStatus(xhr);
    const record = this.baseRecord(
      'xhr',
      details,
      failureType,
      context.startedAt ?? this.safeMonotonicTime(),
      status || undefined,
    );
    try {
      record.responseHeaders = this.#sanitizer.sanitizeHeaders(xhr.getAllResponseHeaders());
    } catch (error) {
      this.reportError(error);
    }
    if (this.#config.captureResponseBody) {
      try {
        const nonTextResponse = (xhr as unknown as { readonly response: unknown }).response;
        const responseValue =
          xhr.responseType === '' || xhr.responseType === 'text'
            ? boundedBody(xhr.responseText)
            : nonTextResponse;
        record.responseBody = this.#sanitizer.sanitizeBody(responseValue);
      } catch (error) {
        this.reportError(error);
      }
    }
    return record;
  }

  private createXhrRequest(
    xhr: XMLHttpRequest,
    context: XhrContext,
    outcome: NetworkRequestOutcome,
  ): NetworkRequestRecord {
    return this.baseRequest(
      'xhr',
      { method: context.method, url: context.url },
      outcome,
      context.startedAt ?? this.safeMonotonicTime(),
      this.readXhrStatus(xhr) || undefined,
    );
  }

  private readXhrStatus(xhr: XMLHttpRequest): number {
    try {
      return Number.isFinite(xhr.status) ? xhr.status : 0;
    } catch {
      return 0;
    }
  }

  private async readResponseText(response: Response): Promise<string> {
    const clone = response.clone();
    if (!clone.body) return (await clone.text()).slice(0, MAX_BODY_BYTES);
    return await this.readBodyStream(clone.body);
  }

  private async readBodyStream(stream: ReadableStream<Uint8Array>): Promise<string> {
    const reader = stream.getReader();

    const decoder = new TextDecoder();
    let bytesRead = 0;
    let output = '';
    let reachedEnd = false;
    try {
      while (bytesRead < MAX_BODY_BYTES) {
        const { done, value } = await reader.read();
        if (done) {
          reachedEnd = true;
          break;
        }
        const remaining = MAX_BODY_BYTES - bytesRead;
        const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
        output += decoder.decode(chunk, { stream: true });
        bytesRead += chunk.byteLength;
        if (value.byteLength > remaining || bytesRead >= MAX_BODY_BYTES) {
          output += '…';
          break;
        }
      }
      output += decoder.decode();
      return output;
    } finally {
      if (!reachedEnd) {
        try {
          await reader.cancel();
        } catch {
          // The bounded evidence has already been captured; cancellation is best effort.
        }
      }
      reader.releaseLock();
    }
  }

  private isCapturing(): boolean {
    return this.#started && !this.#paused && this.#suppressionDepth === 0;
  }

  private isGenerationCapturing(generation: number): boolean {
    return generation === this.#generation && this.isCapturing();
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

  private safeRecordFrom(createRecord: () => NetworkErrorRecord): void {
    try {
      this.safeRecord(createRecord());
    } catch (error) {
      this.reportError(error);
    }
  }

  private safeRecord(record: NetworkErrorRecord): void {
    if (!this.shouldCaptureFailure(record.transport)) return;
    try {
      this.#onRecord(record);
    } catch (error) {
      this.reportError(error);
    }
    this.safeRequest({
      id: record.id,
      timestamp: record.timestamp,
      transport: record.transport,
      method: record.method,
      url: record.url,
      status: record.status,
      durationMs: record.durationMs,
      outcome: record.failureType,
    });
  }

  private safeRequestFrom(createRecord: () => NetworkRequestRecord): void {
    try {
      this.safeRequest(createRecord());
    } catch (error) {
      this.reportError(error);
    }
  }

  private safeRequest(record: NetworkRequestRecord): void {
    try {
      this.#onRequest(record);
    } catch (error) {
      this.reportError(error);
    }
  }

  private shouldCaptureFailure(transport: NetworkTransport): boolean {
    return transport === 'fetch' ? this.#config.captureFailedFetch : this.#config.captureFailedXhr;
  }

  private reportError(error: unknown): void {
    try {
      this.#onError(error);
    } catch {
      // Recorder diagnostics must never alter application requests.
    }
  }

  private track(task: Promise<void>): void {
    const settled = task.catch((error: unknown) => this.reportError(error));
    this.#pending.add(settled);
    void settled.then(() => this.#pending.delete(settled));
  }
}
