import type { DataSanitizer } from '../privacy/DataSanitizer';
import type { ResolvedTestWitnessConfig } from '../types/config';
import type {
  NetworkBodyCaptureInfo,
  NetworkErrorRecord,
  NetworkExchangeDetail,
  NetworkFailureType,
  NetworkRequestOutcome,
  NetworkRequestRecord,
  NetworkTransport,
  SanitizedValue,
} from '../types/evidence';
import { TestWitnessError } from '../utils/errors';
import { createId } from '../utils/ids';

const MAX_BODY_BYTES = 64 * 1024;
const MAX_BODY_READ_MILLISECONDS = 2_000;
const BINARY_OMITTED_VALUE = '[BINARY OMITTED]';

export interface NetworkTarget {
  fetch?: typeof fetch;
  XMLHttpRequest?: typeof XMLHttpRequest;
  Request?: typeof Request;
  URL?: typeof URL;
  location?: Location;
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

interface RequestDetails extends NetworkExchangeDetail {
  method: string;
  url: string;
}

interface XhrContext {
  method: string;
  url: string;
  headers: Record<string, string>;
  startedAt?: number;
  startedAtTimestamp?: string;
  documentUrl?: string;
  requestContentType?: string;
  requestBodyCapture?: NetworkBodyCaptureInfo;
  requestBody?: SanitizedValue;
  timeoutMs?: number;
  withCredentials?: boolean;
  generation?: number;
  recorded: boolean;
  cleanup?: () => void;
}

interface BodyCapture {
  info: NetworkBodyCaptureInfo;
  value?: SanitizedValue;
}

interface BodyReadResult {
  text: string;
  capturedBytes: number;
  originalBytes?: number;
  truncated: boolean;
}

type FetchOutcome =
  | {
      succeeded: true;
      response: Response;
      responseClone?: Response;
      completion: Completion;
      capturable: boolean;
    }
  | { succeeded: false; error: unknown; completion: Completion; capturable: boolean };

interface Completion {
  timestamp: string;
  monotonicTime: number;
}

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

function utf8Size(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function binaryBodySize(value: unknown): number | undefined {
  if (typeof Blob !== 'undefined' && value instanceof Blob) return value.size;
  if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) return value.byteLength;
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(value)) return value.byteLength;
  return undefined;
}

function isReadableStream(value: unknown): value is ReadableStream<Uint8Array> {
  return typeof ReadableStream !== 'undefined' && value instanceof ReadableStream;
}

function parseContentLength(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const size = Number(value);
  return Number.isFinite(size) && size >= 0 ? size : undefined;
}

function isBinaryContentType(value: string | undefined): boolean {
  if (!value) return false;
  const mediaType = value.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  if (mediaType === 'image/svg+xml') return false;
  return (
    mediaType.startsWith('image/') ||
    mediaType.startsWith('audio/') ||
    mediaType.startsWith('video/') ||
    mediaType.startsWith('font/') ||
    mediaType === 'application/octet-stream' ||
    mediaType === 'application/pdf' ||
    mediaType === 'application/zip' ||
    mediaType === 'application/gzip' ||
    mediaType === 'application/x-7z-compressed' ||
    mediaType === 'application/x-rar-compressed' ||
    mediaType === 'application/wasm'
  );
}

