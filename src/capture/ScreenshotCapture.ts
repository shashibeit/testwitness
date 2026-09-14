import { toCanvas } from 'html-to-image';

import type { DataSanitizer } from '../privacy/DataSanitizer';
import type { ElementMasker } from '../privacy/ElementMasker';
import type { ResolvedTestWitnessConfig } from '../types/config';
import type { ScreenshotRecord } from '../types/evidence';
import { TestWitnessError } from '../utils/errors';
import { createId } from '../utils/ids';

const MAX_RENDER_DIMENSION = 16_384;
const MAX_RENDER_PIXELS = 32_000_000;

type HtmlToImageOptions = NonNullable<Parameters<typeof toCanvas>[1]>;

export interface ScreenshotCaptureOptions {
  config: ResolvedTestWitnessConfig['screenshot'];
  sanitizer: DataSanitizer;
  masker: ElementMasker;
  actionSequenceProvider: () => number;
  document?: Document;
  window?: Window;
  renderer?: (node: HTMLElement, options: HtmlToImageOptions) => Promise<HTMLCanvasElement>;
  canvasEncoder?: (canvas: HTMLCanvasElement, mimeType: string, quality: number) => Promise<Blob>;
  runWithoutNetworkRecording?: <Result>(operation: () => Promise<Result>) => Promise<Result>;
  timestampProvider?: () => string;
  idFactory?: () => string;
}

function slugifyLabel(label: string): string {
  const slug = label
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'screenshot';
}

function defaultCanvasEncoder(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('The browser returned an empty screenshot image.'));
        },
        mimeType,
        quality,
      );
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

function captureDimensions(
  documentValue: Document,
  windowValue: Window | undefined,
): { width: number; height: number; pixelRatio: number } {
  const root = documentValue.documentElement;
  const width = Math.min(
    MAX_RENDER_DIMENSION,
    Math.max(1, root.scrollWidth, root.clientWidth, windowValue?.innerWidth ?? 0),
  );
  const height = Math.min(
    MAX_RENDER_DIMENSION,
    Math.max(1, root.scrollHeight, root.clientHeight, windowValue?.innerHeight ?? 0),
  );
  const requestedRatio = Math.min(2, Math.max(1, windowValue?.devicePixelRatio ?? 1));
  const pixelBoundRatio = Math.sqrt(MAX_RENDER_PIXELS / (width * height));
  return { width, height, pixelRatio: Math.min(requestedRatio, pixelBoundRatio) };
}

/** Produces serialized, privacy-filtered DOM screenshots through html-to-image. */
export class ScreenshotCapture {
  readonly #config: ResolvedTestWitnessConfig['screenshot'];
  readonly #sanitizer: DataSanitizer;
  readonly #masker: ElementMasker;
  readonly #actionSequenceProvider: () => number;
  readonly #document?: Document;
  readonly #window?: Window;
  readonly #renderer: (
    node: HTMLElement,
    options: HtmlToImageOptions,
  ) => Promise<HTMLCanvasElement>;
  readonly #canvasEncoder: (
    canvas: HTMLCanvasElement,
    mimeType: string,
    quality: number,
  ) => Promise<Blob>;
  readonly #runWithoutNetworkRecording: <Result>(
    operation: () => Promise<Result>,
  ) => Promise<Result>;
  readonly #timestampProvider: () => string;
  readonly #idFactory: () => string;
  #captureQueue: Promise<void> = Promise.resolve();
  #screenshotNumber = 0;

  public constructor(options: ScreenshotCaptureOptions) {
    this.#config = options.config;
    this.#sanitizer = options.sanitizer;
    this.#masker = options.masker;
    this.#actionSequenceProvider = options.actionSequenceProvider;
    this.#document = options.document ?? (typeof document === 'undefined' ? undefined : document);
    this.#window = options.window ?? (typeof window === 'undefined' ? undefined : window);
    this.#renderer = options.renderer ?? toCanvas;
    this.#canvasEncoder = options.canvasEncoder ?? defaultCanvasEncoder;
    this.#runWithoutNetworkRecording =
      options.runWithoutNetworkRecording ?? (async (operation) => await operation());
    this.#timestampProvider = options.timestampProvider ?? (() => new Date().toISOString());
    this.#idFactory = options.idFactory ?? (() => createId('screenshot'));
  }

  public reset(): void {
    this.#screenshotNumber = 0;
  }

  public capture(label = 'Screenshot'): Promise<ScreenshotRecord> {
    const operation = this.#captureQueue.then(() => this.performCapture(label));
    this.#captureQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private async performCapture(label: string): Promise<ScreenshotRecord> {
    if (!this.#config.enabled) {
      throw new TestWitnessError('SCREENSHOT_DISABLED', 'Screenshot capture is disabled.');
    }

    // html-to-image is intended to render visible content elements. Capturing <html> also walks
    // <head> resources and browser-only nodes that are not part of the page image.
    const documentValue = this.#document;
    const root = documentValue?.body ?? documentValue?.documentElement;
    if (!documentValue || !root) {
      throw new TestWitnessError(
        'SCREENSHOT_FAILED',
        'Screenshot capture requires an active browser document.',
      );
    }

    const masking = this.#masker.prepare();
    try {
      const { width, height, pixelRatio } = captureDimensions(documentValue, this.#window);
      const canvas = await this.#runWithoutNetworkRecording(
        async () =>
          await this.#renderer(root, {
            backgroundColor: this.#config.format === 'jpeg' ? '#ffffff' : undefined,
            cacheBust: false,
            filter: masking.filter,
            height,
            pixelRatio,
            quality: this.#config.quality,
            skipAutoScale: false,
            width,
          }),
      );
      const mimeType = `image/${this.#config.format}`;
      const blob = await this.#canvasEncoder(canvas, mimeType, this.#config.quality);
      const sanitizedLabel = this.#sanitizer.sanitizeText(label || 'Screenshot', 160);
      this.#screenshotNumber += 1;
      const fileName = `${String(this.#screenshotNumber).padStart(3, '0')}-${slugifyLabel(sanitizedLabel)}.${this.#config.format === 'jpeg' ? 'jpg' : 'png'}`;

      return {
        id: this.#idFactory(),
        timestamp: this.#timestampProvider(),
        label: sanitizedLabel,
        url: this.#sanitizer.sanitizeUrl(this.#window?.location.href ?? ''),
        actionSequence: this.#actionSequenceProvider(),
        blob,
        fileName,
      };
    } catch (error) {
      if (error instanceof TestWitnessError) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      throw new TestWitnessError(
        'SCREENSHOT_FAILED',
        `Screenshot capture failed: ${reason}`,
        error,
      );
    } finally {
      masking.restore();
    }
  }
}
