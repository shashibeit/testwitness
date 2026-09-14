import { describe, expect, it } from 'vitest';

import { MetadataCollector, type MetadataEnvironment } from '../src/metadata/MetadataCollector';
import type { ResolvedTestWitnessConfig } from '../src/types/config';

const CONFIG: ResolvedTestWitnessConfig = {
  applicationName: 'Payments Console',
  environment: 'qa',
  releaseVersion: '2026.09.1',
  tester: { name: 'Configured Tester', employeeId: 'T-1' },
  session: {
    testCaseId: 'TC-CONFIG',
    testCaseName: 'Configured test',
    requirementId: 'REQ-CONFIG',
  },
  screenshot: {
    enabled: true,
    format: 'png',
    quality: 0.92,
    captureOnError: false,
    captureOnStart: true,
    captureOnNavigation: true,
    autoCaptureIntervalSeconds: 0,
    maxAutomaticScreenshots: 50,
  },
  video: {
    enabled: true,
    mimeType: 'video/webm',
    maxDurationMinutes: 30,
    includeAudio: false,
  },
  actions: {
    enabled: true,
    captureClicks: true,
    captureFormSubmissions: true,
    captureInputChanges: true,
    captureNavigation: true,
    captureTextInputValues: false,
  },
  console: { enabled: true, levels: ['warn', 'error'] },
  network: {
    enabled: true,
    captureSuccessfulRequests: false,
    captureFailedFetch: true,
    captureFailedXhr: true,
    captureRequestBody: false,
    captureResponseBody: false,
  },
  privacy: {
    maskSelectors: [],
    excludeSelectors: [],
    sensitiveFieldNames: [],
    sensitiveQueryParameters: [],
    redactHeaders: [],
  },
  toolbar: { enabled: false, position: 'bottom-right' },
  export: {
    fileNamePattern: 'TestWitness-{testCaseId}-{timestamp}',
    includeHtmlReport: true,
    includeJsonReport: true,
  },
  memory: { warningThresholdMb: 250 },
};

function navigatorFrom(userAgent: string, platform: string): Navigator {
  return { userAgent, platform } as unknown as Navigator;
}

