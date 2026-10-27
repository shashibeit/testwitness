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
  NetworkBodyCaptureInfo,
  NetworkBodyCaptureState,
  NetworkErrorRecord,
  NetworkExchangeDetail,
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
  KnownSessionWarningCode,
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
  SessionWarningSeverity,
  TestSessionResult,
  VideoCaptureStatus,
} from './types/session';
export { TestWitnessError } from './utils/errors';
export type { TestWitnessErrorCode } from './utils/errors';
export { TestWitness } from './core/TestWitness';
export { resolveTestWitnessConfig } from './core/config';
export {
  ActionRecorder,
  type ActionDataSanitizer,
  type ActionRecorderOptions,
} from './capture/ActionRecorder';
export {
  ConsoleRecorder,
  type ConsoleRecorderOptions,
  type ConsoleTarget,
} from './capture/ConsoleRecorder';
export {
  NetworkRecorder,
  type NetworkRecorderOptions,
  type NetworkTarget,
} from './capture/NetworkRecorder';
export { DataSanitizer, REDACTED_VALUE, type DataSanitizerOptions } from './privacy/DataSanitizer';
export {
  InMemoryEvidenceStore,
  type EvidenceSnapshot,
  type EvidenceStore,
  type InMemoryEvidenceStoreOptions,
  type MemoryWarning,
} from './evidence/EvidenceStore';
export {
  EVIDENCE_ARCHIVE_SCHEMA_VERSION,
  EvidenceExporter,
  generateEvidenceFileName,
  type EvidenceArchiveManifest,
} from './evidence/EvidenceExporter';
export { escapeHtml, HtmlReportGenerator } from './evidence/HtmlReportGenerator';
export type { ReportAssetManifest } from './evidence/HtmlReportGenerator';
