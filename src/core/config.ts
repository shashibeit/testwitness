import type {
  ConsoleLevel,
  ResolvedTestWitnessConfig,
  ScreenshotFormat,
  TestWitnessConfig,
  ToolbarPosition,
} from '../types/config';
import { TestWitnessError } from '../utils/errors';

/** Header names that can never be removed from redaction. */
export const DEFAULT_REDACT_HEADERS = Object.freeze([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'api-key',
  'x-auth-token',
  'access-token',
  'x-access-token',
  'refresh-token',
  'x-refresh-token',
  'x-csrf-token',
  'x-xsrf-token',
  'csrf-token',
  'xsrf-token',
  'password',
  'x-password',
  'session-id',
  'x-session-id',
  'jsessionid',
]);

/** Query-parameter names that can never be removed from redaction. */
export const DEFAULT_SENSITIVE_QUERY_PARAMETERS = Object.freeze([
  'access_token',
  'access-token',
  'accesstoken',
  'refresh_token',
  'refresh-token',
  'refreshtoken',
  'api_key',
  'api-key',
  'apikey',
  'csrf',
  'csrf_token',
  'csrf-token',
  'csrftoken',
  'xsrf',
  'xsrf_token',
  'xsrf-token',
  'xsrftoken',
  'password',
  'passwd',
  'pwd',
  'token',
  'auth',
  'authorization',
  'session',
  'session_id',
  'session-id',
  'sessionid',
  'sid',
  'jsessionid',
]);

/** Form-field names that can never be captured as input values. */
export const DEFAULT_SENSITIVE_FIELD_NAMES = Object.freeze([
  'password',
  'passwd',
  'passphrase',
  'pwd',
  'secret',
  'client_secret',
  'client-secret',
  'clientsecret',
  'access_token',
  'access-token',
  'accesstoken',
  'refresh_token',
  'refresh-token',
  'refreshtoken',
  'api_key',
  'api-key',
  'apikey',
  'csrf_token',
  'csrf-token',
  'csrftoken',
  'xsrf_token',
  'xsrf-token',
  'xsrftoken',
  'auth_token',
  'auth-token',
  'authtoken',
  'session_id',
  'session-id',
  'sessionid',
]);

const DEFAULT_MASK_SELECTORS = Object.freeze([
  'input[type="password"]',
  'input[type="file"]',
  'input[autocomplete="current-password"]',
  'input[autocomplete="new-password"]',
]);

const DEFAULT_CONSOLE_LEVELS = Object.freeze<ConsoleLevel[]>(['warn', 'error']);
const MAX_VIDEO_DURATION_MINUTES = 120;
const MAX_MEMORY_WARNING_THRESHOLD_MB = 4_096;
const MAX_SCREENSHOT_INTERVAL_SECONDS = 3_600;
const MAX_AUTOMATIC_SCREENSHOTS = 1_000;
const DEFAULT_FILE_NAME_PATTERN = 'TestWitness-{testCaseId}-{timestamp}.zip';
const DEFAULT_VIDEO_MIME_TYPE = 'video/webm';

type UnknownRecord = Record<string, unknown>;

function invalid(path: string, expectation: string): never {
  throw new TestWitnessError(
    'INVALID_CONFIG',
    `Invalid TestWitness configuration at "${path}": expected ${expectation}.`,
  );
}

function requireRecord(value: unknown, path: string): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return invalid(path, 'an object');
  }

  return value as UnknownRecord;
}

function optionalSection(value: unknown, path: string): UnknownRecord {
  return value === undefined ? {} : requireRecord(value, path);
}

function requiredTrimmedString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return invalid(path, 'a non-blank string');
  }

  return value.trim();
}

function optionalTrimmedString(value: unknown, path: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    return invalid(path, 'a string when provided');
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function nonBlankStringOrDefault(value: unknown, fallback: string, path: string): string {
  return value === undefined ? fallback : requiredTrimmedString(value, path);
}

function booleanOrDefault(value: unknown, fallback: boolean, path: string): boolean {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== 'boolean') {
    return invalid(path, 'a boolean');
  }

  return value;
}

function numberInRangeOrDefault(
  value: unknown,
  fallback: number,
  path: string,
  minimum: number,
  maximum: number,
  minimumInclusive: boolean,
): number {
  if (value === undefined) {
    return fallback;
  }

  const meetsMinimum =
    typeof value === 'number' && (minimumInclusive ? value >= minimum : value > minimum);
  if (!meetsMinimum || typeof value !== 'number' || !Number.isFinite(value) || value > maximum) {
    const opening = minimumInclusive ? '[' : '(';
    return invalid(path, `a finite number in ${opening}${minimum}, ${maximum}]`);
  }

  return value;
}

function integerInRangeOrDefault(
  value: unknown,
  fallback: number,
  path: string,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) {
    return invalid(path, `an integer in [${minimum}, ${maximum}]`);
  }
  return value;
}

function unknownArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    return invalid(path, 'an array');
  }

  return value as readonly unknown[];
}

