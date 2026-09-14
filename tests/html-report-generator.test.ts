import { describe, expect, it } from 'vitest';

import {
  escapeHtml,
  HtmlReportGenerator,
  type ReportAssetManifest,
} from '../src/evidence/HtmlReportGenerator';
import type { SessionEvidence, SessionSummary } from '../src/types/session';

function makeEvidence(): SessionEvidence {
  return {
    metadata: {
      sessionId: 'session-42',
      applicationName: 'Payments Console',
      environment: 'QA',
      releaseVersion: '2026.09.7',
      testerName: 'Taylor Tester',
      testerEmployeeId: 'E-42',
      testCaseId: 'TC-42',
      testCaseName: 'Approve a payment',
      requirementId: 'REQ-9',
      startedAt: '2026-09-07T10:00:00.000Z',
      endedAt: '2026-09-07T10:02:03.456Z',
      durationMs: 123_456,
      currentUrl: 'https://qa.example.test/payments/42',
      pageTitle: 'Payment approved',
      browser: { name: 'Chrome', version: '140.0' },
      operatingSystem: { name: 'Windows', version: '10.0' },
      viewport: { width: 1440, height: 900 },
      screen: { width: 2560, height: 1440 },
      libraryVersion: '0.1.0',
      result: 'passed',
      custom: { zeta: 'last', alpha: 1 },
    },
    actions: [
      {
        sequence: 1,
        timestamp: '2026-09-07T10:00:02.000Z',
        type: 'click',
        elementTag: 'button',
        elementIdentifier: '[data-testid="approve"]',
        elementText: 'Approve',
        url: 'https://qa.example.test/payments/42',
      },
    ],
    notes: [
      {
        id: 'note-1',
        timestamp: '2026-09-07T10:00:01.000Z',
        text: 'Preconditions validated',
        url: 'https://qa.example.test/payments/42',
        actionSequence: 0,
      },
    ],
    screenshots: [
      {
        id: 'shot-1',
        timestamp: '2026-09-07T10:00:03.000Z',
        label: 'Payment approved',
        url: 'https://qa.example.test/payments/42',
        actionSequence: 1,
        blob: new Blob(['image'], { type: 'image/png' }),
        fileName: '001-payment-approved.png',
      },
    ],
    consoleLogs: [
      {
        id: 'console-1',
        timestamp: '2026-09-07T10:00:04.000Z',
        level: 'warn',
        message: 'Retry scheduled',
        arguments: ['Retry scheduled', { attempt: 2, reason: 'timeout' }],
        url: 'https://qa.example.test/payments/42',
      },
    ],
    networkRequests: [
      {
        id: 'request-success-1',
        timestamp: '2026-09-07T10:00:04.500Z',
        transport: 'fetch',
        method: 'POST',
        url: 'https://api.example.test/payments?view=summary',
        status: 201,
        durationMs: 90,
        outcome: 'success',
      },
      {
        id: 'network-1',
        timestamp: '2026-09-07T10:00:05.000Z',
        transport: 'fetch',
        method: 'POST',
        url: 'https://api.example.test/payments',
        status: 503,
        durationMs: 250,
        outcome: 'http-error',
      },
      {
        id: 'request-success-2',
        timestamp: '2026-09-07T10:00:06.000Z',
        transport: 'xhr',
        method: 'GET',
        url: 'https://api.example.test/profile',
        status: 200,
        durationMs: 45,
        outcome: 'success',
      },
    ],
    networkErrors: [
      {
        id: 'network-1',
        timestamp: '2026-09-07T10:00:05.000Z',
        transport: 'fetch',
        method: 'POST',
        url: 'https://api.example.test/payments',
        status: 503,
        durationMs: 250,
        failureType: 'http-error',
        requestHeaders: { authorization: '[REDACTED]' },
        responseHeaders: { 'content-type': 'application/json' },
        responseBody: { message: 'Unavailable' },
      },
    ],
    video: {
      id: 'video-1',
      startedAt: '2026-09-07T10:00:00.500Z',
      endedAt: '2026-09-07T10:02:00.500Z',
      durationMs: 120_000,
      mimeType: 'video/webm;codecs=vp8',
      blob: new Blob(['video'], { type: 'video/webm' }),
      fileName: 'recording.webm',
      stopReason: 'session-stopped',
    },
  };
}

