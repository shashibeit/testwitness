import { describe, expect, it, vi } from 'vitest';

import {
  mountTestWitnessToolbar,
  type TestWitnessToolbarController,
} from '../src/toolbar/TestWitnessToolbar';
import type { SessionResultStatus, SessionSummary, VideoCaptureStatus } from '../src/types/session';

function summary(
  status: SessionSummary['status'] = 'idle',
  result: SessionResultStatus = 'not-set',
  videoStatus: VideoCaptureStatus = 'off',
): SessionSummary {
  return {
    sessionId: status === 'idle' ? undefined : 'session-1',
    status,
    result,
    startedAt: status === 'idle' ? undefined : '2026-09-07T10:00:00.000Z',
    endedAt: status === 'stopped' ? '2026-09-07T10:01:00.000Z' : undefined,
    durationMs: status === 'idle' ? 0 : 60_000,
    evidence: {
      screenshots: 0,
      actions: 0,
      consoleLogs: 0,
      networkRequests: 0,
      networkErrors: 0,
      successfulRequests: 0,
      notes: 0,
      hasVideo: false,
    },
    approximateSizeBytes: 0,
    memoryWarningReached: false,
    videoStatus,
    videoRecording: videoStatus === 'recording' || videoStatus === 'paused',
    warnings: [],
  };
}

