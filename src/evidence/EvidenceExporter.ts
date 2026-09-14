import JSZip from 'jszip';

import { HtmlReportGenerator, type ReportAssetManifest } from './HtmlReportGenerator';
import type { EvidenceSnapshot } from './EvidenceStore';
import type { ResolvedTestWitnessConfig } from '../types/config';
import type { DownloadEvidenceResult, SessionSummary } from '../types/session';
import { TestWitnessError } from '../utils/errors';

const ZIP_MIME_TYPE = 'application/zip';
const ZIP_ENTRY_DATE = new Date('2000-01-01T00:00:00.000Z');
const DOWNLOAD_REVOKE_DELAY_MS = 0;
const MAX_ARCHIVE_NAME_LENGTH = 180;
const MAX_ASSET_BASE_LENGTH = 96;

const TEXT_FILE_OPTIONS: JSZip.JSZipFileOptions = Object.freeze({
  binary: false,
  compression: 'DEFLATE',
  compressionOptions: { level: 6 },
  createFolders: false,
  date: ZIP_ENTRY_DATE,
});

const MEDIA_FILE_OPTIONS: JSZip.JSZipFileOptions = Object.freeze({
  binary: true,
  compression: 'STORE',
  createFolders: false,
  date: ZIP_ENTRY_DATE,
});

export interface ObjectUrlApi {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}

export interface ExportTimer {
  setTimeout(callback: () => void, delayMilliseconds: number): unknown;
}

export interface EvidenceExporterDependencies {
  reportGenerator?: HtmlReportGenerator;
  document?: Document;
  url?: ObjectUrlApi;
  timer?: ExportTimer;
}

interface ScreenshotAsset {
  record: EvidenceSnapshot['screenshots'][number];
  path: string;
}

interface PreparedAssets {
  manifest: ReportAssetManifest;
  screenshots: ScreenshotAsset[];
}

const OMIT_JSON_VALUE = Symbol('omit-json-value');
type NormalizedJsonValue =
  | string
  | number
  | boolean
  | null
  | NormalizedJsonValue[]
  | { [key: string]: NormalizedJsonValue }
  | typeof OMIT_JSON_VALUE;

function defaultDocument(): Document | undefined {
  return typeof document === 'undefined' ? undefined : document;
}

function defaultObjectUrlApi(): ObjectUrlApi | undefined {
  const urlApi = globalThis.URL;
  if (
    typeof urlApi?.createObjectURL !== 'function' ||
    typeof urlApi.revokeObjectURL !== 'function'
  ) {
    return undefined;
  }
  return {
    createObjectURL: (blob) => urlApi.createObjectURL(blob),
    revokeObjectURL: (url) => urlApi.revokeObjectURL(url),
  };
}

function defaultTimer(): ExportTimer {
  return {
    setTimeout: (callback, delayMilliseconds) => globalThis.setTimeout(callback, delayMilliseconds),
  };
}

function sanitizeFileComponent(value: string, maximumLength: number): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^a-zA-Z0-9._-]+/gu, '-')
    .replace(/-{2,}/gu, '-')
    .replace(/^[.-]+|[.-]+$/gu, '')
    .slice(0, maximumLength)
    .replace(/[.-]+$/gu, '');
}

function fileTimestamp(metadata: EvidenceSnapshot['metadata']): string {
  const rawTimestamp = metadata.endedAt ?? metadata.startedAt;
  const parsed = new Date(rawTimestamp);
  if (Number.isFinite(parsed.getTime())) {
    return parsed.toISOString().replace(/[:.]/gu, '-');
  }
  return sanitizeFileComponent(rawTimestamp, 48) || 'unknown-time';
}

/** Resolves supported filename tokens and guarantees a single safe `.zip` basename. */
export function generateEvidenceFileName(
  pattern: string,
  metadata: EvidenceSnapshot['metadata'],
): string {
  const replacements: Readonly<Record<string, string>> = {
    applicationName: metadata.applicationName,
    environment: metadata.environment,
    result: metadata.result,
    sessionId: metadata.sessionId,
    testCaseId: metadata.testCaseId ?? 'no-test-case',
    timestamp: fileTimestamp(metadata),
  };
  const resolved = pattern.replace(/\{([^{}]+)\}/gu, (_match, token: string) => {
    return Object.prototype.hasOwnProperty.call(replacements, token) ? replacements[token]! : '';
  });
  const withoutExtension = resolved.replace(/\.zip$/iu, '');
  const safeBaseName =
    sanitizeFileComponent(withoutExtension, MAX_ARCHIVE_NAME_LENGTH) ||
    `TestWitness-${sanitizeFileComponent(metadata.sessionId, 80) || 'session'}-${fileTimestamp(metadata)}`;
  return `${safeBaseName}.zip`;
}

