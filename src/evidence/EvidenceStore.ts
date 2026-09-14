import type {
  ActionRecord,
  ConsoleLogRecord,
  NetworkErrorRecord,
  NetworkRequestRecord,
  NoteRecord,
  SanitizedValue,
  ScreenshotRecord,
  VideoRecord,
} from '../types/evidence';
import type { EvidenceCounts, SessionEvidence, SessionMetadata } from '../types/session';
import { TestWitnessError } from '../utils/errors';

const DEFAULT_WARNING_THRESHOLD_BYTES = 250 * 1024 * 1024;

type DeepReadonlyEvidence<Value> = Value extends Blob
  ? Value
  : Value extends readonly (infer Item)[]
    ? readonly DeepReadonlyEvidence<Item>[]
    : Value extends object
      ? { readonly [Key in keyof Value]: DeepReadonlyEvidence<Value[Key]> }
      : Value;

/** A detached, recursively frozen view of the current in-memory evidence. */
export type EvidenceSnapshot = DeepReadonlyEvidence<SessionEvidence>;

export interface MemoryWarning {
  approximateSizeBytes: number;
  thresholdBytes: number;
  sessionId?: string;
}

export interface InMemoryEvidenceStoreOptions {
  warningThresholdBytes?: number;
  onMemoryWarning?: (warning: MemoryWarning) => void;
}

export interface EvidenceStore {
  reset(metadata: SessionMetadata): void;
  completeMetadata(metadata: SessionMetadata): void;
  addScreenshot(record: ScreenshotRecord): void;
  addAction(record: ActionRecord): void;
  addConsoleLog(record: ConsoleLogRecord): void;
  addNetworkRequest(record: NetworkRequestRecord): void;
  addNetworkError(record: NetworkErrorRecord): void;
  addNote(record: NoteRecord): void;
  setVideo(record: VideoRecord): void;
  getSnapshot(): EvidenceSnapshot;
  getCounts(): EvidenceCounts;
  getApproximateSizeBytes(): number;
  hasMemoryWarning(): boolean;
  clear(): void;
}

function cloneStringRecord(
  value: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!value) return undefined;
  const result = Object.create(null) as Record<string, string>;
  for (const [key, entry] of Object.entries(value)) result[key] = entry;
  return result;
}

function cloneSanitizedValue(value: SanitizedValue): SanitizedValue {
  if (Array.isArray(value)) return value.map(cloneSanitizedValue);
  if (value !== null && typeof value === 'object') {
    const result = Object.create(null) as Record<string, SanitizedValue>;
    for (const [key, entry] of Object.entries(value)) result[key] = cloneSanitizedValue(entry);
    return result;
  }
  return value;
}

function cloneMetadata(metadata: SessionMetadata): SessionMetadata {
  const custom = Object.create(null) as SessionMetadata['custom'];
  for (const [key, value] of Object.entries(metadata.custom)) custom[key] = value;
  return {
    ...metadata,
    browser: { ...metadata.browser },
    operatingSystem: { ...metadata.operatingSystem },
    viewport: { ...metadata.viewport },
    screen: { ...metadata.screen },
    custom,
  };
}

function cloneAction(record: ActionRecord): ActionRecord {
  return { ...record };
}

function cloneConsoleLog(record: ConsoleLogRecord): ConsoleLogRecord {
  return { ...record, arguments: record.arguments.map(cloneSanitizedValue) };
}

function cloneNetworkError(record: NetworkErrorRecord): NetworkErrorRecord {
  return {
    ...record,
    requestHeaders: cloneStringRecord(record.requestHeaders),
    responseHeaders: cloneStringRecord(record.responseHeaders),
    requestBody:
      record.requestBody === undefined ? undefined : cloneSanitizedValue(record.requestBody),
    responseBody:
      record.responseBody === undefined ? undefined : cloneSanitizedValue(record.responseBody),
  };
}

