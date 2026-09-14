import type {
  ActionRecord,
  ConsoleLogRecord,
  NetworkErrorRecord,
  NetworkRequestRecord,
  NoteRecord,
  ScreenshotRecord,
  VideoRecord,
} from './evidence';

export type SessionStatus = 'idle' | 'recording' | 'paused' | 'stopped';
export type SessionResultStatus = 'passed' | 'failed' | 'blocked' | 'not-set';
/** Observable browser-tab video lifecycle for UI integrations and diagnostics. */
export type VideoCaptureStatus =
  | 'off'
  | 'requesting-permission'
  | 'recording'
  | 'paused'
  | 'finalizing'
  | 'captured'
  | 'unavailable';

export interface SessionStartMetadata {
  testCaseId?: string;
  testCaseName?: string;
  requirementId?: string;
  testerName?: string;
  testerEmployeeId?: string;
  /** Additional non-sensitive values to include in metadata and the report. */
  custom?: Record<string, string | number | boolean | null>;
}

/** Per-session capture choices. Omitted values use the library configuration defaults. */
export interface SessionStartOptions {
  /** Explicitly enables or disables browser-tab video for this session. */
  captureVideo?: boolean;
}

export interface BrowserMetadata {
  name: string;
  version: string;
}

export interface OperatingSystemMetadata {
  name: string;
  version?: string;
}

export interface Dimensions {
  width: number;
  height: number;
}

export interface SessionMetadata {
  sessionId: string;
  applicationName: string;
  environment: string;
  releaseVersion?: string;
  testerName?: string;
  testerEmployeeId?: string;
  testCaseId?: string;
  testCaseName?: string;
  requirementId?: string;
  startedAt: string;
  endedAt?: string;
  durationMs: number;
  currentUrl: string;
  pageTitle: string;
  browser: BrowserMetadata;
  operatingSystem: OperatingSystemMetadata;
  viewport: Dimensions;
  screen: Dimensions;
  libraryVersion: string;
  result: SessionResultStatus;
  custom: Record<string, string | number | boolean | null>;
}

export interface EvidenceCounts {
  screenshots: number;
  actions: number;
  consoleLogs: number;
  /** All recorded fetch/XHR outcomes, including failures. */
  networkRequests: number;
  successfulRequests: number;
  networkErrors: number;
  notes: number;
  hasVideo: boolean;
}

export type SessionWarningCode =
  | 'VIDEO_UNAVAILABLE'
  | 'VIDEO_ENDED'
  | 'CAPTURE_FAILED'
  | 'SCREENSHOT_LIMIT_REACHED'
  | 'MEMORY_THRESHOLD_REACHED'
  | 'RECORDER_ERROR';

/** A recoverable problem that did not invalidate the rest of the evidence session. */
export interface SessionWarning {
  code: SessionWarningCode;
  message: string;
  timestamp: string;
}

export interface SessionSummary {
  sessionId?: string;
  status: SessionStatus;
  result: SessionResultStatus;
  startedAt?: string;
  endedAt?: string;
  durationMs: number;
  evidence: EvidenceCounts;
  approximateSizeBytes: number;
  memoryWarningReached: boolean;
  /** Detailed video state. Session status `recording` does not imply video is recording. */
  videoStatus: VideoCaptureStatus;
  /** Backward-compatible convenience flag for active or paused video capture. */
  videoRecording: boolean;
  warnings: SessionWarning[];
}

export interface TestSessionResult {
  metadata: SessionMetadata;
  summary: SessionSummary;
}

export interface SessionEvidence {
  metadata: SessionMetadata;
  screenshots: ScreenshotRecord[];
  actions: ActionRecord[];
  consoleLogs: ConsoleLogRecord[];
  networkRequests: NetworkRequestRecord[];
  networkErrors: NetworkErrorRecord[];
  notes: NoteRecord[];
  video?: VideoRecord;
}

export interface DownloadEvidenceResult {
  fileName: string;
  blob: Blob;
  sizeBytes: number;
}
