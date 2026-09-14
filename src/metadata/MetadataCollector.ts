import type { ResolvedTestWitnessConfig } from '../types/config';
import type {
  Dimensions,
  SessionMetadata,
  SessionResultStatus,
  SessionStartMetadata,
} from '../types/session';
import { detectBrowser, detectOperatingSystem } from '../utils/browser';
import { createSessionId } from '../utils/ids';
import { elapsedMilliseconds, systemClock, toIsoTimestamp, type Clock } from '../utils/timestamps';

interface MetadataWindow {
  readonly innerWidth: number;
  readonly innerHeight: number;
}

interface MetadataDocument {
  readonly title: string;
}

interface MetadataLocation {
  readonly href: string;
}

interface MetadataScreen {
  readonly width: number;
  readonly height: number;
}

/** Injectable browser surface, primarily useful for deterministic unit tests. */
export interface MetadataEnvironment {
  navigator?: Navigator;
  window?: MetadataWindow;
  document?: MetadataDocument;
  location?: MetadataLocation;
  screen?: MetadataScreen;
}

export interface MetadataCollectorOptions {
  clock?: Clock;
  idFactory?: () => string;
  libraryVersion?: string;
  environment?: MetadataEnvironment;
  sanitizeUrl?: (url: string) => string;
  sanitizeText?: (text: string) => string;
}

export interface MetadataCollectionContext {
  /** Reuses the SessionManager identity so summaries and exported metadata agree. */
  sessionId?: string;
  /** Reuses the SessionManager start time when orchestration spans multiple ticks. */
  startedAt?: Date;
}

function resolveLibraryVersion(explicitVersion?: string): string {
  if (explicitVersion) return explicitVersion;

  return typeof __TEST_WITNESS_VERSION__ === 'string' ? __TEST_WITNESS_VERSION__ : '0.1.0';
}

function browserEnvironment(): MetadataEnvironment {
  return {
    navigator: typeof navigator === 'undefined' ? undefined : navigator,
    window: typeof window === 'undefined' ? undefined : window,
    document: typeof document === 'undefined' ? undefined : document,
    location: typeof location === 'undefined' ? undefined : location,
    screen: typeof screen === 'undefined' ? undefined : screen,
  };
}

function dimension(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function getViewport(environment: MetadataEnvironment): Dimensions {
  return {
    width: dimension(environment.window?.innerWidth),
    height: dimension(environment.window?.innerHeight),
  };
}

function getScreen(environment: MetadataEnvironment): Dimensions {
  return {
    width: dimension(environment.screen?.width),
    height: dimension(environment.screen?.height),
  };
}

/** Collects stable, serializable session metadata from feature-detected browser APIs. */
export class MetadataCollector {
  private readonly clock: Clock;
  private readonly idFactory: () => string;
  private readonly libraryVersion: string;
  private readonly environment: MetadataEnvironment;
  private readonly sanitizeUrl: (url: string) => string;
  private readonly sanitizeText: (text: string) => string;

  public constructor(
    private readonly config: ResolvedTestWitnessConfig,
    options: MetadataCollectorOptions = {},
  ) {
    this.clock = options.clock ?? systemClock;
    this.idFactory = options.idFactory ?? createSessionId;
    this.libraryVersion = resolveLibraryVersion(options.libraryVersion);
    this.environment = options.environment ?? browserEnvironment();
    this.sanitizeUrl = options.sanitizeUrl ?? ((url) => url);
    this.sanitizeText = options.sanitizeText ?? ((text) => text);
  }

  /** Captures metadata at session start, with explicit start values taking precedence. */
  public collect(
    start: SessionStartMetadata = {},
    context: MetadataCollectionContext = {},
  ): SessionMetadata {
    const startedAt = context.startedAt ?? this.clock();

    return {
      sessionId: context.sessionId ?? this.idFactory(),
      applicationName: this.sanitizeText(this.config.applicationName),
      environment: this.sanitizeText(this.config.environment),
      releaseVersion: this.optionalText(this.config.releaseVersion),
      testerName: this.optionalText(start.testerName ?? this.config.tester.name),
      testerEmployeeId: this.optionalText(start.testerEmployeeId ?? this.config.tester.employeeId),
      testCaseId: this.optionalText(start.testCaseId ?? this.config.session.testCaseId),
      testCaseName: this.optionalText(start.testCaseName ?? this.config.session.testCaseName),
      requirementId: this.optionalText(start.requirementId ?? this.config.session.requirementId),
      startedAt: toIsoTimestamp(startedAt),
      durationMs: 0,
      currentUrl: this.currentUrl(),
      pageTitle: this.sanitizeText(this.environment.document?.title ?? ''),
      browser: detectBrowser(this.environment.navigator),
      operatingSystem: detectOperatingSystem(this.environment.navigator),
      viewport: getViewport(this.environment),
      screen: getScreen(this.environment),
      libraryVersion: this.libraryVersion,
      result: 'not-set',
      custom: { ...(start.custom ?? {}) },
    };
  }

  /**
   * Returns finalized metadata without mutating the start snapshot. Page context is
   * refreshed so an SPA navigation during the test is represented in the report.
   */
  public complete(
    metadata: SessionMetadata,
    result: SessionResultStatus,
    endedAt = this.clock(),
  ): SessionMetadata {
    const startedAt = new Date(metadata.startedAt);

    return {
      ...metadata,
      endedAt: toIsoTimestamp(endedAt),
      durationMs: elapsedMilliseconds(startedAt, endedAt),
      currentUrl: this.currentUrl(),
      pageTitle: this.sanitizeText(this.environment.document?.title ?? metadata.pageTitle),
      viewport: getViewport(this.environment),
      screen: getScreen(this.environment),
      result,
      custom: { ...metadata.custom },
    };
  }

  private currentUrl(): string {
    const url = this.environment.location?.href ?? '';
    return this.sanitizeUrl(url);
  }

  private optionalText(value: string | undefined): string | undefined {
    return value === undefined ? undefined : this.sanitizeText(value);
  }
}
