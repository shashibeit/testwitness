export type ScreenshotFormat = 'png' | 'jpeg';
export type ConsoleLevel = 'warn' | 'error';
export type ToolbarPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** Configuration accepted by {@link TestWitness}. All nested settings are optional. */
export interface TestWitnessConfig {
  applicationName: string;
  environment: string;
  releaseVersion?: string;
  tester?: {
    name?: string;
    employeeId?: string;
  };
  session?: {
    testCaseId?: string;
    testCaseName?: string;
    requirementId?: string;
  };
  screenshot?: {
    enabled?: boolean;
    format?: ScreenshotFormat;
    quality?: number;
    captureOnError?: boolean;
    /** Captures one checkpoint shortly after a session starts. Defaults to false. */
    captureOnStart?: boolean;
    /** Captures a checkpoint after recorded same-document navigation. Defaults to false. */
    captureOnNavigation?: boolean;
    /** Periodic checkpoint interval. Set to 0 to disable periodic capture. */
    autoCaptureIntervalSeconds?: number;
    /** Safety limit for automatically triggered screenshots in one session. */
    maxAutomaticScreenshots?: number;
  };
  video?: {
    enabled?: boolean;
    mimeType?: string;
    maxDurationMinutes?: number;
    includeAudio?: boolean;
  };
  actions?: {
    enabled?: boolean;
    captureClicks?: boolean;
    captureFormSubmissions?: boolean;
    captureInputChanges?: boolean;
    captureNavigation?: boolean;
    /** High-risk opt-in. Password, hidden, file, and sensitive fields remain excluded. */
    captureTextInputValues?: boolean;
  };
  console?: {
    enabled?: boolean;
    levels?: ConsoleLevel[];
  };
  network?: {
    enabled?: boolean;
    /** Records sanitized method/URL/status/duration metadata for successful fetch and XHR calls. */
    captureSuccessfulRequests?: boolean;
    captureFailedFetch?: boolean;
    captureFailedXhr?: boolean;
    captureRequestBody?: boolean;
    captureResponseBody?: boolean;
  };
  privacy?: {
    maskSelectors?: string[];
    excludeSelectors?: string[];
    sensitiveFieldNames?: string[];
    sensitiveQueryParameters?: string[];
    redactHeaders?: string[];
  };
  toolbar?: {
    enabled?: boolean;
    position?: ToolbarPosition;
  };
  export?: {
    fileNamePattern?: string;
    includeHtmlReport?: boolean;
    includeJsonReport?: boolean;
  };
  memory?: {
    /** Emits a warning after this approximate in-memory evidence size is reached. */
    warningThresholdMb?: number;
  };
}

export interface ResolvedTestWitnessConfig {
  applicationName: string;
  environment: string;
  releaseVersion?: string;
  tester: {
    name?: string;
    employeeId?: string;
  };
  session: {
    testCaseId?: string;
    testCaseName?: string;
    requirementId?: string;
  };
  screenshot: {
    enabled: boolean;
    format: ScreenshotFormat;
    quality: number;
    captureOnError: boolean;
    captureOnStart: boolean;
    captureOnNavigation: boolean;
    autoCaptureIntervalSeconds: number;
    maxAutomaticScreenshots: number;
  };
  video: {
    enabled: boolean;
    mimeType: string;
    maxDurationMinutes: number;
    includeAudio: boolean;
  };
  actions: {
    enabled: boolean;
    captureClicks: boolean;
    captureFormSubmissions: boolean;
    captureInputChanges: boolean;
    captureNavigation: boolean;
    captureTextInputValues: boolean;
  };
  console: {
    enabled: boolean;
    levels: ConsoleLevel[];
  };
  network: {
    enabled: boolean;
    captureSuccessfulRequests: boolean;
    captureFailedFetch: boolean;
    captureFailedXhr: boolean;
    captureRequestBody: boolean;
    captureResponseBody: boolean;
  };
  privacy: {
    maskSelectors: string[];
    excludeSelectors: string[];
    sensitiveFieldNames: string[];
    sensitiveQueryParameters: string[];
    redactHeaders: string[];
  };
  toolbar: {
    enabled: boolean;
    position: ToolbarPosition;
  };
  export: {
    fileNamePattern: string;
    includeHtmlReport: boolean;
    includeJsonReport: boolean;
  };
  memory: {
    warningThresholdMb: number;
  };
}