function screenshotExtension(record: EvidenceSnapshot['screenshots'][number]): 'png' | 'jpg' {
  const mimeType = record.blob.type.toLowerCase();
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/jpeg') return 'jpg';

  const extension = record.fileName.match(/\.([a-zA-Z0-9]+)$/u)?.[1]?.toLowerCase();
  if (extension === 'png') return 'png';
  if (extension === 'jpg' || extension === 'jpeg') return 'jpg';

  throw new TestWitnessError(
    'EXPORT_FAILED',
    `Screenshot ${record.id} is not a supported PNG or JPEG image.`,
  );
}

function safeScreenshotBase(
  record: EvidenceSnapshot['screenshots'][number],
  index: number,
): string {
  const pathSegments = record.fileName.split(/[\\/]/u);
  const leafName = pathSegments[pathSegments.length - 1] ?? '';
  const withoutExtension = leafName.replace(/\.[^.]*$/u, '');
  return (
    sanitizeFileComponent(withoutExtension, MAX_ASSET_BASE_LENGTH) ||
    `${String(index + 1).padStart(3, '0')}-screenshot`
  );
}

function uniqueScreenshotFileName(
  record: EvidenceSnapshot['screenshots'][number],
  index: number,
  usedNames: Set<string>,
): string {
  const extension = screenshotExtension(record);
  const base = safeScreenshotBase(record, index);
  let suffix = 1;
  let candidate = `${base}.${extension}`;

  while (usedNames.has(candidate.toLowerCase())) {
    suffix += 1;
    const suffixText = `-${suffix}`;
    candidate = `${base.slice(0, MAX_ASSET_BASE_LENGTH - suffixText.length)}${suffixText}.${extension}`;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function prepareAssets(evidence: EvidenceSnapshot): PreparedAssets {
  const screenshotPaths = Object.create(null) as Record<string, string>;
  const screenshots: ScreenshotAsset[] = [];
  const usedNames = new Set<string>();
  const usedIds = new Set<string>();

  evidence.screenshots.forEach((record, index) => {
    if (usedIds.has(record.id)) {
      throw new TestWitnessError(
        'EXPORT_FAILED',
        `Screenshot evidence contains a duplicate identifier: ${record.id}.`,
      );
    }
    usedIds.add(record.id);
    const fileName = uniqueScreenshotFileName(record, index, usedNames);
    const path = `screenshots/${fileName}`;
    screenshotPaths[record.id] = path;
    screenshots.push({ record, path });
  });

  const manifest: ReportAssetManifest = {
    screenshots: Object.freeze(screenshotPaths),
    ...(evidence.video ? { video: 'recording.webm' } : {}),
  };
  return { manifest: Object.freeze(manifest), screenshots };
}

function normalizeJson(value: unknown, seen: WeakSet<object>): NormalizedJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') {
    return OMIT_JSON_VALUE;
  }
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : 'Invalid Date';
  }
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return `[Binary omitted: ${value.type || 'unknown'}, ${value.size} bytes]`;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => {
      const normalized = normalizeJson(entry, seen);
      return normalized === OMIT_JSON_VALUE ? null : normalized;
    });
  }

  const result = Object.create(null) as Record<string, NormalizedJsonValue>;
  for (const key of Object.keys(value).sort()) {
    let propertyValue: unknown;
    try {
      propertyValue = Reflect.get(value, key);
    } catch {
      propertyValue = '[Unreadable]';
    }
    const normalized = normalizeJson(propertyValue, seen);
    if (normalized !== OMIT_JSON_VALUE) result[key] = normalized;
  }
  return result;
}

function stableJson(value: unknown): string {
  const normalized = normalizeJson(value, new WeakSet<object>());
  const serializable = normalized === OMIT_JSON_VALUE ? null : normalized;
  return `${JSON.stringify(serializable, null, 2)}\n`;
}

async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer());
  }

  if (typeof FileReader === 'undefined') {
    throw new TestWitnessError(
      'EXPORT_UNAVAILABLE',
      'This browser cannot read evidence blobs for ZIP generation.',
    );
  }

  return await new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(reader.error ?? new Error('The evidence blob could not be read.'));
    reader.onload = () => {
      const result = reader.result;
      if (result === null || typeof result === 'string') {
        reject(new Error('The browser returned an invalid binary blob result.'));
        return;
      }
      resolve(new Uint8Array(result));
    };
    reader.readAsArrayBuffer(blob);
  });
}