function stringArrayOrDefault(
  value: unknown,
  fallback: readonly string[],
  path: string,
  caseInsensitive = false,
): string[] {
  const values = value === undefined ? fallback : unknownArray(value, path);
  const result: string[] = [];
  const seen = new Set<string>();

  values.forEach((entry, index) => {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      invalid(`${path}[${index}]`, 'a non-blank string');
    }

    const trimmed = entry.trim();
    const key = caseInsensitive ? trimmed.toLowerCase() : trimmed;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(trimmed);
    }
  });

  return result;
}

function unionProtectedNames(
  mandatory: readonly string[],
  configured: unknown,
  path: string,
): string[] {
  const custom = stringArrayOrDefault(configured, [], path, true);
  return stringArrayOrDefault([...mandatory, ...custom], [], path, true);
}

function screenshotFormatOrDefault(value: unknown): ScreenshotFormat {
  if (value === undefined) {
    return 'png';
  }

  if (value === 'png' || value === 'jpeg') {
    return value;
  }

  return invalid('screenshot.format', '"png" or "jpeg"');
}

function consoleLevelsOrDefault(value: unknown): ConsoleLevel[] {
  if (value === undefined) {
    return [...DEFAULT_CONSOLE_LEVELS];
  }

  const values = unknownArray(value, 'console.levels');
  const levels: ConsoleLevel[] = [];

  values.forEach((entry, index) => {
    if (entry !== 'warn' && entry !== 'error') {
      invalid(`console.levels[${index}]`, '"warn" or "error"');
    }
    if (!levels.includes(entry)) {
      levels.push(entry);
    }
  });

  return levels;
}

function toolbarPositionOrDefault(value: unknown): ToolbarPosition {
  if (value === undefined) {
    return 'bottom-right';
  }

  if (
    value === 'top-left' ||
    value === 'top-right' ||
    value === 'bottom-left' ||
    value === 'bottom-right'
  ) {
    return value;
  }

  return invalid('toolbar.position', '"top-left", "top-right", "bottom-left", or "bottom-right"');
}

function videoMimeTypeOrDefault(value: unknown): string {
  if (value === undefined) {
    return DEFAULT_VIDEO_MIME_TYPE;
  }

  const mimeType = requiredTrimmedString(value, 'video.mimeType');
  const hasControlCharacter = Array.from(mimeType).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });
  const hasValidShape =
    mimeType.length <= 255 &&
    !hasControlCharacter &&
    /^video\/[a-z0-9][a-z0-9!#$&^_.+-]*(?:\s*;\s*[^;\r\n]+)*$/iu.test(mimeType);

  if (!hasValidShape) {
    return invalid('video.mimeType', 'a syntactically valid video MIME type');
  }

  return mimeType;
}

/**
 * Validates consumer configuration and returns a fully populated, detached copy.
 * Mandatory privacy protections are additive and cannot be disabled by callers.
 */
