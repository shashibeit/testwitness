import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  TestWitness,
  TestWitnessError,
  type SessionStartOptions,
  type TestWitnessConfig,
} from '../src';

const witnesses: TestWitness[] = [];

function createWitness(overrides: Partial<TestWitnessConfig> = {}): TestWitness {
  const witness = new TestWitness({
    applicationName: 'Accounts Portal',
    environment: 'QA',
    actions: { enabled: false },
    console: { enabled: false },
    network: { enabled: false },
    screenshot: { enabled: false },
    ...overrides,
  });
  witnesses.push(witness);
  return witness;
}

afterEach(async () => {
  await Promise.allSettled(witnesses.splice(0).map(async (witness) => await witness.destroy()));
});

describe('public API', () => {
  it('exposes typed errors with stable codes', () => {
    const error = new TestWitnessError('NOT_INITIALIZED', 'Initialize first');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('TestWitnessError');
    expect(error.code).toBe('NOT_INITIALIZED');
  });

  it('coordinates the public session lifecycle and typed results', async () => {
    const witness = createWitness();

    expect(witness.getSessionStatus()).toBe('idle');
    await witness.initialize();
    const started = await witness.startSession({
      testCaseId: 'TC-42',
      testCaseName: 'Sign in',
      custom: { build: 17, accessToken: 'must-not-leak' },
    });
    expect(started.status).toBe('recording');

    const note = witness.addNote('Validated account sign in');
    expect(note.text).toBe('Validated account sign in');
    expect(witness.pauseSession().status).toBe('paused');
    expect(witness.setSessionResult('passed').result).toBe('passed');
    expect(witness.resumeSession().status).toBe('recording');

    const result = await witness.stopSession();
    expect(result.metadata).toMatchObject({
      applicationName: 'Accounts Portal',
      testCaseId: 'TC-42',
      result: 'passed',
      custom: { build: 17, accessToken: '[REDACTED]' },
    });
    expect(result.metadata.endedAt).toBeDefined();
    expect(result.summary).toMatchObject({
      status: 'stopped',
      result: 'passed',
      evidence: { notes: 1 },
    });
  });

  it('keeps a session active and reports a warning when video is unsupported', async () => {
    const witness = createWitness({ video: { enabled: true } });
    await witness.initialize();

    const summary = await witness.startSession();

    expect(summary.status).toBe('recording');
    expect(summary.videoRecording).toBe(false);
    expect(summary.videoStatus).toBe('unavailable');
    expect(summary.warnings).toEqual([expect.objectContaining({ code: 'VIDEO_UNAVAILABLE' })]);
    await witness.stopSession('blocked');
  });

  it('persists manual screenshot failures as recoverable session warnings', async () => {
    const witness = createWitness();
    await witness.initialize();
    await witness.startSession();

    await expect(witness.captureScreenshot('Unavailable capture')).rejects.toMatchObject({
      code: 'SCREENSHOT_DISABLED',
    });
    expect(witness.getSessionSummary().warnings).toEqual([
      expect.objectContaining({ code: 'CAPTURE_FAILED' }),
    ]);
    await witness.stopSession('blocked');
  });

  it('lets an explicit per-session choice override the configured video default', async () => {
    const optedOut = createWitness({ video: { enabled: true } });
    await optedOut.initialize();

    const withoutVideo = await optedOut.startSession({}, { captureVideo: false });
    expect(withoutVideo.videoStatus).toBe('off');
    expect(withoutVideo.warnings).toEqual([]);
    await optedOut.stopSession();

    const optedIn = createWitness({ video: { enabled: false } });
    await optedIn.initialize();

    const withVideoAttempt = await optedIn.startSession({}, { captureVideo: true });
    expect(withVideoAttempt.status).toBe('recording');
    expect(withVideoAttempt.videoStatus).toBe('unavailable');
    expect(withVideoAttempt.warnings).toEqual([
      expect.objectContaining({ code: 'VIDEO_UNAVAILABLE' }),
    ]);
    await optedIn.stopSession();
  });

  it('validates per-session video options before starting a session', async () => {
    const witness = createWitness();
    await witness.initialize();
    const invalidOptions = { captureVideo: 'yes' } as unknown as SessionStartOptions;

    await expect(witness.startSession({}, invalidOptions)).rejects.toMatchObject({
      code: 'INVALID_CONFIG',
    });
    expect(witness.getSessionStatus()).toBe('idle');
  });

  it('prevents simultaneous sessions across TestWitness instances', async () => {
    const first = createWitness();
    const second = createWitness();
    await first.initialize();
    await second.initialize();
    await first.startSession();

    await expect(second.startSession()).rejects.toMatchObject({
      code: 'SESSION_ALREADY_ACTIVE',
    });
    await first.stopSession();
    expect((await second.startSession()).status).toBe('recording');
  });

  it('coalesces concurrent stop requests into one completed session', async () => {
    const witness = createWitness();
    await witness.initialize();
    await witness.startSession();

    const [first, second] = await Promise.all([
      witness.stopSession('passed'),
      witness.stopSession('failed'),
    ]);

    expect(first.metadata.sessionId).toBe(second.metadata.sessionId);
    expect(first.summary.result).toBe('passed');
    expect(second.summary.result).toBe('passed');
    expect(witness.getSessionStatus()).toBe('stopped');
  });

  it('installs recorders for a session and restores host methods at stop', async () => {
    const hostFetch = vi
      .fn()
      .mockImplementationOnce(() => Promise.resolve(new Response(null, { status: 204 })))
      .mockImplementationOnce(() => Promise.resolve(new Response('failed', { status: 503 })));
    Object.defineProperty(window, 'fetch', {
      configurable: true,
      value: hostFetch,
      writable: true,
    });
    const hostConsoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const button = document.createElement('button');
    button.dataset.testid = 'save';
    button.textContent = 'Save';
    document.body.append(button);
    const witness = createWitness({
      actions: {
        enabled: true,
        captureClicks: true,
        captureFormSubmissions: false,
        captureInputChanges: false,
        captureNavigation: false,
      },
      console: { enabled: true, levels: ['error'] },
      network: {
        enabled: true,
        captureSuccessfulRequests: true,
        captureFailedFetch: true,
        captureFailedXhr: false,
      },
    });
    await witness.initialize();
    await witness.startSession();
    const patchedFetch: unknown = Reflect.get(window, 'fetch');

    button.click();
    console.error('save failed', { authorization: 'secret' });
    await window.fetch('/api/health');
    await window.fetch('/api/save');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const result = await witness.stopSession('failed');

    expect(result.summary.evidence).toMatchObject({
      actions: 1,
      consoleLogs: 1,
      networkRequests: 2,
      successfulRequests: 1,
      networkErrors: 1,
    });
    expect(patchedFetch).not.toBe(hostFetch);
    expect(Reflect.get(window, 'fetch')).toBe(hostFetch);
    expect(console.error).toBe(hostConsoleError);
  });

  it('throws typed state errors and can be reinitialized after destroy', async () => {
    const witness = createWitness();
    await expect(witness.startSession()).rejects.toMatchObject({ code: 'NOT_INITIALIZED' });
    await witness.initialize();
    await expect(witness.initialize()).rejects.toMatchObject({ code: 'ALREADY_INITIALIZED' });
    await expect(witness.downloadEvidence()).rejects.toMatchObject({
      code: 'INVALID_SESSION_STATE',
    });

    await witness.destroy();
    expect(witness.getSessionStatus()).toBe('idle');
    await witness.initialize();
    await witness.startSession();
    await witness.stopSession('not-set');
  });

  it('rejects overlapping initialization attempts without mounting duplicate UI', async () => {
    const witness = createWitness({ toolbar: { enabled: true } });

    const initialization = witness.initialize();
    await expect(witness.initialize()).rejects.toMatchObject({ code: 'ALREADY_INITIALIZED' });
    await initialization;

    expect(document.querySelectorAll('[data-test-witness]')).toHaveLength(1);
  });

  it('mounts and removes the optional Shadow DOM toolbar through initialization', async () => {
    const witness = createWitness({ toolbar: { enabled: true, position: 'bottom-left' } });

    await witness.initialize();
    const toolbar = document.querySelector<HTMLElement>('[data-test-witness]');
    expect(toolbar?.dataset.position).toBe('bottom-left');
    expect(toolbar?.shadowRoot).not.toBeNull();

    await witness.destroy();
    expect(document.querySelector('[data-test-witness]')).toBeNull();
  });
});
