import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  EvidenceExporter,
  generateEvidenceFileName,
  type ExportTimer,
  type ObjectUrlApi,
} from '../src/evidence/EvidenceExporter';
import type { HtmlReportGenerator, ReportAssetManifest } from '../src/evidence/HtmlReportGenerator';
import type { EvidenceSnapshot } from '../src/evidence/EvidenceStore';
import type { ResolvedTestWitnessConfig } from '../src/types/config';
import type { SessionEvidence, SessionSummary } from '../src/types/session';
import { TestWitnessError } from '../src/utils/errors';

const EXPORT_CONFIG: ResolvedTestWitnessConfig['export'] = {
  fileNamePattern: 'TestWitness-{testCaseId}-{timestamp}.zip',
  includeHtmlReport: true,
  includeJsonReport: true,
};

function sessionEvidence(): SessionEvidence {
  return {
    metadata: {
      sessionId: 'session-1',
      applicationName: 'Payments Portal',
      environment: 'QA',
      releaseVersion: '2.4.0',
      testerName: 'Tester',
      testerEmployeeId: 'E-1',
      testCaseId: 'TC-42',
      testCaseName: 'Login',
      requirementId: 'REQ-9',
      startedAt: '2026-09-07T12:34:56.789Z',
      endedAt: '2026-09-07T13:00:00.000Z',
      durationMs: 1_503_211,
      currentUrl: 'https://example.test/home',
      pageTitle: 'Home',
      browser: { name: 'Chrome', version: '140' },
      operatingSystem: { name: 'macOS', version: '15' },
      viewport: { width: 1280, height: 720 },
      screen: { width: 1920, height: 1080 },
      libraryVersion: '0.1.0',
      result: 'passed',
      custom: { suite: 'smoke' },
    },
    screenshots: [
      {
        id: 'screenshot-1',
        timestamp: '2026-09-07T12:40:00.000Z',
        label: 'Login complete',
        url: 'https://example.test/home',
        actionSequence: 2,
        blob: new Blob(['first-image'], { type: 'image/png' }),
        fileName: '../001-Login Evidence.PNG',
      },
      {
        id: 'screenshot-2',
        timestamp: '2026-09-07T12:41:00.000Z',
        label: 'Dashboard',
        url: 'https://example.test/home',
        actionSequence: 3,
        blob: new Blob(['second-image'], { type: 'image/png' }),
        fileName: '001-login evidence.png',
      },
    ],
    actions: [
      {
        sequence: 1,
        timestamp: '2026-09-07T12:35:00.000Z',
        type: 'click',
        elementTag: 'button',
        elementIdentifier: '#login',
        url: 'https://example.test/login',
      },
    ],
    consoleLogs: [
      {
        id: 'console-1',
        timestamp: '2026-09-07T12:36:00.000Z',
        level: 'error',
        message: 'Example error',
        arguments: ['Example error'],
        url: 'https://example.test/login',
      },
    ],
    networkRequests: [
      {
        id: 'request-1',
        timestamp: '2026-09-07T12:35:30.000Z',
        transport: 'fetch',
        method: 'POST',
        url: 'https://example.test/api/login',
        status: 200,
        durationMs: 18,
        outcome: 'success',
      },
      {
        id: 'request-2',
        timestamp: '2026-09-07T12:37:00.000Z',
        transport: 'fetch',
        method: 'GET',
        url: 'https://example.test/api',
        status: 503,
        durationMs: 25,
        outcome: 'http-error',
      },
    ],
    networkErrors: [
      {
        id: 'network-1',
        timestamp: '2026-09-07T12:37:00.000Z',
        transport: 'fetch',
        method: 'GET',
        url: 'https://example.test/api',
        status: 503,
        durationMs: 25,
        failureType: 'http-error',
      },
    ],
    notes: [
      {
        id: 'note-1',
        timestamp: '2026-09-07T12:38:00.000Z',
        text: 'Validated login',
        url: 'https://example.test/home',
        actionSequence: 1,
      },
    ],
    video: {
      id: 'video-1',
      startedAt: '2026-09-07T12:34:57.000Z',
      endedAt: '2026-09-07T12:44:57.000Z',
      durationMs: 600_000,
      mimeType: 'video/webm',
      blob: new Blob(['video-bytes'], { type: 'video/webm' }),
      fileName: 'recording.webm',
      stopReason: 'session-stopped',
    },
  };
}