describe('MetadataCollector', () => {
  it('merges explicit session values over configuration defaults', () => {
    const environment: MetadataEnvironment = {
      navigator: navigatorFrom('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/142.0', 'Win32'),
      window: { innerWidth: 1440, innerHeight: 900 },
      screen: { width: 2560, height: 1440 },
      document: { title: 'Payment approved' },
      location: { href: 'https://qa.example.test/payments/42' },
    };
    const collector = new MetadataCollector(CONFIG, {
      environment,
      clock: () => new Date('2026-09-07T12:30:00.000Z'),
      idFactory: () => 'session-metadata',
      libraryVersion: '0.1.0-test',
    });

    const metadata = collector.collect({
      testerName: 'Session Tester',
      testCaseId: 'TC-42',
      testCaseName: 'Approve payment',
      custom: { buildNumber: 81, smoke: true },
    });

    expect(metadata).toMatchObject({
      sessionId: 'session-metadata',
      applicationName: 'Payments Console',
      environment: 'qa',
      releaseVersion: '2026.09.1',
      testerName: 'Session Tester',
      testerEmployeeId: 'T-1',
      testCaseId: 'TC-42',
      testCaseName: 'Approve payment',
      requirementId: 'REQ-CONFIG',
      startedAt: '2026-09-07T12:30:00.000Z',
      durationMs: 0,
      currentUrl: 'https://qa.example.test/payments/42',
      pageTitle: 'Payment approved',
      browser: { name: 'Firefox', version: '142.0' },
      operatingSystem: { name: 'Windows', version: '10.0' },
      viewport: { width: 1440, height: 900 },
      screen: { width: 2560, height: 1440 },
      libraryVersion: '0.1.0-test',
      result: 'not-set',
      custom: { buildNumber: 81, smoke: true },
    });
  });

  it('can reuse the SessionManager identity and timestamp', () => {
    const collector = new MetadataCollector(CONFIG, {
      environment: {},
      clock: () => new Date('2099-01-01T00:00:00.000Z'),
      idFactory: () => 'unused-id',
    });

    const metadata = collector.collect(
      {},
      {
        sessionId: 'session-from-manager',
        startedAt: new Date('2026-09-07T13:00:00.000Z'),
      },
    );

    expect(metadata.sessionId).toBe('session-from-manager');
    expect(metadata.startedAt).toBe('2026-09-07T13:00:00.000Z');
  });

  it('uses Client Hints when available and feature-detects absent page APIs', () => {
    const hintedNavigator = {
      userAgent: '',
      platform: '',
      userAgentData: {
        brands: [
          { brand: 'Chromium', version: '140' },
          { brand: 'Microsoft Edge', version: '140' },
        ],
        platform: 'macOS',
      },
    } as unknown as Navigator;
    const collector = new MetadataCollector(CONFIG, {
      environment: { navigator: hintedNavigator },
      libraryVersion: 'test',
    });

    expect(collector.collect()).toMatchObject({
      currentUrl: '',
      pageTitle: '',
      browser: { name: 'Microsoft Edge', version: '140' },
      operatingSystem: { name: 'macOS' },
      viewport: { width: 0, height: 0 },
      screen: { width: 0, height: 0 },
    });
  });

  it('finalizes a cloned snapshot and refreshes changing page metadata', () => {
    let now = new Date('2026-09-07T14:00:00.000Z');
    const locationValue = { href: 'https://qa.example.test/start' };
    const documentValue = { title: 'Start page' };
    const windowValue = { innerWidth: 1024, innerHeight: 768 };
    const collector = new MetadataCollector(CONFIG, {
      environment: {
        location: locationValue,
        document: documentValue,
        window: windowValue,
        screen: { width: 1920, height: 1080 },
      },
      clock: () => new Date(now),
      libraryVersion: 'test',
      sanitizeUrl: (url) => url.replace(/token=[^&]+/, 'token=[REDACTED]'),
    });
    const started = collector.collect();

    locationValue.href = 'https://qa.example.test/done?token=secret';
    documentValue.title = 'Done page';
    windowValue.innerWidth = 1280;
    now = new Date('2026-09-07T14:00:12.345Z');

    const completed = collector.complete(started, 'passed');

    expect(completed).not.toBe(started);
    expect(started.endedAt).toBeUndefined();
    expect(completed).toMatchObject({
      endedAt: '2026-09-07T14:00:12.345Z',
      durationMs: 12_345,
      result: 'passed',
      currentUrl: 'https://qa.example.test/done?token=[REDACTED]',
      pageTitle: 'Done page',
      viewport: { width: 1280, height: 768 },
    });
  });

  it('normalizes invalid dimensions and negative elapsed wall time', () => {
    const collector = new MetadataCollector(CONFIG, {
      environment: {
        window: { innerWidth: Number.NaN, innerHeight: -1 },
        screen: { width: Number.POSITIVE_INFINITY, height: -50 },
      },
      clock: () => new Date('2026-09-07T09:00:00.000Z'),
      libraryVersion: 'test',
    });
    const started = collector.collect({}, { startedAt: new Date('2026-09-07T10:00:00.000Z') });

    expect(started.viewport).toEqual({ width: 0, height: 0 });
    expect(started.screen).toEqual({ width: 0, height: 0 });
    expect(collector.complete(started, 'blocked').durationMs).toBe(0);
  });

  it('applies the configured text sanitizer to page and configured metadata text', () => {
    const collector = new MetadataCollector(
      {
        ...CONFIG,
        tester: { name: 'secret tester', employeeId: 'T-secret' },
      },
      {
        environment: { document: { title: 'secret page' } },
        sanitizeText: (text) => text.replace(/secret/gu, '[REDACTED]'),
      },
    );

    const metadata = collector.collect();

    expect(metadata.testerName).toBe('[REDACTED] tester');
    expect(metadata.testerEmployeeId).toBe('T-[REDACTED]');
    expect(metadata.pageTitle).toBe('[REDACTED] page');
  });
});