function cloneNetworkRequest(record: NetworkRequestRecord): NetworkRequestRecord {
  return { ...record };
}

function cloneNote(record: NoteRecord): NoteRecord {
  return { ...record };
}

function cloneScreenshot(record: ScreenshotRecord): ScreenshotRecord {
  return { ...record, blob: record.blob };
}

function cloneVideo(record: VideoRecord): VideoRecord {
  return { ...record, blob: record.blob };
}

function utf8JsonSize(value: unknown): number {
  const json = JSON.stringify(value);
  return new TextEncoder().encode(json ?? '').byteLength;
}

function screenshotSize(record: ScreenshotRecord): number {
  return (
    record.blob.size +
    utf8JsonSize({
      id: record.id,
      timestamp: record.timestamp,
      label: record.label,
      url: record.url,
      actionSequence: record.actionSequence,
      fileName: record.fileName,
    })
  );
}

function videoSize(record: VideoRecord): number {
  return (
    record.blob.size +
    utf8JsonSize({
      id: record.id,
      startedAt: record.startedAt,
      endedAt: record.endedAt,
      durationMs: record.durationMs,
      mimeType: record.mimeType,
      fileName: record.fileName,
      stopReason: record.stopReason,
    })
  );
}

function deepFreeze(value: unknown, visited = new WeakSet<object>()): void {
  if (typeof value !== 'object' || value === null || value instanceof Blob || visited.has(value)) {
    return;
  }
  visited.add(value);
  for (const child of Object.values(value)) deepFreeze(child, visited);
  Object.freeze(value);
}

/** Privacy-preserving, memory-only evidence storage for MVP 1. */
export class InMemoryEvidenceStore implements EvidenceStore {
  readonly #warningThresholdBytes: number;
  readonly #onMemoryWarning?: (warning: MemoryWarning) => void;
  #metadata?: SessionMetadata;
  #screenshots: ScreenshotRecord[] = [];
  #actions: ActionRecord[] = [];
  #consoleLogs: ConsoleLogRecord[] = [];
  #networkRequests: NetworkRequestRecord[] = [];
  #networkErrors: NetworkErrorRecord[] = [];
  #notes: NoteRecord[] = [];
  #video?: VideoRecord;
  #videoSize = 0;
  #approximateSizeBytes = 0;
  #memoryWarningReached = false;

  public constructor(options: InMemoryEvidenceStoreOptions = {}) {
    const threshold = options.warningThresholdBytes ?? DEFAULT_WARNING_THRESHOLD_BYTES;
    if (!Number.isFinite(threshold) || threshold <= 0) {
      throw new TestWitnessError(
        'INVALID_CONFIG',
        'Evidence memory warning threshold must be a positive finite number of bytes.',
      );
    }
    this.#warningThresholdBytes = threshold;
    this.#onMemoryWarning = options.onMemoryWarning;
  }

  public reset(metadata: SessionMetadata): void {
    this.clear();
    this.#metadata = cloneMetadata(metadata);
    this.#approximateSizeBytes = utf8JsonSize(this.#metadata);
    this.checkMemoryWarning();
  }