function controllerFixture(): TestWitnessToolbarController & {
  calls: string[];
  emit(next: SessionSummary): void;
} {
  let current = summary();
  const listeners = new Set<(value: SessionSummary) => void>();
  const calls: string[] = [];
  const emit = (next: SessionSummary): void => {
    current = next;
    for (const listener of listeners) listener(next);
  };
  return {
    calls,
    emit,
    startSession: (_metadata, options) => {
      calls.push('start');
      const captureVideo = options?.captureVideo ?? false;
      calls.push(`video:${String(captureVideo)}`);
      emit(summary('recording', 'not-set', captureVideo ? 'recording' : 'off'));
      return Promise.resolve(current);
    },
    pauseSession: () => {
      calls.push('pause');
      emit(
        summary(
          'paused',
          current.result,
          current.videoStatus === 'recording' ? 'paused' : current.videoStatus,
        ),
      );
      return current;
    },
    resumeSession: () => {
      calls.push('resume');
      emit(
        summary(
          'recording',
          current.result,
          current.videoStatus === 'paused' ? 'recording' : current.videoStatus,
        ),
      );
      return current;
    },
    captureScreenshot: () => {
      calls.push('screenshot');
      const next = summary(current.status, current.result, current.videoStatus);
      next.evidence.screenshots = current.evidence.screenshots + 1;
      emit(next);
      return Promise.resolve({
        id: 'shot-1',
        timestamp: '2026-09-07T10:00:30.000Z',
        label: 'Manual screenshot',
        url: 'https://example.test/',
        actionSequence: 0,
        blob: new Blob(),
        fileName: '001-manual-screenshot.png',
      });
    },
    addNote: (text) => {
      calls.push(`note:${text}`);
      return {
        id: 'note-1',
        timestamp: '2026-09-07T10:00:30.000Z',
        text,
        url: 'https://example.test/',
        actionSequence: 0,
      };
    },
    setSessionResult: (result) => {
      calls.push(`result:${result}`);
      emit(summary(current.status, result, current.videoStatus));
      return current;
    },
    stopSession: () => {
      calls.push('stop');
      const capturedVideo = current.videoStatus === 'recording' || current.videoStatus === 'paused';
      const stopped = summary(
        'stopped',
        current.result,
        capturedVideo ? 'captured' : current.videoStatus,
      );
      stopped.evidence.hasVideo = capturedVideo;
      emit(stopped);
      return Promise.resolve({
        metadata: {
          sessionId: 'session-1',
          applicationName: 'Portal',
          environment: 'QA',
          startedAt: '2026-09-07T10:00:00.000Z',
          endedAt: '2026-09-07T10:01:00.000Z',
          durationMs: 60_000,
          currentUrl: 'https://example.test/',
          pageTitle: 'Example',
          browser: { name: 'Chrome', version: '1' },
          operatingSystem: { name: 'Linux' },
          viewport: { width: 1000, height: 700 },
          screen: { width: 1200, height: 800 },
          libraryVersion: '0.1.0',
          result: current.result,
          custom: {},
        },
        summary: current,
      });
    },
    downloadEvidence: () => {
      calls.push('download');
      const blob = new Blob();
      return Promise.resolve({ fileName: 'evidence.zip', blob, sizeBytes: blob.size });
    },
    getSessionSummary: () => current,
    onSummary: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function byLabel<Type extends HTMLElement>(root: ShadowRoot, label: string): Type {
  const element = root.querySelector(`[aria-label="${label}"]`);
  if (!(element instanceof HTMLElement)) throw new Error(`Missing element: ${label}`);
  return element as Type;
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createPointerEvent(
  type: string,
  init: {
    pointerId?: number;
    pointerType?: string;
    clientX?: number;
    clientY?: number;
    button?: number;
    isPrimary?: boolean;
  } = {},
): PointerEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
  Object.defineProperties(event, {
    pointerId: { value: init.pointerId ?? 1 },
    pointerType: { value: init.pointerType ?? 'mouse' },
    clientX: { value: init.clientX ?? 0 },
    clientY: { value: init.clientY ?? 0 },
    button: { value: init.button ?? 0 },
    isPrimary: { value: init.isPrimary ?? true },
  });
  return event;
}

function mockToolbarRect(
  element: HTMLElement,
  initial: { left: number; top: number; width: number; height: number },
): void {
  vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => {
    const styledLeft = Number.parseFloat(element.style.left);
    const styledTop = Number.parseFloat(element.style.top);
    const left = Number.isFinite(styledLeft) ? styledLeft : initial.left;
    const top = Number.isFinite(styledTop) ? styledTop : initial.top;
    return {
      x: left,
      y: top,
      left,
      top,
      right: left + initial.width,
      bottom: top + initial.height,
      width: initial.width,
      height: initial.height,
      toJSON: () => ({}),
    };
  });
}

describe('TestWitnessToolbar', () => {
  it('mounts isolated accessible controls at the configured position', () => {
    const controller = controllerFixture();
    const handle = mountTestWitnessToolbar(controller, 'top-left');
    const root = handle.element.shadowRoot;

    expect(handle.element.tagName).toBe('TEST-WITNESS-TOOLBAR');
    expect(handle.element.dataset.testWitness).toBe('');
    expect(handle.element.dataset.position).toBe('top-left');
    expect(root).not.toBeNull();
    expect(root?.querySelector('style')).not.toBeNull();
    expect(root?.querySelector('[aria-label="TestWitness controls"]')).not.toBeNull();
    expect(root?.querySelectorAll('button')).toHaveLength(7);
    const dragHandle = byLabel<HTMLButtonElement>(root!, 'Move TestWitness toolbar');
    expect(dragHandle.getAttribute('aria-keyshortcuts')).toContain('ArrowRight');
    expect(dragHandle.getAttribute('aria-describedby')).toBe('test-witness-move-instructions');
    expect(handle.element.style.left).toBe('');
    expect(handle.element.style.top).toBe('');
    expect(handle.element.style.right).toBe('');
    expect(handle.element.style.bottom).toBe('');
    expect(byLabel<HTMLButtonElement>(root!, 'Start without video').disabled).toBe(false);
    const captureVideo = byLabel<HTMLInputElement>(root!, 'Capture video during this session');
    expect(captureVideo.type).toBe('checkbox');
    expect(captureVideo.checked).toBe(false);
    expect(captureVideo.disabled).toBe(false);
    expect(root?.querySelector('.screenshot-count')?.textContent).toBe('0 shots');
    expect(byLabel<HTMLButtonElement>(root!, 'Capture screenshot').disabled).toBe(true);
    expect(byLabel<HTMLSelectElement>(root!, 'Session result')).toBeInstanceOf(HTMLSelectElement);
    expect(byLabel<HTMLInputElement>(root!, 'Tester note')).toBeInstanceOf(HTMLInputElement);

    handle.destroy();
    expect(handle.element.isConnected).toBe(false);
  });

  it('runs all controls and reflects session and video state', async () => {
    const controller = controllerFixture();
    const handle = mountTestWitnessToolbar(controller, 'bottom-right');
    const root = handle.element.shadowRoot!;

    const captureVideo = byLabel<HTMLInputElement>(root, 'Capture video during this session');
    captureVideo.checked = true;
    captureVideo.dispatchEvent(new Event('change', { bubbles: true }));
    byLabel<HTMLButtonElement>(root, 'Start with video').click();
    await flush();
    expect(controller.calls).toContain('start');
    expect(controller.calls).toContain('video:true');
    expect(captureVideo.disabled).toBe(true);
    expect(byLabel<HTMLButtonElement>(root, 'Capture screenshot').disabled).toBe(false);
    expect(root.querySelector<HTMLElement>('.video-indicator')?.dataset.active).toBe('true');
    expect(root.querySelector('.video-status')?.textContent).toBe('Video: recording');
    expect(root.querySelector('.duration')?.textContent).toBe('01:00');

    byLabel<HTMLButtonElement>(root, 'Capture screenshot').click();
    await flush();
    expect(root.querySelector('.screenshot-count')?.textContent).toBe('1 shot');
    expect(root.querySelector('.message')?.textContent).toContain('001-manual-screenshot.png');
    const note = byLabel<HTMLInputElement>(root, 'Tester note');
    note.value = 'Checked successful login';
    note.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flush();
    const result = byLabel<HTMLSelectElement>(root, 'Session result');
    result.value = 'failed';
    result.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(controller.calls).toEqual(
      expect.arrayContaining(['screenshot', 'note:Checked successful login', 'result:failed']),
    );

    byLabel<HTMLButtonElement>(root, 'Pause session').click();
    await flush();
    expect(controller.calls).toContain('pause');
    expect(root.querySelector('.video-status')?.textContent).toBe('Video: paused');
    expect(root.querySelector<HTMLElement>('.video-indicator')?.dataset.active).toBe('false');
    byLabel<HTMLButtonElement>(root, 'Resume session').click();
    await flush();
    expect(controller.calls).toContain('resume');

    byLabel<HTMLButtonElement>(root, 'Stop session').click();
    await flush();
    expect(controller.calls).toContain('stop');
    expect(captureVideo.checked).toBe(false);
    expect(captureVideo.disabled).toBe(false);
    expect(root.querySelector('.video-status')?.textContent).toBe('Video: captured');
    expect(byLabel<HTMLButtonElement>(root, 'Download evidence').disabled).toBe(false);
    byLabel<HTMLButtonElement>(root, 'Download evidence').click();
    await flush();
    expect(controller.calls).toContain('download');

    handle.destroy();
  });

  it('starts without video when the tester leaves the opt-in unchecked', async () => {
    const controller = controllerFixture();
    const handle = mountTestWitnessToolbar(controller, 'bottom-right');
    const root = handle.element.shadowRoot!;

    byLabel<HTMLButtonElement>(root, 'Start without video').click();
    await flush();

    expect(controller.calls).toContain('video:false');
    expect(root.querySelector('.video-status')?.textContent).toBe('Video: off');
    expect(root.querySelector<HTMLElement>('.video-indicator')?.dataset.active).toBe('false');
    handle.destroy();
  });

  it('announces controller failures without losing the toolbar', async () => {
    const controller = controllerFixture();
    controller.startSession = () => Promise.reject(new Error('Permission was denied'));
    const handle = mountTestWitnessToolbar(controller, 'top-right');
    const root = handle.element.shadowRoot!;

    byLabel<HTMLButtonElement>(root, 'Start without video').click();
    await flush();

    const alert = root.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe('Permission was denied');
    expect(handle.element.isConnected).toBe(true);
    handle.destroy();
  });

  it('announces recoverable recording warnings from the session summary', () => {
    const controller = controllerFixture();
    const handle = mountTestWitnessToolbar(controller, 'bottom-left');
    const root = handle.element.shadowRoot!;
    const warned = summary('recording', 'not-set', 'unavailable');
    warned.warnings = [
      {
        code: 'VIDEO_UNAVAILABLE',
        message: 'Tab recording permission was denied; evidence capture continues.',
        timestamp: '2026-09-07T10:00:01.000Z',
      },
    ];

    controller.emit(warned);

    expect(root.querySelector('[role="alert"]')?.textContent).toContain('permission was denied');
    expect(root.querySelector('.video-status')?.textContent).toBe('Video: unavailable');
    handle.destroy();
  });

  it('keeps an unexpected video stop visible while the evidence session continues', () => {
    const controller = controllerFixture();
    const handle = mountTestWitnessToolbar(controller, 'bottom-left');
    const root = handle.element.shadowRoot!;
    const ended = summary('recording', 'not-set', 'captured');
    ended.evidence.hasVideo = true;
    ended.warnings = [
      {
        code: 'VIDEO_ENDED',
        message: 'Browser-tab sharing ended; buffered video was saved.',
        timestamp: '2026-09-07T10:00:05.000Z',
      },
    ];

    controller.emit(ended);

    expect(root.querySelector('.video-status')?.textContent).toBe('Video: stopped · saved');
    expect(root.querySelector<HTMLElement>('.video-indicator')?.dataset.active).toBe('false');
    expect(byLabel<HTMLInputElement>(root, 'Capture video during this session').checked).toBe(
      false,
    );
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('sharing ended');
    handle.destroy();
  });

  it('supports touch pointer dragging and constrains the toolbar within the viewport', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(800);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(600);
    const controller = controllerFixture();
    const handle = mountTestWitnessToolbar(controller, 'bottom-right');
    const root = handle.element.shadowRoot!;
    const dragHandle = byLabel<HTMLButtonElement>(root, 'Move TestWitness toolbar');
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    dragHandle.setPointerCapture = setPointerCapture;
    dragHandle.hasPointerCapture = () => true;
    dragHandle.releasePointerCapture = releasePointerCapture;
    mockToolbarRect(handle.element, { left: 444, top: 324, width: 340, height: 260 });

    dragHandle.dispatchEvent(
      createPointerEvent('pointerdown', {
        pointerId: 7,
        pointerType: 'touch',
        clientX: 760,
        clientY: 560,
      }),
    );
    window.dispatchEvent(
      createPointerEvent('pointermove', {
        pointerId: 7,
        pointerType: 'touch',
        clientX: 1_200,
        clientY: 1_000,
      }),
    );

    expect(handle.element.style.left).toBe('460px');
    expect(handle.element.style.top).toBe('340px');
    expect(handle.element.style.right).toBe('auto');
    expect(handle.element.style.bottom).toBe('auto');
    expect(handle.element.dataset.moved).toBe('true');
    expect(dragHandle.dataset.dragging).toBe('true');
    expect(setPointerCapture).toHaveBeenCalledWith(7);

    window.dispatchEvent(createPointerEvent('pointerup', { pointerId: 7 }));
    expect(dragHandle.dataset.dragging).toBeUndefined();
    expect(releasePointerCapture).toHaveBeenCalledWith(7);
    expect(root.querySelector('[aria-live="polite"].sr-only')?.textContent).toContain(
      '460 pixels from the left',
    );

    window.dispatchEvent(
      createPointerEvent('pointermove', { pointerId: 7, clientX: 0, clientY: 0 }),
    );
    expect(handle.element.style.left).toBe('460px');
    handle.destroy();
  });

  it('moves with the keyboard and resets to the configured corner', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(800);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(600);
    const controller = controllerFixture();
    const handle = mountTestWitnessToolbar(controller, 'top-left');
    const root = handle.element.shadowRoot!;
    const dragHandle = byLabel<HTMLButtonElement>(root, 'Move TestWitness toolbar');
    mockToolbarRect(handle.element, { left: 16, top: 16, width: 340, height: 260 });

    dragHandle.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
    );
    expect(handle.element.style.left).toBe('26px');
    expect(handle.element.style.top).toBe('16px');

    dragHandle.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(handle.element.style.left).toBe('26px');
    expect(handle.element.style.top).toBe('56px');

    dragHandle.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }),
    );
    expect(handle.element.style.left).toBe('');
    expect(handle.element.style.top).toBe('');
    expect(handle.element.style.right).toBe('');
    expect(handle.element.style.bottom).toBe('');
    expect(handle.element.dataset.moved).toBeUndefined();
    expect(root.querySelector('[aria-live="polite"].sr-only')?.textContent).toBe(
      'Toolbar position reset to top left.',
    );
    handle.destroy();
  });

  it('does not start dragging from session controls', () => {
    const controller = controllerFixture();
    const handle = mountTestWitnessToolbar(controller, 'top-right');
    const root = handle.element.shadowRoot!;
    mockToolbarRect(handle.element, { left: 444, top: 16, width: 340, height: 260 });

    byLabel<HTMLButtonElement>(root, 'Capture screenshot').dispatchEvent(
      createPointerEvent('pointerdown', { clientX: 500, clientY: 150 }),
    );
    window.dispatchEvent(createPointerEvent('pointermove', { clientX: 100, clientY: 100 }));

    expect(handle.element.style.left).toBe('');
    expect(handle.element.style.top).toBe('');
    expect(handle.element.dataset.moved).toBeUndefined();
    handle.destroy();
  });

  it('releases pointer capture and global drag listeners when destroyed', () => {
    const controller = controllerFixture();
    const handle = mountTestWitnessToolbar(controller, 'top-left');
    const root = handle.element.shadowRoot!;
    const dragHandle = byLabel<HTMLButtonElement>(root, 'Move TestWitness toolbar');
    const releasePointerCapture = vi.fn();
    dragHandle.setPointerCapture = vi.fn();
    dragHandle.hasPointerCapture = () => true;
    dragHandle.releasePointerCapture = releasePointerCapture;
    mockToolbarRect(handle.element, { left: 16, top: 16, width: 340, height: 260 });

    dragHandle.dispatchEvent(
      createPointerEvent('pointerdown', { pointerId: 9, clientX: 30, clientY: 30 }),
    );
    handle.destroy();
    window.dispatchEvent(
      createPointerEvent('pointermove', {
        pointerId: 9,
        clientX: 300,
        clientY: 300,
      }),
    );

    expect(releasePointerCapture).toHaveBeenCalledWith(9);
    expect(handle.element.style.left).toBe('');
    expect(handle.element.style.top).toBe('');
    expect(handle.element.isConnected).toBe(false);
  });
});