function makeSummary(): SessionSummary {
  return {
    sessionId: 'session-42',
    status: 'stopped',
    result: 'passed',
    startedAt: '2026-09-07T10:00:00.000Z',
    endedAt: '2026-09-07T10:02:03.456Z',
    durationMs: 123_456,
    evidence: {
      screenshots: 1,
      actions: 1,
      consoleLogs: 1,
      networkRequests: 3,
      successfulRequests: 2,
      networkErrors: 1,
      notes: 1,
      hasVideo: true,
    },
    approximateSizeBytes: 10_000,
    memoryWarningReached: false,
    videoStatus: 'captured',
    videoRecording: false,
    warnings: [],
  };
}

const ASSETS: ReportAssetManifest = {
  screenshots: { 'shot-1': 'screenshots/001-payment-approved.png' },
  video: 'recording.webm',
};

describe('escapeHtml', () => {
  it('escapes every HTML text and quoted-attribute metacharacter', () => {
    expect(escapeHtml(`<tag a="x" b='y'>&`)).toBe('&lt;tag a=&quot;x&quot; b=&#39;y&#39;&gt;&amp;');
  });
});

describe('HtmlReportGenerator', () => {
  it('renders the decision summary, evidence explorer, endpoint analysis, and ZIP-local media', () => {
    const html = new HtmlReportGenerator().generate(makeEvidence(), makeSummary(), ASSETS);

    expect(html).toContain('<title>TestWitness — Payments Console</title>');
    expect(html).toContain('<h1>TestWitness Evidence Report</h1>');
    expect(html).toContain('Generated offline by TestWitness 0.1.0.');
    for (const heading of [
      'Session summary',
      'Capture health',
      'Tester journey',
      'Request and endpoint review',
      'Screenshots',
      'Tester notes',
      'Video recording',
      'Metadata',
    ]) {
      expect(html).toContain(`>${heading}</h2>`);
    }
    expect(html).toContain('Result: Passed');
    expect(html).toContain('00:02:03.456');
    expect(html).toContain('src="screenshots/001-payment-approved.png"');
    expect(html).toContain('src="recording.webm"');
    expect(html).toContain('>Open recording.webm</a>');
    expect(html).toContain('<table>');
    expect(html).toContain('<caption class="sr-only">');
    expect(html).toContain('aria-label="Session screen recording"');
  });

  it('provides accessible CSS-only filters for journey, successes, errors, and requests', () => {
    const html = new HtmlReportGenerator().generate(makeEvidence(), makeSummary(), ASSETS);

    expect(html).toContain('for="filter-actions"');
    expect(html).toContain('>Tester journey</span>');
    expect(html).toContain('for="filter-successes"');
    expect(html).toContain('>Successful requests</span><strong>2</strong>');
    expect(html).toContain('for="filter-errors"');
    expect(html).toContain('>Errors</span><strong>1</strong>');
    expect(html).toContain('for="filter-requests"');
    expect(html).toContain('>Requests</span><strong>3</strong>');
    expect(html).toContain('#filter-successes:checked~.event-list .event:not(.is-success)');
    expect(html).not.toMatch(/<script\b/iu);
  });

  it('groups requests by method and endpoint without duplicating detailed failures', () => {
    const html = new HtmlReportGenerator().generate(makeEvidence(), makeSummary(), ASSETS);
    const endpointSection = html.slice(
      html.indexOf('id="endpoint-review"'),
      html.indexOf('id="screenshots"'),
    );

    expect(endpointSection).toContain('<span class="method">POST</span>');
    expect(endpointSection).toContain('<code>https://api.example.test/payments</code>');
    expect(endpointSection).toContain('2 total · 1 succeeded · 1 failed');
    expect(endpointSection).toContain('<span class="method">GET</span>');
    expect(endpointSection).toContain('<code>https://api.example.test/profile</code>');
    expect(endpointSection).not.toContain('view=summary');
    expect(html.match(/<span class="event-badge">Request failed<\/span>/gu)).toHaveLength(1);
    expect(html).toContain('authorization');
    expect(html).toContain('[REDACTED]');
  });

  it('uses a strict static CSP and contains no scripts or external resource references', () => {
    const html = new HtmlReportGenerator().generate(makeEvidence(), makeSummary(), ASSETS);

    expect(html).toContain(`default-src 'none'`);
    expect(html).toContain(`script-src 'none'`);
    expect(html).toContain(`connect-src 'none'`);
    expect(html).toContain(`object-src 'none'`);
    expect(html).not.toMatch(/<script\b/iu);
    expect(html).not.toMatch(/(?:src|href)="(?:https?:)?\/\//iu);
  });

  it('escapes malicious values in text, attributes, and structured JSON', () => {
    const evidence = makeEvidence();
    evidence.metadata.applicationName = `<script>alert('app')</script>`;
    evidence.metadata.custom = { '<img src=x onerror=alert(1)>': '"quoted"' };
    evidence.actions[0]!.elementIdentifier = '"><svg onload=alert(1)>';
    evidence.notes[0]!.text = '<img src=x onerror=alert(2)>';
    evidence.consoleLogs[0]!.arguments = [{ detail: '</pre><script>alert(3)</script>' }];
    evidence.networkErrors[0]!.responseHeaders = { bad: '<iframe src=evil>' };
    evidence.screenshots[0]!.label = '" onerror="alert(4)';
    evidence.video!.mimeType = 'video/webm" onerror="alert(5)';
    const assets: ReportAssetManifest = {
      screenshots: { 'shot-1': 'screenshots/quoted"name.png' },
      video: 'recording"quoted.webm',
    };

    const html = new HtmlReportGenerator().generate(evidence, makeSummary(), assets);

    expect(html).not.toMatch(/<script\b/iu);
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<svg onload');
    expect(html).not.toContain('</pre><script>');
    expect(html).toContain('&lt;script&gt;alert(&#39;app&#39;)&lt;/script&gt;');
    expect(html).toContain('screenshots/quoted&quot;name.png');
    expect(html).toContain('video/webm&quot; onerror=&quot;alert(5)');
  });

  it('rejects absolute, traversal, encoded traversal, and URL-like asset paths', () => {
    const unsafePaths = [
      '../private.png',
      '/absolute/private.png',
      'https://evil.example/private.png',
      'screenshots/%2e%2e/private.png',
      'screenshots\\private.png',
    ];

    for (const path of unsafePaths) {
      const html = new HtmlReportGenerator().generate(makeEvidence(), makeSummary(), {
        screenshots: { 'shot-1': path },
        video: path,
      });
      expect(html).toContain('Screenshot asset unavailable.');
      expect(html).toContain('No video recording available.');
      expect(html).not.toContain(`src="${path}"`);
      expect(html).not.toContain(`href="${path}"`);
    }
  });

  it('sorts the chronological explorer deterministically without mutating evidence', () => {
    const evidence = makeEvidence();
    const actionReference = evidence.actions[0];
    const noteReference = evidence.notes[0];
    const generator = new HtmlReportGenerator();

    const first = generator.generate(evidence, makeSummary(), ASSETS);
    const second = generator.generate(evidence, makeSummary(), ASSETS);
    const timeline = first.slice(
      first.indexOf('id="journey-heading"'),
      first.indexOf('id="endpoints-heading"'),
    );

    expect(first).toBe(second);
    expect(timeline.indexOf('2026-09-07T10:00:00.500Z')).toBeLessThan(
      timeline.indexOf('2026-09-07T10:00:01.000Z'),
    );
    expect(timeline.indexOf('2026-09-07T10:00:01.000Z')).toBeLessThan(
      timeline.indexOf('2026-09-07T10:00:02.000Z'),
    );
    expect(evidence.actions[0]).toBe(actionReference);
    expect(evidence.notes[0]).toBe(noteReference);
  });

  it('renders accessible empty states when optional evidence is absent', () => {
    const evidence = makeEvidence();
    evidence.actions = [];
    evidence.notes = [];
    evidence.screenshots = [];
    evidence.consoleLogs = [];
    evidence.networkRequests = [];
    evidence.networkErrors = [];
    delete evidence.video;

    const html = new HtmlReportGenerator().generate(evidence, makeSummary(), {
      screenshots: {},
    });

    expect(html).toContain('No notes captured.');
    expect(html).toContain('No screenshots captured.');
    expect(html).toContain('No video recording available.');
    expect(html).toContain('No chronological evidence was captured.');
    expect(html).toContain('No request activity was captured.');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<main id="report-content">');
  });
});