function sessionSummary(): SessionSummary {
  return {
    sessionId: 'session-1',
    status: 'stopped',
    result: 'passed',
    startedAt: '2026-09-07T12:34:56.789Z',
    endedAt: '2026-09-07T13:00:00.000Z',
    durationMs: 1_503_211,
    evidence: {
      screenshots: 2,
      actions: 1,
      consoleLogs: 1,
      networkRequests: 2,
      successfulRequests: 1,
      networkErrors: 1,
      notes: 1,
      hasVideo: true,
    },
    approximateSizeBytes: 1024,
    memoryWarningReached: false,
    videoStatus: 'captured',
    videoRecording: false,
    warnings: [],
  };
}

function reportGenerator(
  generate = vi.fn(
    (evidence: EvidenceSnapshot, summary: SessionSummary, assets: ReportAssetManifest) => {
      void evidence;
      void summary;
      void assets;
      return '<!doctype html><title>Evidence</title>';
    },
  ),
): { generator: HtmlReportGenerator; generate: typeof generate } {
  return { generator: { generate }, generate };
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer());
  return await new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Blob read failed.'));
    reader.onload = () => {
      const result = reader.result;
      if (result === null || typeof result === 'string') {
        reject(new Error('Unexpected blob result.'));
        return;
      }
      resolve(new Uint8Array(result));
    };
    reader.readAsArrayBuffer(blob);
  });
}

async function loadZip(blob: Blob): Promise<JSZip> {
  return await JSZip.loadAsync(await blobBytes(blob));
}

afterEach(() => {
  document.querySelectorAll('a[download]').forEach((anchor) => anchor.remove());
});

describe('EvidenceExporter ZIP generation', () => {
  it('creates the exact archive layout and passes final safe asset paths to the report', async () => {
    const evidence = sessionEvidence();
    const summary = sessionSummary();
    const report = reportGenerator();
    const exporter = new EvidenceExporter(EXPORT_CONFIG, { reportGenerator: report.generator });

    const result = await exporter.generate(evidence, summary);
    const zip = await loadZip(result.blob);

    expect(result.fileName).toBe('TestWitness-TC-42-2026-09-07T13-00-00-000Z.zip');
    expect(result.sizeBytes).toBe(result.blob.size);
    expect(Object.keys(zip.files).sort()).toEqual([
      'actions.json',
      'console-logs.json',
      'metadata.json',
      'network-errors.json',
      'network-requests.json',
      'notes.json',
      'recording.webm',
      'report.html',
      'screenshots/001-Login-Evidence.png',
      'screenshots/001-login-evidence-2.png',
    ]);

    expect(report.generate).toHaveBeenCalledWith(
      evidence,
      summary,
      expect.objectContaining({
        screenshots: {
          'screenshot-1': 'screenshots/001-Login-Evidence.png',
          'screenshot-2': 'screenshots/001-login-evidence-2.png',
        },
        video: 'recording.webm',
      }),
    );
    expect(await zip.file('report.html')?.async('string')).toContain('<title>Evidence</title>');
    expect(JSON.parse((await zip.file('metadata.json')?.async('string')) ?? '')).toEqual(
      evidence.metadata,
    );
    expect(JSON.parse((await zip.file('actions.json')?.async('string')) ?? '')).toEqual(
      evidence.actions,
    );
    expect(JSON.parse((await zip.file('console-logs.json')?.async('string')) ?? '')).toEqual(
      evidence.consoleLogs,
    );
    expect(JSON.parse((await zip.file('network-errors.json')?.async('string')) ?? '')).toEqual(
      evidence.networkErrors,
    );
    expect(JSON.parse((await zip.file('network-requests.json')?.async('string')) ?? '')).toEqual(
      evidence.networkRequests,
    );
    expect(JSON.parse((await zip.file('notes.json')?.async('string')) ?? '')).toEqual(
      evidence.notes,
    );
    expect(new TextDecoder().decode(await zip.file('recording.webm')?.async('uint8array'))).toBe(
      'video-bytes',
    );
    expect(
      new TextDecoder().decode(
        await zip.file('screenshots/001-Login-Evidence.png')?.async('uint8array'),
      ),
    ).toBe('first-image');
  });

  it('always includes metadata while honoring disabled HTML and JSON reports', async () => {
    const evidence = sessionEvidence();
    evidence.screenshots = [];
    evidence.video = undefined;
    const report = reportGenerator();
    const exporter = new EvidenceExporter(
      { ...EXPORT_CONFIG, includeHtmlReport: false, includeJsonReport: false },
      { reportGenerator: report.generator },
    );

    const zip = await loadZip((await exporter.generate(evidence, sessionSummary())).blob);

    expect(Object.keys(zip.files)).toEqual(['metadata.json']);
    expect(report.generate).not.toHaveBeenCalled();
  });

  it('produces deterministic bytes for the same evidence', async () => {
    const evidence = sessionEvidence();
    const report = reportGenerator();
    const exporter = new EvidenceExporter(EXPORT_CONFIG, { reportGenerator: report.generator });

    const first = await exporter.generate(evidence, sessionSummary());
    const second = await exporter.generate(evidence, sessionSummary());

    expect(await blobBytes(second.blob)).toEqual(await blobBytes(first.blob));
    expect(second.fileName).toBe(first.fileName);
  });

  it('rejects duplicate screenshot IDs and unsupported image payloads with typed errors', async () => {
    const evidence = sessionEvidence();
    evidence.screenshots[1] = { ...evidence.screenshots[1]!, id: 'screenshot-1' };
    const exporter = new EvidenceExporter(EXPORT_CONFIG, {
      reportGenerator: reportGenerator().generator,
    });

    await expect(exporter.generate(evidence, sessionSummary())).rejects.toMatchObject({
      code: 'EXPORT_FAILED',
    });

    evidence.screenshots = [
      { ...evidence.screenshots[0]!, id: 'unique', fileName: 'capture.svg', blob: new Blob(['x']) },
    ];
    await expect(exporter.generate(evidence, sessionSummary())).rejects.toBeInstanceOf(
      TestWitnessError,
    );
  });
});

