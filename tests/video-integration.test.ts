import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TestWitness } from '../src';

class IntegrationTrack extends EventTarget {
  public stopCalls = 0;

  public getSettings(): MediaTrackSettings {
    return { displaySurface: 'browser' };
  }

  public stop(): void {
    this.stopCalls += 1;
  }
}

class IntegrationStream {
  public constructor(private readonly track: IntegrationTrack) {}

  public getVideoTracks(): MediaStreamTrack[] {
    return [this.track as unknown as MediaStreamTrack];
  }

  public getTracks(): MediaStreamTrack[] {
    return this.getVideoTracks();
  }
}

class IntegrationMediaRecorder extends EventTarget {
  public static isTypeSupported(mimeType: string): boolean {
    return mimeType.startsWith('video/webm');
  }

  public state: RecordingState = 'inactive';
  public readonly mimeType: string;

  public constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    super();
    this.mimeType = options?.mimeType ?? 'video/webm';
  }

  public start(): void {
    this.state = 'recording';
  }

  public pause(): void {
    this.state = 'paused';
  }

  public resume(): void {
    this.state = 'recording';
  }

  public stop(): void {
    this.state = 'inactive';
    queueMicrotask(() => {
      const dataEvent = new Event('dataavailable');
      Object.defineProperty(dataEvent, 'data', {
        value: new Blob(['integration-video-bytes'], { type: this.mimeType }),
      });
      this.dispatchEvent(dataEvent);
      this.dispatchEvent(new Event('stop'));
    });
  }
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return await new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Blob read failed.'));
    reader.onload = () => {
      const result = reader.result;
      if (!(result instanceof ArrayBuffer)) {
        reject(new Error('Expected an ArrayBuffer while reading the evidence ZIP.'));
        return;
      }
      resolve(new Uint8Array(result));
    };
    reader.readAsArrayBuffer(blob);
  });
}

const witnesses: TestWitness[] = [];
const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');

afterEach(async () => {
  await Promise.allSettled(witnesses.splice(0).map(async (witness) => await witness.destroy()));
  if (originalMediaDevices) {
    Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices);
  } else {
    Reflect.deleteProperty(navigator, 'mediaDevices');
  }
  vi.unstubAllGlobals();
});

// This integration test uses deterministic browser API fakes; it does not automate a real chooser.
describe('video evidence integration', () => {
  it('carries an opted-in non-empty WebM recording through the public API into the ZIP', async () => {
    const track = new IntegrationTrack();
    const stream = new IntegrationStream(track);
    const getDisplayMedia = vi.fn(() => Promise.resolve(stream as unknown as MediaStream));
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getDisplayMedia,
        getSupportedConstraints: () => ({ displaySurface: true }),
      },
    });
    vi.stubGlobal('MediaRecorder', IntegrationMediaRecorder);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:video-integration');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    const witness = new TestWitness({
      applicationName: 'Video integration portal',
      environment: 'test',
      screenshot: { enabled: false },
      video: { enabled: false, includeAudio: false },
      actions: { enabled: false },
      console: { enabled: false },
      network: { enabled: false },
      toolbar: { enabled: false },
    });
    witnesses.push(witness);
    await witness.initialize();

    const started = await witness.startSession({}, { captureVideo: true });
    expect(started.videoStatus).toBe('recording');
    expect(getDisplayMedia).toHaveBeenCalledWith({
      audio: false,
      video: { displaySurface: 'browser' },
    });

    const stopped = await witness.stopSession('passed');
    expect(stopped.summary.videoStatus).toBe('captured');
    expect(stopped.summary.evidence.hasVideo).toBe(true);
    expect(track.stopCalls).toBe(1);

    const download = await witness.downloadEvidence();
    const zip = await JSZip.loadAsync(await blobBytes(download.blob));
    const recording = await zip.file('recording.webm')?.async('uint8array');
    const report = await zip.file('report.html')?.async('string');

    expect(recording?.byteLength).toBeGreaterThan(0);
    expect(new TextDecoder().decode(recording)).toBe('integration-video-bytes');
    expect(report).toContain('<span>Video</span><strong>Captured</strong>');
    expect(report).toContain('src="recording.webm"');
  });
});
