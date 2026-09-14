export type TestWitnessErrorCode =
  | 'INVALID_CONFIG'
  | 'NOT_INITIALIZED'
  | 'ALREADY_INITIALIZED'
  | 'SESSION_ALREADY_ACTIVE'
  | 'NO_ACTIVE_SESSION'
  | 'INVALID_SESSION_STATE'
  | 'SCREENSHOT_DISABLED'
  | 'SCREENSHOT_FAILED'
  | 'VIDEO_UNSUPPORTED'
  | 'VIDEO_PERMISSION_DENIED'
  | 'VIDEO_START_FAILED'
  | 'VIDEO_RECORDING_FAILED'
  | 'INSTRUMENTATION_FAILED'
  | 'EXPORT_UNAVAILABLE'
  | 'EXPORT_FAILED';

/** A stable, typed error for errors consumers are expected to handle. */
export class TestWitnessError extends Error {
  public readonly code: TestWitnessErrorCode;
  public readonly cause?: unknown;

  public constructor(code: TestWitnessErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'TestWitnessError';
    this.code = code;
    this.cause = cause;
  }
}