describe('generateEvidenceFileName', () => {
  it('resolves supported tokens deterministically and removes traversal and unknown tokens', () => {
    const metadata = sessionEvidence().metadata;
    const fileName = generateEvidenceFileName(
      '../{applicationName}/{environment}:{testCaseId}-{timestamp}-{unknown}.ZIP',
      metadata,
    );

    expect(fileName).toBe('Payments-Portal-QA-TC-42-2026-09-07T13-00-00-000Z.zip');
    expect(fileName).not.toMatch(/[\\/]/u);
    expect(fileName).not.toContain('..');
  });
});

describe('EvidenceExporter browser download', () => {
  it('clicks a temporary anchor, removes it, and revokes its object URL', async () => {
    const evidence = sessionEvidence();
    evidence.screenshots = [];
    evidence.video = undefined;
    const createObjectURL = vi.fn(() => 'blob:test-witness');
    const revokeObjectURL = vi.fn();
    const url: ObjectUrlApi = { createObjectURL, revokeObjectURL };
    const timer: ExportTimer = {
      setTimeout: (callback) => {
        callback();
        return 1;
      },
    };
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.isConnected).toBe(true);
      expect(this.download).toContain('TestWitness-TC-42');
      expect(this.href).toBe('blob:test-witness');
    });
    const exporter = new EvidenceExporter(
      { ...EXPORT_CONFIG, includeHtmlReport: false, includeJsonReport: false },
      { document, reportGenerator: reportGenerator().generator, timer, url },
    );

    const result = await exporter.download(evidence, sessionSummary());

    expect(result.fileName).toContain('TestWitness-TC-42');
    expect(click).toHaveBeenCalledOnce();
    expect(createObjectURL).toHaveBeenCalledWith(result.blob);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-witness');
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('still removes the anchor and revokes the URL when clicking fails', async () => {
    const evidence = sessionEvidence();
    evidence.screenshots = [];
    evidence.video = undefined;
    const revokeObjectURL = vi.fn();
    const timer: ExportTimer = {
      setTimeout: (callback) => {
        callback();
        return 1;
      },
    };
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('blocked');
    });
    const exporter = new EvidenceExporter(
      { ...EXPORT_CONFIG, includeHtmlReport: false, includeJsonReport: false },
      {
        document,
        reportGenerator: reportGenerator().generator,
        timer,
        url: { createObjectURL: () => 'blob:failed-download', revokeObjectURL },
      },
    );

    await expect(exporter.download(evidence, sessionSummary())).rejects.toMatchObject({
      code: 'EXPORT_FAILED',
    });
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:failed-download');
    expect(document.querySelector('a[download]')).toBeNull();
  });
});
