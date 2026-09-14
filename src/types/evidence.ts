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

/** Privacy-minimized request activity used for endpoint and success/failure reporting. */
export interface NetworkRequestRecord {
  id: string;
  timestamp: string;
  transport: NetworkTransport;
  method: string;
  url: string;
  status?: number;
  durationMs: number;
  outcome: NetworkRequestOutcome;
}

export interface NetworkErrorRecord {
  id: string;
  timestamp: string;
  transport: NetworkTransport;
  method: string;
  url: string;
  status?: number;
  durationMs: number;
  failureType: NetworkFailureType;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  /** Present only when request-body capture was explicitly enabled. */
  requestBody?: SanitizedValue;
  /** Present only when response-body capture was explicitly enabled. */
  responseBody?: SanitizedValue;
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