function addTextFile(zip: JSZip, path: string, content: string): void {
  zip.file(path, content, TEXT_FILE_OPTIONS);
}

function wrapExportError(error: unknown, message: string): TestWitnessError {
  return error instanceof TestWitnessError
    ? error
    : new TestWitnessError('EXPORT_FAILED', message, error);
}

/** Creates and downloads deterministic in-memory evidence archives. */
export class EvidenceExporter {
  readonly #config: ResolvedTestWitnessConfig['export'];
  readonly #reportGenerator: HtmlReportGenerator;
  readonly #document?: Document;
  readonly #url?: ObjectUrlApi;
  readonly #timer: ExportTimer;

  public constructor(
    config: ResolvedTestWitnessConfig['export'],
    dependencies: EvidenceExporterDependencies = {},
  ) {
    this.#config = config;
    this.#reportGenerator = dependencies.reportGenerator ?? new HtmlReportGenerator();
    this.#document = dependencies.document ?? defaultDocument();
    this.#url = dependencies.url ?? defaultObjectUrlApi();
    this.#timer = dependencies.timer ?? defaultTimer();
  }

  public async generate(
    evidence: EvidenceSnapshot,
    summary: SessionSummary,
  ): Promise<DownloadEvidenceResult> {
    try {
      const zip = new JSZip();
      const assets = prepareAssets(evidence);

      if (this.#config.includeHtmlReport) {
        addTextFile(
          zip,
          'report.html',
          this.#reportGenerator.generate(evidence, summary, assets.manifest),
        );
      }

      addTextFile(zip, 'metadata.json', stableJson(evidence.metadata));
      if (this.#config.includeJsonReport) {
        addTextFile(zip, 'actions.json', stableJson(evidence.actions));
        addTextFile(zip, 'console-logs.json', stableJson(evidence.consoleLogs));
        addTextFile(zip, 'network-requests.json', stableJson(evidence.networkRequests));
        addTextFile(zip, 'network-errors.json', stableJson(evidence.networkErrors));
        addTextFile(zip, 'notes.json', stableJson(evidence.notes));
      }

      if (evidence.video) {
        zip.file('recording.webm', await blobToUint8Array(evidence.video.blob), MEDIA_FILE_OPTIONS);
      }
      for (const screenshot of assets.screenshots) {
        zip.file(
          screenshot.path,
          await blobToUint8Array(screenshot.record.blob),
          MEDIA_FILE_OPTIONS,
        );
      }

      const archiveBytes = await zip.generateAsync({
        type: 'uint8array',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
        mimeType: ZIP_MIME_TYPE,
        platform: 'DOS',
        streamFiles: false,
      });
      const archiveCopy = Uint8Array.from(archiveBytes);
      const blob = new Blob([archiveCopy.buffer], { type: ZIP_MIME_TYPE });
      return {
        fileName: generateEvidenceFileName(this.#config.fileNamePattern, evidence.metadata),
        blob,
        sizeBytes: blob.size,
      };
    } catch (error) {
      throw wrapExportError(error, 'Evidence ZIP generation failed.');
    }
  }

  public async download(
    evidence: EvidenceSnapshot,
    summary: SessionSummary,
  ): Promise<DownloadEvidenceResult> {
    const documentValue = this.#document;
    const urlApi = this.#url;
    if (!documentValue?.body || !urlApi) {
      throw new TestWitnessError(
        'EXPORT_UNAVAILABLE',
        'Evidence download requires an active browser document and object URL support.',
      );
    }

    const result = await this.generate(evidence, summary);
    const anchor = documentValue.createElement('a');
    let objectUrl: string | undefined;
    try {
      objectUrl = urlApi.createObjectURL(result.blob);
      anchor.href = objectUrl;
      anchor.download = result.fileName;
      anchor.hidden = true;
      anchor.rel = 'noopener';
      documentValue.body.append(anchor);
      anchor.click();
      return result;
    } catch (error) {
      throw wrapExportError(error, 'Evidence download could not be started.');
    } finally {
      anchor.remove();
      if (objectUrl !== undefined) {
        const urlToRevoke = objectUrl;
        try {
          this.#timer.setTimeout(
            () => urlApi.revokeObjectURL(urlToRevoke),
            DOWNLOAD_REVOKE_DELAY_MS,
          );
        } catch {
          urlApi.revokeObjectURL(urlToRevoke);
        }
      }
    }
  }
}