/** Instruments configured Fetch and XMLHttpRequest activity while preserving host behavior. */
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
        const startedAtTimestamp = recorder.safeTimestamp();
        const requestClone = shouldCapture
          ? recorder.cloneRequestForBodyCapture(input, init)
          : undefined;
        let promise: Promise<Response>;
        try {
          promise = Reflect.apply(original, this, arguments_) as Promise<Response>;
        } catch (error) {
          if (shouldCapture && recorder.isGenerationCapturing(generation)) {
            recorder.safeRecordFrom(() => {
              const details = recorder.fetchDetails(input, init, startedAtTimestamp);
              return recorder.baseRecord('fetch', details, rejectedFailureType(error), startedAt);
            });
          }
          throw error;
        }

        if (shouldCapture) {
          const outcome = promise.then<FetchOutcome, FetchOutcome>(
            (response) => ({
              succeeded: true,
              response,
              responseClone: recorder.cloneFetchResponseForCapture(response),
              completion: recorder.captureCompletion(),
              capturable: recorder.isGenerationCapturing(generation),
            }),
            (error: unknown) => ({
              succeeded: false,
              error,
              completion: recorder.captureCompletion(),
              capturable: recorder.isGenerationCapturing(generation),
            }),
          );
          const observation = Promise.all([
            recorder.prepareFetchDetails(input, init, requestClone, startedAtTimestamp),
            outcome,
          ]).then(async ([details, result]) => {
            if (!result.capturable || !recorder.isGenerationCapturing(generation)) return;
            if (result.succeeded) {
              await recorder.observeFetchResponse(
                result.response,
                result.responseClone,
                details,
                startedAt,
                generation,
                result.completion,
              );
            } else {
              recorder.recordFetchFailure(
                details,
                rejectedFailureType(result.error),
                startedAt,
                generation,
                result.completion,
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
            if (normalizedName === 'content-type') {
              context.requestContentType = recorder.#sanitizer.sanitizeText(value, 200);
            }
            if (recorder.#config.captureRequestHeaders) {
              context.headers[normalizedName] = context.headers[normalizedName]
                ? `${context.headers[normalizedName]}, ${sanitizedValue}`
                : sanitizedValue;
            }
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
            context.startedAtTimestamp = recorder.safeTimestamp();
            context.documentUrl = recorder.currentDocumentUrl();
            context.timeoutMs = recorder.readFiniteNumber(this, 'timeout');
            context.withCredentials = recorder.readBoolean(this, 'withCredentials');
            context.generation = recorder.#generation;
            context.recorded = false;
            const body = recorder.captureKnownBody(
              arguments_[0],
              recorder.#config.captureRequestBody,
              context.requestContentType,
            );
            context.requestBodyCapture = body.info;
            context.requestBody = body.value;
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

  private fetchDetails(
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    startedAt: string,
  ): RequestDetails {
    const request = this.requestFromInput(input);
    const rawUrl = request?.url ?? argumentString(input);
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
    const headers = init?.headers ?? request?.headers;
    const requestHeaders =
      this.#config.captureRequestHeaders && headers
        ? this.#sanitizer.sanitizeHeaders(headers)
        : undefined;
    const requestContentType = this.headerValue(headers, 'content-type');
    const rawBody = init?.body;
    const body: BodyCapture =
      rawBody != null
        ? this.captureKnownBody(rawBody, this.#config.captureRequestBody, requestContentType)
        : {
            info: {
              state: this.#config.captureRequestBody
                ? request
                  ? 'unavailable'
                  : 'empty'
                : 'disabled',
            } satisfies NetworkBodyCaptureInfo,
          };
    return {
      method,
      url: this.#sanitizer.sanitizeUrl(rawUrl),
      startedAt,
      documentUrl: this.currentDocumentUrl(),
      requestMode: init?.mode ?? request?.mode,
      credentialsMode: init?.credentials ?? request?.credentials,
      cacheMode: init?.cache ?? request?.cache,
      redirectMode: init?.redirect ?? request?.redirect,
      requestContentType,
      requestHeaders,
      requestBodyCapture: body.info,
      requestBody: body.value,
    };
  }

  private async prepareFetchDetails(
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    requestClone: Request | undefined,
    startedAt: string,
  ): Promise<RequestDetails> {
    const details = this.fetchDetails(input, init, startedAt);
    if (this.#config.captureRequestBody && init?.body == null && requestClone) {
      try {
        if (requestClone.body) {
          const capture = this.captureReadBody(
            await this.readBodyStream(requestClone.body),
            details.requestContentType,
          );
          details.requestBodyCapture = capture.info;
          details.requestBody = capture.value;
        } else {
          details.requestBodyCapture = { state: 'empty', capturedBytes: 0, originalBytes: 0 };
        }
      } catch (error) {
        this.reportError(error);
        details.requestBodyCapture = { state: 'unavailable' };
        details.requestBody = undefined;
      }
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

  private cloneFetchResponseForCapture(response: Response): Response | undefined {
    const isFailure = response.status >= 400 && response.status <= 599;
    const willRecord = isFailure
      ? this.#config.captureFailedFetch
      : this.#config.captureSuccessfulRequests;
    if (!willRecord || !this.#config.captureResponseBody) return undefined;
    try {
      return response.clone();
    } catch (error) {
      this.reportError(error);
      return undefined;
    }
  }

  private async observeFetchResponse(
    response: Response,
    responseClone: Response | undefined,
    details: RequestDetails,
    startedAt: number,
    generation: number,
    completion: Completion,
  ): Promise<void> {
    const isFailure = response.status >= 400 && response.status <= 599;
    if (isFailure ? !this.#config.captureFailedFetch : !this.#config.captureSuccessfulRequests) {
      return;
    }

    const responseDetail = await this.fetchResponseDetail(response, responseClone, details.url);
    if (!this.isGenerationCapturing(generation)) return;
    if (isFailure) {
      this.safeRecord(
        this.baseRecord(
          'fetch',
          details,
          'http-error',
          startedAt,
          response.status,
          responseDetail,
          completion,
        ),
      );
    } else {
      this.safeRequest(
        this.baseRequest(
          'fetch',
          details,
          'success',
          startedAt,
          response.status,
          responseDetail,
          completion,
        ),
      );
    }
  }

  private recordFetchFailure(
    details: RequestDetails,
    failureType: NetworkFailureType,
    startedAt: number,
    generation: number,
    completion: Completion,
  ): void {
    if (!this.isGenerationCapturing(generation)) return;
    this.safeRecordFrom(() =>
      this.baseRecord('fetch', details, failureType, startedAt, undefined, {}, completion),
    );
  }

  private baseRecord(
    transport: NetworkTransport,
    details: RequestDetails,
    failureType: NetworkFailureType,
    startedAt: number,
    status?: number,
    responseDetail: NetworkExchangeDetail = {},
    completion?: Completion,
  ): NetworkErrorRecord {
    const completedAt = completion?.timestamp ?? this.safeTimestamp();
    return {
      id: this.#idFactory(),
      timestamp: completedAt,
      completedAt,
      transport,
      method: details.method,
      url: details.url,
      status,
      durationMs: Math.max(0, (completion?.monotonicTime ?? this.safeMonotonicTime()) - startedAt),
      failureType,
      ...this.exchangeDetail(details, responseDetail),
      requestHeaders: details.requestHeaders,
      requestBody: details.requestBody,
      responseBodyCapture:
        responseDetail.responseBodyCapture ?? this.defaultUnavailableResponseBodyCapture(),
    };
  }

  private baseRequest(
    transport: NetworkTransport,
    details: RequestDetails,
    outcome: NetworkRequestOutcome,
    startedAt: number,
    status?: number,
    responseDetail: NetworkExchangeDetail = {},
    completion?: Completion,
  ): NetworkRequestRecord {
    const completedAt = completion?.timestamp ?? this.safeTimestamp();
    return {
      id: this.#idFactory(),
      timestamp: completedAt,
      completedAt,
      transport,
      method: details.method,
      url: details.url,
      status,
      durationMs: Math.max(0, (completion?.monotonicTime ?? this.safeMonotonicTime()) - startedAt),
      outcome,
      ...this.exchangeDetail(details, responseDetail),
    };
  }

  private exchangeDetail(
    request: RequestDetails,
    response: NetworkExchangeDetail,
  ): NetworkExchangeDetail {
    return {
      startedAt: request.startedAt,
      documentUrl: request.documentUrl,
      requestMode: request.requestMode,
      credentialsMode: request.credentialsMode,
      cacheMode: request.cacheMode,
      redirectMode: request.redirectMode,
      timeoutMs: request.timeoutMs,
      withCredentials: request.withCredentials,
      requestContentType: request.requestContentType,
      requestHeaders: request.requestHeaders,
      requestBodyCapture: request.requestBodyCapture,
      requestBody: request.requestBody,
      ...response,
    };
  }

  private attachXhrListeners(xhr: XMLHttpRequest, context: XhrContext): void {
    context.cleanup?.();

    const record = (failureType: NetworkFailureType): void => {
      if (context.recorded) return;
      context.recorded = true;
      if (context.generation === undefined || !this.isGenerationCapturing(context.generation)) {
        return;
      }
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
        } else if (
          this.#config.captureSuccessfulRequests &&
          context.generation !== undefined &&
          this.isGenerationCapturing(context.generation)
        ) {
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
      startedAt: context.startedAtTimestamp,
      documentUrl: context.documentUrl,
      timeoutMs: context.timeoutMs,
      withCredentials: context.withCredentials,
      requestContentType: context.requestContentType,
      requestHeaders: this.#config.captureRequestHeaders ? { ...context.headers } : undefined,
      requestBodyCapture:
        context.requestBodyCapture ?? this.defaultRequestBodyCapture(context.requestBody),
      requestBody: context.requestBody,
    };
    const status = this.readXhrStatus(xhr);
    return this.baseRecord(
      'xhr',
      details,
      failureType,
      context.startedAt ?? this.safeMonotonicTime(),
      status || undefined,
      this.xhrResponseDetail(xhr, status, context.url),
    );
  }

  private createXhrRequest(
    xhr: XMLHttpRequest,
    context: XhrContext,
    outcome: NetworkRequestOutcome,
  ): NetworkRequestRecord {
    const details: RequestDetails = {
      method: context.method,
      url: context.url,
      startedAt: context.startedAtTimestamp,
      documentUrl: context.documentUrl,
      timeoutMs: context.timeoutMs,
      withCredentials: context.withCredentials,
      requestContentType: context.requestContentType,
      requestHeaders: this.#config.captureRequestHeaders ? { ...context.headers } : undefined,
      requestBodyCapture:
        context.requestBodyCapture ?? this.defaultRequestBodyCapture(context.requestBody),
      requestBody: context.requestBody,
    };
    const status = this.readXhrStatus(xhr);
    return this.baseRequest(
      'xhr',
      details,
      outcome,
      context.startedAt ?? this.safeMonotonicTime(),
      status || undefined,
      this.xhrResponseDetail(xhr, status, context.url),
    );
  }

  private xhrResponseDetail(
    xhr: XMLHttpRequest,
    status: number,
    fallbackUrl: string,
  ): NetworkExchangeDetail {
    let responseHeaders: Record<string, string> | undefined;
    if (this.#config.captureResponseHeaders) {
      try {
        responseHeaders = this.#sanitizer.sanitizeHeaders(xhr.getAllResponseHeaders());
      } catch (error) {
        this.reportError(error);
      }
    }
    const responseContentType = responseHeaders?.['content-type'];
    let body: BodyCapture = {
      info: this.#config.captureResponseBody
        ? status === 0
          ? { state: 'unavailable' }
          : { state: 'empty', capturedBytes: 0, originalBytes: 0 }
        : { state: 'disabled' },
    };
    if (this.#config.captureResponseBody && status !== 0) {
      try {
        if (isBinaryContentType(responseContentType)) {
          body = {
            info: {
              state: 'omitted-binary',
              capturedBytes: 0,
              originalBytes: parseContentLength(responseHeaders?.['content-length']),
            },
            value: BINARY_OMITTED_VALUE,
          };
        } else {
          const responseType = this.readString(xhr, 'responseType');
          // lib.dom.d.ts intentionally declares XMLHttpRequest.response as `any` because its
          // runtime type depends on responseType; normalize it immediately as an unknown body.
          const responseValue: unknown =
            responseType === '' || responseType === 'text'
              ? this.readString(xhr, 'responseText')
              : xhr.response;
          body = this.captureKnownBody(responseValue, true, responseContentType);
        }
      } catch (error) {
        this.reportError(error);
        body = { info: { state: 'unavailable' } };
      }
    }

    const responseUrl = this.readString(xhr, 'responseURL');
    const statusText = this.readString(xhr, 'statusText');
    return {
      responseUrl: this.#sanitizer.sanitizeUrl(responseUrl || fallbackUrl),
      statusText: statusText ? this.#sanitizer.sanitizeText(statusText, 200) : undefined,
      responseType: this.readString(xhr, 'responseType') || 'text',
      responseContentType,
      responseHeaders,
      responseBodyCapture: body.info,
      responseBody: body.value,
    };
  }

  private readXhrStatus(xhr: XMLHttpRequest): number {
    try {
      return Number.isFinite(xhr.status) ? xhr.status : 0;
    } catch {
      return 0;
    }
  }

  private async fetchResponseDetail(
    response: Response,
    responseClone: Response | undefined,
    fallbackUrl: string,
  ): Promise<NetworkExchangeDetail> {
    let responseHeaders: Record<string, string> | undefined;
    if (this.#config.captureResponseHeaders) {
      try {
        responseHeaders = this.#sanitizer.sanitizeHeaders(response.headers);
      } catch (error) {
        this.reportError(error);
      }
    }
    const rawContentType = this.headerValue(response.headers, 'content-type');
    let body: BodyCapture = {
      info: this.#config.captureResponseBody
        ? responseClone
          ? { state: 'unavailable' }
          : { state: 'unavailable' }
        : { state: 'disabled' },
    };
    const bodyIsOpaque =
      response.type === 'opaque' || response.type === 'opaqueredirect' || response.type === 'error';
    if (
      this.#config.captureResponseBody &&
      responseClone &&
      !bodyIsOpaque &&
      isBinaryContentType(rawContentType)
    ) {
      body = {
        info: {
          state: 'omitted-binary',
          capturedBytes: 0,
          originalBytes: parseContentLength(this.headerValue(response.headers, 'content-length')),
        },
        value: BINARY_OMITTED_VALUE,
      };
    } else if (this.#config.captureResponseBody && responseClone && !bodyIsOpaque) {
      try {
        const originalBytes = parseContentLength(
          this.headerValue(response.headers, 'content-length'),
        );
        const read = responseClone.body
          ? await this.readBodyStream(responseClone.body, originalBytes)
          : this.readTextBody(await responseClone.text(), originalBytes);
        body = this.captureReadBody(read, rawContentType);
      } catch (error) {
        this.reportError(error);
        body = { info: { state: 'unavailable' } };
      }
    }

    return {
      responseUrl: this.#sanitizer.sanitizeUrl(response.url || fallbackUrl),
      statusText: response.statusText
        ? this.#sanitizer.sanitizeText(response.statusText, 200)
        : undefined,
      redirected: response.redirected,
      responseType: response.type,
      responseContentType: rawContentType,
      responseHeaders,
      responseBodyCapture: body.info,
      responseBody: body.value,
    };
  }

  private async readBodyStream(
    stream: ReadableStream<Uint8Array>,
    originalBytes?: number,
  ): Promise<BodyReadResult> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let bytesRead = 0;
    let output = '';
    let reachedEnd = false;
    let truncated = false;
    const deadline = Date.now() + MAX_BODY_READ_MILLISECONDS;
    try {
      while (true) {
        const remainingMilliseconds = deadline - Date.now();
        if (remainingMilliseconds <= 0) throw new Error('Network body evidence read timed out.');
        const { done, value } = await new Promise<ReadableStreamReadResult<Uint8Array>>(
          (resolve, reject) => {
            const timeout = globalThis.setTimeout(
              () => reject(new Error('Network body evidence read timed out.')),
              remainingMilliseconds,
            );
            void reader.read().then(
              (result) => {
                globalThis.clearTimeout(timeout);
                resolve(result);
              },
              (error: unknown) => {
                globalThis.clearTimeout(timeout);
                reject(error instanceof Error ? error : new Error(String(error)));
              },
            );
          },
        );
        if (done) {
          reachedEnd = true;
          break;
        }
        const remaining = MAX_BODY_BYTES - bytesRead;
        if (remaining <= 0) {
          truncated = true;
          break;
        }
        const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
        output += decoder.decode(chunk, { stream: true });
        bytesRead += chunk.byteLength;
        if (value.byteLength > remaining) {
          truncated = true;
          break;
        }
      }
      output += decoder.decode();
      return {
        text: output,
        capturedBytes: bytesRead,
        originalBytes: originalBytes ?? (reachedEnd ? bytesRead : undefined),
        truncated,
      };
    } finally {
      if (!reachedEnd) {
        try {
          // A cloned Fetch body is one branch of a tee. Waiting for cancellation can block
          // until the application consumes the original branch, so cancellation is best effort.
          void reader.cancel().catch(() => undefined);
        } catch {
          // The bounded evidence has already been captured; cancellation is best effort.
        }
      }
      reader.releaseLock();
    }
  }

  private readTextBody(value: string, originalBytes?: number): BodyReadResult {
    const encoded = new TextEncoder().encode(value);
    const truncated = encoded.byteLength > MAX_BODY_BYTES;
    const captured = truncated ? encoded.slice(0, MAX_BODY_BYTES) : encoded;
    return {
      text: new TextDecoder().decode(captured),
      capturedBytes: captured.byteLength,
      originalBytes: originalBytes ?? encoded.byteLength,
      truncated,
    };
  }

  private captureKnownBody(value: unknown, enabled: boolean, contentType?: string): BodyCapture {
    if (!enabled) return { info: { state: 'disabled' } };
    if (value === null || value === undefined || value === '') {
      return { info: { state: 'empty', capturedBytes: 0, originalBytes: 0 } };
    }
    const binarySize = binaryBodySize(value);
    if (binarySize !== undefined) {
      return {
        info: {
          state: 'omitted-binary',
          capturedBytes: 0,
          originalBytes: binarySize,
        },
        value: `${BINARY_OMITTED_VALUE} (${binarySize} bytes)`,
      };
    }
    if (isReadableStream(value)) return { info: { state: 'unavailable' } };
    if (typeof value === 'string') {
      return this.captureReadBody(this.readTextBody(value), contentType);
    }

    if (typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams) {
      return this.captureReadBody(
        this.readTextBody(value.toString()),
        contentType ?? 'application/x-www-form-urlencoded',
      );
    }

    const isFormDataBody = typeof FormData !== 'undefined' && value instanceof FormData;
    let originalBytes: number | undefined;
    if (!isFormDataBody) {
      try {
        originalBytes = utf8Size(JSON.stringify(value));
      } catch {
        originalBytes = undefined;
      }
    }
    const sanitized = this.#sanitizer.sanitizeBody(value);
    try {
      const serialized = JSON.stringify(sanitized);
      const sanitizedBytes = utf8Size(serialized);
      if (sanitizedBytes > MAX_BODY_BYTES || (originalBytes ?? 0) > MAX_BODY_BYTES) {
        const capture = this.captureReadBody(
          this.readTextBody(serialized, originalBytes),
          'application/json',
        );
        capture.info.state = 'truncated';
        if (isFormDataBody) capture.info.originalBytes = undefined;
        return capture;
      }
    } catch {
      // The central sanitizer already converts ordinary cycles and unreadable properties.
    }
    return {
      info: {
        state: 'captured',
        capturedBytes: originalBytes,
        originalBytes,
      },
      value: sanitized,
    };
  }

  private captureReadBody(read: BodyReadResult, contentType?: string): BodyCapture {
    if (read.capturedBytes === 0 && read.text.length === 0) {
      return {
        info: {
          state: 'empty',
          capturedBytes: 0,
          originalBytes: read.originalBytes ?? 0,
        },
      };
    }
    return {
      info: {
        state: read.truncated ? 'truncated' : 'captured',
        capturedBytes: read.capturedBytes,
        originalBytes: read.originalBytes,
      },
      value: this.sanitizeTextBody(read.text, contentType),
    };
  }

  private sanitizeTextBody(value: string, contentType?: string): SanitizedValue {
    const normalizedType = contentType?.toLowerCase() ?? '';
    const trimmed = value.trim();
    if (
      normalizedType.includes('json') ||
      ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length > 1)
    ) {
      try {
        return this.#sanitizer.sanitizeBody(JSON.parse(value));
      } catch {
        // Invalid or partial JSON is still retained as bounded sanitized text.
      }
    }
    if (
      normalizedType.includes('application/x-www-form-urlencoded') &&
      typeof URLSearchParams !== 'undefined'
    ) {
      try {
        return this.#sanitizer.sanitizeBody(new URLSearchParams(value));
      } catch {
        // Fall through to text sanitization.
      }
    }
    return this.#sanitizer.sanitizeBody(value);
  }

  private headerValue(headers: HeadersInit | undefined, name: string): string | undefined {
    if (!headers) return undefined;
    try {
      const value = new Headers(headers).get(name);
      return value ? this.#sanitizer.sanitizeText(value, 200) : undefined;
    } catch {
      return undefined;
    }
  }

  private currentDocumentUrl(): string | undefined {
    const value = this.#target.location?.href ?? globalThis.location?.href;
    return value ? this.#sanitizer.sanitizeUrl(value) : undefined;
  }

  private readString(owner: object, key: PropertyKey): string {
    try {
      const value: unknown = Reflect.get(owner, key);
      return typeof value === 'string' ? value : '';
    } catch {
      return '';
    }
  }

  private readFiniteNumber(owner: object, key: PropertyKey): number | undefined {
    try {
      const value: unknown = Reflect.get(owner, key);
      return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : undefined;
    } catch {
      return undefined;
    }
  }

  private readBoolean(owner: object, key: PropertyKey): boolean | undefined {
    try {
      const value: unknown = Reflect.get(owner, key);
      return typeof value === 'boolean' ? value : undefined;
    } catch {
      return undefined;
    }
  }

  private defaultRequestBodyCapture(body: SanitizedValue | undefined): NetworkBodyCaptureInfo {
    if (!this.#config.captureRequestBody) return { state: 'disabled' };
    return body === undefined ? { state: 'unavailable' } : { state: 'captured' };
  }

  private defaultUnavailableResponseBodyCapture(): NetworkBodyCaptureInfo {
    return this.#config.captureResponseBody ? { state: 'unavailable' } : { state: 'disabled' };
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

  private safeTimestamp(): string {
    try {
      return this.#timestampProvider();
    } catch (error) {
      this.reportError(error);
      return new Date().toISOString();
    }
  }

  private captureCompletion(): Completion {
    return {
      timestamp: this.safeTimestamp(),
      monotonicTime: this.safeMonotonicTime(),
    };
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
    const { failureType, ...requestDetail } = record;
    this.safeRequest({
      ...requestDetail,
      id: record.id,
      timestamp: record.timestamp,
      transport: record.transport,
      method: record.method,
      url: record.url,
      status: record.status,
      durationMs: record.durationMs,
      outcome: failureType,
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
