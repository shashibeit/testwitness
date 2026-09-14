import { afterEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';

import { TestWitness } from '../src/core/TestWitness';

vi.mock('html-to-image', () => ({
  toCanvas: vi.fn(() => Promise.resolve(document.createElement('canvas'))),
}));

afterEach(() => {
  vi.useRealTimers();
});

function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Blob read failed.'));
    reader.onload = () => {
      if (reader.result === null || typeof reader.result === 'string') {
        reject(new Error('Unexpected Blob result.'));
        return;
      }
      resolve(new Uint8Array(reader.result));
    };
    reader.readAsArrayBuffer(blob);
  });
}

describe('automatic screenshot integration', () => {
  it('stores start, navigation, and manual screenshots in the session summary', async () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      function encodeScreenshot(callback, type): void {
        callback(new Blob(['screenshot-pixels'], { type: type ?? 'image/png' }));
      },
    );
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-witness-download');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    document.body.innerHTML = '<main><h1>Operations portal</h1></main>';
    const witness = new TestWitness({
      applicationName: 'Operations portal',
      environment: 'test',
      screenshot: {
        enabled: true,
        captureOnStart: true,
        captureOnNavigation: true,
        autoCaptureIntervalSeconds: 0,
      },
      video: { enabled: false },
      actions: {
        enabled: true,
        captureClicks: false,
        captureFormSubmissions: false,
        captureInputChanges: false,
        captureNavigation: true,
      },
      console: { enabled: false },
      network: { enabled: false },
    });

    await witness.initialize();
    try {
      await witness.startSession({}, { captureVideo: false });
      await vi.advanceTimersByTimeAsync(150);
      expect(witness.getSessionSummary().evidence.screenshots).toBe(1);

      window.history.pushState(null, '', '/dashboard');
      await vi.advanceTimersByTimeAsync(150);
      expect(witness.getSessionSummary().evidence.screenshots).toBe(2);

      await witness.captureScreenshot('Tester checkpoint');
      expect(witness.getSessionSummary().evidence.screenshots).toBe(3);

      const result = await witness.stopSession('passed');
      expect(result.summary.evidence.screenshots).toBe(3);
      expect(result.summary.warnings).toEqual([]);

      vi.useRealTimers();
      const download = await witness.downloadEvidence();
      const zip = await JSZip.loadAsync(await blobBytes(download.blob));
      expect(Object.keys(zip.files)).toEqual(
        expect.arrayContaining([
          'report.html',
          'screenshots/001-session-started.png',
          'screenshots/002-page-navigation.png',
          'screenshots/003-tester-checkpoint.png',
        ]),
      );
      expect(await zip.file('report.html')?.async('string')).toContain(
        'screenshots/003-tester-checkpoint.png',
      );
    } finally {
      await witness.destroy();
    }
  });
});