  public completeMetadata(metadata: SessionMetadata): void {
    const previousMetadata = this.requireMetadata();
    const completed = cloneMetadata(metadata);
    this.#approximateSizeBytes = Math.max(
      0,
      this.#approximateSizeBytes - utf8JsonSize(previousMetadata) + utf8JsonSize(completed),
    );
    this.#metadata = completed;
    this.checkMemoryWarning();
  }

  public addScreenshot(record: ScreenshotRecord): void {
    this.requireMetadata();
    const copy = cloneScreenshot(record);
    this.#screenshots.push(copy);
    this.addSize(screenshotSize(copy));
  }

  public addAction(record: ActionRecord): void {
    this.requireMetadata();
    const copy = cloneAction(record);
    this.#actions.push(copy);
    this.addSize(utf8JsonSize(copy));
  }

  public addConsoleLog(record: ConsoleLogRecord): void {
    this.requireMetadata();
    const copy = cloneConsoleLog(record);
    this.#consoleLogs.push(copy);
    this.addSize(utf8JsonSize(copy));
  }

  public addNetworkError(record: NetworkErrorRecord): void {
    this.requireMetadata();
    const copy = cloneNetworkError(record);
    this.#networkErrors.push(copy);
    this.addSize(utf8JsonSize(copy));
  }

  public addNetworkRequest(record: NetworkRequestRecord): void {
    this.requireMetadata();
    const copy = cloneNetworkRequest(record);
    this.#networkRequests.push(copy);
    this.addSize(utf8JsonSize(copy));
  }

  public addNote(record: NoteRecord): void {
    this.requireMetadata();
    const copy = cloneNote(record);
    this.#notes.push(copy);
    this.addSize(utf8JsonSize(copy));
  }

  public setVideo(record: VideoRecord): void {
    this.requireMetadata();
    const copy = cloneVideo(record);
    const nextSize = videoSize(copy);
    this.#approximateSizeBytes = Math.max(
      0,
      this.#approximateSizeBytes - this.#videoSize + nextSize,
    );
    this.#video = copy;
    this.#videoSize = nextSize;
    this.checkMemoryWarning();
  }

  public getSnapshot(): EvidenceSnapshot {
    const metadata = this.requireMetadata();
    const snapshot: SessionEvidence = {
      metadata: cloneMetadata(metadata),
      screenshots: this.#screenshots.map(cloneScreenshot),
      actions: this.#actions.map(cloneAction),
      consoleLogs: this.#consoleLogs.map(cloneConsoleLog),
      networkRequests: this.#networkRequests.map(cloneNetworkRequest),
      networkErrors: this.#networkErrors.map(cloneNetworkError),
      notes: this.#notes.map(cloneNote),
      video: this.#video ? cloneVideo(this.#video) : undefined,
    };
    deepFreeze(snapshot);
    return snapshot;
  }

  public getCounts(): EvidenceCounts {
    return {
      screenshots: this.#screenshots.length,
      actions: this.#actions.length,
      consoleLogs: this.#consoleLogs.length,
      networkRequests: this.#networkRequests.length,
      successfulRequests: this.#networkRequests.filter((record) => record.outcome === 'success')
        .length,
      networkErrors: this.#networkErrors.length,
      notes: this.#notes.length,
      hasVideo: this.#video !== undefined,
    };
  }

  public getApproximateSizeBytes(): number {
    return this.#approximateSizeBytes;
  }

  public hasMemoryWarning(): boolean {
    return this.#memoryWarningReached;
  }

  public clear(): void {
    this.#metadata = undefined;
    this.#screenshots = [];
    this.#actions = [];
    this.#consoleLogs = [];
    this.#networkRequests = [];
    this.#networkErrors = [];
    this.#notes = [];
    this.#video = undefined;
    this.#videoSize = 0;
    this.#approximateSizeBytes = 0;
    this.#memoryWarningReached = false;
  }

  private requireMetadata(): SessionMetadata {
    if (!this.#metadata) {
      throw new TestWitnessError(
        'INVALID_SESSION_STATE',
        'EvidenceStore must be reset with session metadata before evidence can be used.',
      );
    }
    return this.#metadata;
  }

  private addSize(size: number): void {
    this.#approximateSizeBytes += size;
    this.checkMemoryWarning();
  }

  private checkMemoryWarning(): void {
    if (this.#memoryWarningReached || this.#approximateSizeBytes < this.#warningThresholdBytes) {
      return;
    }
    this.#memoryWarningReached = true;
    this.#onMemoryWarning?.({
      approximateSizeBytes: this.#approximateSizeBytes,
      thresholdBytes: this.#warningThresholdBytes,
      sessionId: this.#metadata?.sessionId,
    });
  }
}