export function resolveTestWitnessConfig(config: TestWitnessConfig): ResolvedTestWitnessConfig {
  const root = requireRecord(config, 'config');
  const tester = optionalSection(root.tester, 'tester');
  const session = optionalSection(root.session, 'session');
  const screenshot = optionalSection(root.screenshot, 'screenshot');
  const video = optionalSection(root.video, 'video');
  const actions = optionalSection(root.actions, 'actions');
  const consoleConfig = optionalSection(root.console, 'console');
  const network = optionalSection(root.network, 'network');
  const privacy = optionalSection(root.privacy, 'privacy');
  const toolbar = optionalSection(root.toolbar, 'toolbar');
  const exportConfig = optionalSection(root.export, 'export');
  const memory = optionalSection(root.memory, 'memory');

  return {
    applicationName: requiredTrimmedString(root.applicationName, 'applicationName'),
    environment: requiredTrimmedString(root.environment, 'environment'),
    releaseVersion: optionalTrimmedString(root.releaseVersion, 'releaseVersion'),
    tester: {
      name: optionalTrimmedString(tester.name, 'tester.name'),
      employeeId: optionalTrimmedString(tester.employeeId, 'tester.employeeId'),
    },
    session: {
      testCaseId: optionalTrimmedString(session.testCaseId, 'session.testCaseId'),
      testCaseName: optionalTrimmedString(session.testCaseName, 'session.testCaseName'),
      requirementId: optionalTrimmedString(session.requirementId, 'session.requirementId'),
    },
    screenshot: {
      enabled: booleanOrDefault(screenshot.enabled, true, 'screenshot.enabled'),
      format: screenshotFormatOrDefault(screenshot.format),
      quality: numberInRangeOrDefault(screenshot.quality, 0.92, 'screenshot.quality', 0, 1, true),
      captureOnError: booleanOrDefault(
        screenshot.captureOnError,
        false,
        'screenshot.captureOnError',
      ),
      captureOnStart: booleanOrDefault(
        screenshot.captureOnStart,
        false,
        'screenshot.captureOnStart',
      ),
      captureOnNavigation: booleanOrDefault(
        screenshot.captureOnNavigation,
        false,
        'screenshot.captureOnNavigation',
      ),
      autoCaptureIntervalSeconds: numberInRangeOrDefault(
        screenshot.autoCaptureIntervalSeconds,
        0,
        'screenshot.autoCaptureIntervalSeconds',
        0,
        MAX_SCREENSHOT_INTERVAL_SECONDS,
        true,
      ),
      maxAutomaticScreenshots: integerInRangeOrDefault(
        screenshot.maxAutomaticScreenshots,
        50,
        'screenshot.maxAutomaticScreenshots',
        1,
        MAX_AUTOMATIC_SCREENSHOTS,
      ),
    },
    video: {
      enabled: booleanOrDefault(video.enabled, false, 'video.enabled'),
      mimeType: videoMimeTypeOrDefault(video.mimeType),
      maxDurationMinutes: numberInRangeOrDefault(
        video.maxDurationMinutes,
        30,
        'video.maxDurationMinutes',
        0,
        MAX_VIDEO_DURATION_MINUTES,
        false,
      ),
      includeAudio: booleanOrDefault(video.includeAudio, false, 'video.includeAudio'),
    },
    actions: {
      enabled: booleanOrDefault(actions.enabled, true, 'actions.enabled'),
      captureClicks: booleanOrDefault(actions.captureClicks, true, 'actions.captureClicks'),
      captureFormSubmissions: booleanOrDefault(
        actions.captureFormSubmissions,
        true,
        'actions.captureFormSubmissions',
      ),
      captureInputChanges: booleanOrDefault(
        actions.captureInputChanges,
        true,
        'actions.captureInputChanges',
      ),
      captureNavigation: booleanOrDefault(
        actions.captureNavigation,
        true,
        'actions.captureNavigation',
      ),
      captureTextInputValues: booleanOrDefault(
        actions.captureTextInputValues,
        false,
        'actions.captureTextInputValues',
      ),
    },
    console: {
      enabled: booleanOrDefault(consoleConfig.enabled, true, 'console.enabled'),
      levels: consoleLevelsOrDefault(consoleConfig.levels),
    },
    network: {
      enabled: booleanOrDefault(network.enabled, true, 'network.enabled'),
      captureSuccessfulRequests: booleanOrDefault(
        network.captureSuccessfulRequests,
        false,
        'network.captureSuccessfulRequests',
      ),
      captureFailedFetch: booleanOrDefault(
        network.captureFailedFetch,
        true,
        'network.captureFailedFetch',
      ),
      captureFailedXhr: booleanOrDefault(
        network.captureFailedXhr,
        true,
        'network.captureFailedXhr',
      ),
      captureRequestBody: booleanOrDefault(
        network.captureRequestBody,
        false,
        'network.captureRequestBody',
      ),
      captureResponseBody: booleanOrDefault(
        network.captureResponseBody,
        false,
        'network.captureResponseBody',
      ),
    },
    privacy: {
      maskSelectors: stringArrayOrDefault(
        [
          ...DEFAULT_MASK_SELECTORS,
          ...stringArrayOrDefault(privacy.maskSelectors, [], 'privacy.maskSelectors'),
        ],
        [],
        'privacy.maskSelectors',
      ),
      excludeSelectors: stringArrayOrDefault(
        privacy.excludeSelectors,
        [],
        'privacy.excludeSelectors',
      ),
      sensitiveFieldNames: unionProtectedNames(
        DEFAULT_SENSITIVE_FIELD_NAMES,
        privacy.sensitiveFieldNames,
        'privacy.sensitiveFieldNames',
      ),
      sensitiveQueryParameters: unionProtectedNames(
        DEFAULT_SENSITIVE_QUERY_PARAMETERS,
        privacy.sensitiveQueryParameters,
        'privacy.sensitiveQueryParameters',
      ),
      redactHeaders: unionProtectedNames(
        DEFAULT_REDACT_HEADERS,
        privacy.redactHeaders,
        'privacy.redactHeaders',
      ),
    },
    toolbar: {
      enabled: booleanOrDefault(toolbar.enabled, false, 'toolbar.enabled'),
      position: toolbarPositionOrDefault(toolbar.position),
    },
    export: {
      fileNamePattern: nonBlankStringOrDefault(
        exportConfig.fileNamePattern,
        DEFAULT_FILE_NAME_PATTERN,
        'export.fileNamePattern',
      ),
      includeHtmlReport: booleanOrDefault(
        exportConfig.includeHtmlReport,
        true,
        'export.includeHtmlReport',
      ),
      includeJsonReport: booleanOrDefault(
        exportConfig.includeJsonReport,
        true,
        'export.includeJsonReport',
      ),
    },
    memory: {
      warningThresholdMb: numberInRangeOrDefault(
        memory.warningThresholdMb,
        250,
        'memory.warningThresholdMb',
        0,
        MAX_MEMORY_WARNING_THRESHOLD_MB,
        false,
      ),
    },
  };
}
