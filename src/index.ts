export type {
  ConsoleLevel,
  ResolvedTestWitnessConfig,
  ScreenshotFormat,
  TestWitnessConfig,
  ToolbarPosition,
} from './types/config';
export type {
  ActionRecord,
  ActionType,
  ConsoleLogRecord,
  NetworkErrorRecord,
  NetworkFailureType,
  NetworkRequestOutcome,
  NetworkRequestRecord,
  NetworkTransport,
  NoteRecord,
  SanitizedValue,
  ScreenshotRecord,
  VideoRecord,
} from './types/evidence';
export type {
  BrowserMetadata,
  Dimensions,
  DownloadEvidenceResult,
  EvidenceCounts,
  OperatingSystemMetadata,
  SessionEvidence,
  SessionMetadata,
  SessionResultStatus,
  SessionStartMetadata,
  SessionStartOptions,
  SessionStatus,
  SessionSummary,
  SessionWarning,
  SessionWarningCode,
  TestSessionResult,
  VideoCaptureStatus,
} from './types/session';
export { TestWitnessError } from './utils/errors';
export type { TestWitnessErrorCode } from './utils/errors';
export { TestWitness } from './core/TestWitness';
export { resolveTestWitnessConfig } from './core/config';
export {
  InMemoryEvidenceStore,
  type EvidenceSnapshot,
  type EvidenceStore,
  type InMemoryEvidenceStoreOptions,
  type MemoryWarning,
} from './evidence/EvidenceStore';
export { EvidenceExporter, generateEvidenceFileName } from './evidence/EvidenceExporter';
export { escapeHtml, HtmlReportGenerator } from './evidence/HtmlReportGenerator';
export type { ReportAssetManifest } from './evidence/HtmlReportGenerator';
