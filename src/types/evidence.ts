import type { ConsoleLevel } from './config';

export type ActionType =
  | 'click'
  | 'form-submit'
  | 'input-change'
  | 'navigation'
  | 'history-push'
  | 'history-replace'
  | 'popstate'
  | 'hashchange';

export interface ActionRecord {
  sequence: number;
  timestamp: string;
  type: ActionType;
  elementTag?: string;
  elementIdentifier?: string;
  elementText?: string;
  value?: string;
  url: string;
}

export type SanitizedValue =
  string | number | boolean | null | SanitizedValue[] | { [key: string]: SanitizedValue };

export interface ConsoleLogRecord {
  id: string;
  timestamp: string;
  level: ConsoleLevel;
  message: string;
  arguments: SanitizedValue[];
  url: string;
}

export type NetworkFailureType = 'http-error' | 'network-error' | 'timeout' | 'abort';
export type NetworkRequestOutcome = 'success' | NetworkFailureType;
export type NetworkTransport = 'fetch' | 'xhr';
export type NetworkBodyCaptureState =
  'disabled' | 'captured' | 'empty' | 'unavailable' | 'omitted-binary' | 'truncated';

export interface NetworkBodyCaptureInfo {
  state: NetworkBodyCaptureState;
  /** Number of source bytes read before sanitization, when known. */
  capturedBytes?: number;
  /** Full source size when the browser exposes it. */
  originalBytes?: number;
}

/** Browser-visible, privacy-sanitized request/response detail shared by activity and errors. */
export interface NetworkExchangeDetail {
  /** Wall-clock request start. `timestamp` remains the completion time for compatibility. */
  startedAt?: string;
  completedAt?: string;
  /** Sanitized page URL from which the request was observed. */
  documentUrl?: string;
  /** Final sanitized response URL, including redirects when exposed by the browser. */
  responseUrl?: string;
  statusText?: string;
  redirected?: boolean;
  responseType?: string;
  requestMode?: string;
  credentialsMode?: string;
  cacheMode?: string;
  redirectMode?: string;
  timeoutMs?: number;
  withCredentials?: boolean;
  requestContentType?: string;
  responseContentType?: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBodyCapture?: NetworkBodyCaptureInfo;
  responseBodyCapture?: NetworkBodyCaptureInfo;
  /** Present only when request-body capture was explicitly enabled. */
  requestBody?: SanitizedValue;
  /** Present only when response-body capture was explicitly enabled. */
  responseBody?: SanitizedValue;
}

/** Privacy-minimized request activity used for endpoint and success/failure reporting. */
export interface NetworkRequestRecord extends NetworkExchangeDetail {
  id: string;
  timestamp: string;
  transport: NetworkTransport;
  method: string;
  url: string;
  status?: number;
  durationMs: number;
  outcome: NetworkRequestOutcome;
}

export interface NetworkErrorRecord extends NetworkExchangeDetail {
  id: string;
  timestamp: string;
  transport: NetworkTransport;
  method: string;
  url: string;
  status?: number;
  durationMs: number;
  failureType: NetworkFailureType;
}

export interface ScreenshotRecord {
  id: string;
  timestamp: string;
  label: string;
  url: string;
  actionSequence: number;
  blob: Blob;
  fileName: string;
}

export interface VideoRecord {
  id: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  mimeType: string;
  blob: Blob;
  fileName: 'recording.webm';
  stopReason:
    'session-stopped' | 'duration-limit' | 'user-ended-sharing' | 'recorder-error' | 'destroyed';
}

export interface NoteRecord {
  id: string;
  timestamp: string;
  text: string;
  url: string;
  actionSequence: number;
}
