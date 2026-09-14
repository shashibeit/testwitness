import toolbarCss from './toolbar.css?inline';

import type { ToolbarPosition } from '../types/config';
import type {
  DownloadEvidenceResult,
  SessionResultStatus,
  SessionStartMetadata,
  SessionStartOptions,
  SessionSummary,
  TestSessionResult,
} from '../types/session';
import type { NoteRecord, ScreenshotRecord } from '../types/evidence';

const ELEMENT_NAME = 'test-witness-toolbar';

/** The small controller surface consumed by the framework-independent toolbar. */
export interface TestWitnessToolbarController {
  startSession(
    metadata?: SessionStartMetadata,
    options?: SessionStartOptions,
  ): Promise<SessionSummary>;
  pauseSession(): SessionSummary;
  resumeSession(): SessionSummary;
  captureScreenshot(label?: string): Promise<ScreenshotRecord>;
  addNote(text: string): NoteRecord;
  setSessionResult(result: SessionResultStatus): SessionSummary;
  stopSession(): Promise<TestSessionResult>;
  downloadEvidence(): Promise<DownloadEvidenceResult>;
  getSessionSummary(): SessionSummary;
  onSummary(listener: (summary: SessionSummary) => void): () => void;
}

export interface TestWitnessToolbarHandle {
  element: HTMLElement;
  destroy(): void;
}

interface ToolbarElement extends HTMLElement {
  configure(controller: TestWitnessToolbarController, position: ToolbarPosition): void;
  dispose(): void;
}

interface ToolbarElements {
  dragHandle: HTMLButtonElement;
  moveStatus: HTMLElement;
  status: HTMLElement;
  duration: HTMLTimeElement;
  videoIndicator: HTMLElement;
  videoStatus: HTMLElement;
  screenshotCount: HTMLElement;
  captureVideo: HTMLInputElement;
  start: HTMLButtonElement;
  pause: HTMLButtonElement;
  screenshot: HTMLButtonElement;
  result: HTMLSelectElement;
  stop: HTMLButtonElement;
  download: HTMLButtonElement;
  note: HTMLInputElement;
  addNote: HTMLButtonElement;
  message: HTMLElement;
}

interface ToolbarDragState {
  pointerId: number;
  handle: HTMLButtonElement;
  startClientX: number;
  startClientY: number;
  startLeft: number;
  startTop: number;
  width: number;
  height: number;
}

const KEYBOARD_MOVE_STEP_PX = 10;
const KEYBOARD_LARGE_MOVE_STEP_PX = 40;

function button(documentValue: Document, label: string, className = ''): HTMLButtonElement {
  const element = documentValue.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.setAttribute('aria-label', label);
  element.className = className;
  return element;
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const values = hours > 0 ? [hours, minutes, seconds] : [minutes, seconds];
  return values.map((value) => String(value).padStart(2, '0')).join(':');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function videoStatusLabel(summary: SessionSummary): string {
  switch (summary.videoStatus) {
    case 'requesting-permission':
      return 'Video: waiting for tab permission';
    case 'recording':
      return 'Video: recording';
    case 'paused':
      return 'Video: paused';
    case 'finalizing':
      return 'Video: saving';
    case 'captured':
      return summary.status === 'stopped' ? 'Video: captured' : 'Video: stopped · saved';
    case 'unavailable':
      return 'Video: unavailable';
    case 'off':
      return summary.status === 'idle' ? 'Video: off by default' : 'Video: off';
  }
}

function defineToolbar(
  registry: CustomElementRegistry,
  windowValue: Window & typeof globalThis,
): void {
  if (registry.get(ELEMENT_NAME)) return;

  class TestWitnessToolbarElement extends windowValue.HTMLElement implements ToolbarElement {
    private controller?: TestWitnessToolbarController;
    private elements?: ToolbarElements;
    private unsubscribe?: () => void;
    private timer?: number;
    private busy = false;
    private latestWarningTimestamp?: string;
    private previousStatus?: SessionSummary['status'];
    private dragState?: ToolbarDragState;
    private positionTracking = false;

    private readonly handlePointerMove = (event: PointerEvent): void => {
      const dragState = this.dragState;
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      if (event.cancelable) event.preventDefault();
      this.applyPosition(
        dragState.startLeft + event.clientX - dragState.startClientX,
        dragState.startTop + event.clientY - dragState.startClientY,
        dragState.width,
        dragState.height,
      );
    };

    private readonly handlePointerEnd = (event: PointerEvent): void => {
      if (event.pointerId !== this.dragState?.pointerId) return;
      this.stopDragging(true);
    };

    private readonly handleViewportResize = (): void => {
      if (this.dataset.moved !== 'true') return;
      const rect = this.getBoundingClientRect();
      this.applyPosition(rect.left, rect.top, rect.width, rect.height);
    };

    public configure(controller: TestWitnessToolbarController, position: ToolbarPosition): void {
      this.controller = controller;
      this.dataset.position = position;
      this.dataset.testWitness = '';
      this.resetPosition(false);
      this.renderShell();
      if (this.elements) this.elements.captureVideo.checked = false;
      this.previousStatus = undefined;
      this.unsubscribe?.();
      this.unsubscribe = controller.onSummary((summary) => this.renderState(summary));
      this.renderState(controller.getSessionSummary());
      this.startClock();
      if (this.isConnected) this.startPositionTracking();
    }

    public connectedCallback(): void {
      if (this.controller) {
        this.renderShell();
        this.startClock();
        this.startPositionTracking();
      }
    }

    public disconnectedCallback(): void {
      this.stopClock();
      this.stopPositionTracking();
    }

    public dispose(): void {
      this.unsubscribe?.();
      this.unsubscribe = undefined;
      this.stopClock();
      this.stopPositionTracking();
      this.remove();
    }

    private renderShell(): void {
      if (this.shadowRoot || !this.controller) return;
      const documentValue = this.ownerDocument;
      const shadow = this.attachShadow({ mode: 'open' });
      const style = documentValue.createElement('style');
      style.textContent = toolbarCss;

      const panel = documentValue.createElement('section');
      panel.className = 'panel';
      panel.setAttribute('aria-label', 'TestWitness controls');

      const header = documentValue.createElement('div');
      header.className = 'header';
      const dragHandle = button(documentValue, 'Move TestWitness toolbar', 'drag-handle');
      dragHandle.setAttribute('aria-describedby', 'test-witness-move-instructions');
      dragHandle.setAttribute(
        'aria-keyshortcuts',
        'ArrowUp ArrowDown ArrowLeft ArrowRight Home Escape',
      );
      const brand = documentValue.createElement('span');
      brand.className = 'brand';
      brand.textContent = 'TestWitness';
      const dragGrip = documentValue.createElement('span');
      dragGrip.className = 'drag-grip';
      dragGrip.setAttribute('aria-hidden', 'true');
      dragGrip.textContent = '⋮⋮';
      dragHandle.replaceChildren(brand, dragGrip);
      const moveInstructions = documentValue.createElement('span');
      moveInstructions.id = 'test-witness-move-instructions';
      moveInstructions.className = 'sr-only';
      moveInstructions.textContent =
        'Drag with a mouse or touch. Use the arrow keys to move, hold Shift for a larger step, or press Home or Escape to reset the toolbar position.';
      const moveStatus = documentValue.createElement('span');
      moveStatus.className = 'sr-only';
      moveStatus.setAttribute('aria-live', 'polite');
      header.append(dragHandle, moveInstructions, moveStatus);

      const statusRow = documentValue.createElement('div');
      statusRow.className = 'status-row';
      const videoIndicator = documentValue.createElement('span');
      videoIndicator.className = 'video-indicator';
      videoIndicator.setAttribute('aria-hidden', 'true');
      const videoStatus = documentValue.createElement('span');
      videoStatus.className = 'video-status';
      videoStatus.setAttribute('aria-live', 'polite');
      const status = documentValue.createElement('span');
      status.className = 'status';
      status.setAttribute('aria-live', 'polite');
      const screenshotCount = documentValue.createElement('span');
      screenshotCount.className = 'screenshot-count';
      screenshotCount.setAttribute('aria-live', 'polite');
      const duration = documentValue.createElement('time');
      duration.className = 'duration';
      duration.setAttribute('aria-label', 'Session duration');
      statusRow.append(status, screenshotCount, duration);

      const videoOption = documentValue.createElement('label');
      videoOption.className = 'video-option';
      const captureVideo = documentValue.createElement('input');
      captureVideo.type = 'checkbox';
      captureVideo.setAttribute('aria-label', 'Capture video during this session');
      const videoOptionText = documentValue.createElement('span');
      videoOptionText.textContent = 'Capture video';
      videoOption.append(captureVideo, videoOptionText, videoIndicator, videoStatus);

      const controls = documentValue.createElement('div');
      controls.className = 'controls';
      const start = button(documentValue, 'Start session', 'primary');
      const pause = button(documentValue, 'Pause session');
      const screenshot = button(documentValue, 'Capture screenshot');
      const resultLabel = documentValue.createElement('label');
      resultLabel.className = 'sr-only';
      resultLabel.textContent = 'Session result';
      const result = documentValue.createElement('select');
      result.setAttribute('aria-label', 'Session result');
      for (const [value, label] of [
        ['not-set', 'Not set'],
        ['passed', 'Passed'],
        ['failed', 'Failed'],
        ['blocked', 'Blocked'],
      ] as const) {
        const option = documentValue.createElement('option');
        option.value = value;
        option.textContent = label;
        result.append(option);
      }
      const stop = button(documentValue, 'Stop session', 'danger');
      const download = button(documentValue, 'Download evidence');
      controls.append(start, pause, screenshot, resultLabel, result, stop, download);

      const noteRow = documentValue.createElement('div');
      noteRow.className = 'note-row';
      const noteLabel = documentValue.createElement('label');
      noteLabel.className = 'sr-only';
      noteLabel.textContent = 'Tester note';
      const note = documentValue.createElement('input');
      note.type = 'text';
      note.placeholder = 'Add a tester note';
      note.setAttribute('aria-label', 'Tester note');
      note.autocomplete = 'off';
      const addNote = button(documentValue, 'Add note');
      noteRow.append(noteLabel, note, addNote);

      const message = documentValue.createElement('p');
      message.className = 'message';
      message.setAttribute('role', 'alert');
      message.setAttribute('aria-live', 'assertive');

      panel.append(header, statusRow, videoOption, controls, noteRow, message);
      shadow.append(style, panel);
      this.elements = {
        dragHandle,
        moveStatus,
        status,
        duration,
        videoIndicator,
        videoStatus,
        screenshotCount,
        captureVideo,
        start,
        pause,
        screenshot,
        result,
        stop,
        download,
        note,
        addNote,
        message,
      };
      this.bindMovement();
      this.bindControls();
    }

    private bindMovement(): void {
      const dragHandle = this.elements?.dragHandle;
      if (!dragHandle) return;
      dragHandle.addEventListener('pointerdown', (event) => this.startDragging(event));
      dragHandle.addEventListener('pointercancel', (event) => {
        if (event.pointerId === this.dragState?.pointerId) this.stopDragging(false);
      });
      dragHandle.addEventListener('lostpointercapture', (event) => {
        if (event.pointerId === this.dragState?.pointerId) this.stopDragging(true);
      });
      dragHandle.addEventListener('keydown', (event) => this.handleMovementKey(event));
    }

    private startDragging(event: PointerEvent): void {
      if (!event.isPrimary || event.button !== 0) return;
      this.stopDragging(false);
      const dragHandle = this.elements?.dragHandle;
      if (!dragHandle) return;
      const rect = this.getBoundingClientRect();
      this.dragState = {
        pointerId: event.pointerId,
        handle: dragHandle,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startLeft: rect.left,
        startTop: rect.top,
        width: rect.width,
        height: rect.height,
      };
      dragHandle.dataset.dragging = 'true';
      dragHandle.focus({ preventScroll: true });
      if (event.cancelable) event.preventDefault();
      try {
        dragHandle.setPointerCapture(event.pointerId);
      } catch {
        // Global pointer listeners still provide dragging when capture is unavailable.
      }
      windowValue.addEventListener('pointermove', this.handlePointerMove, { passive: false });
      windowValue.addEventListener('pointerup', this.handlePointerEnd);
      windowValue.addEventListener('pointercancel', this.handlePointerEnd);
    }

    private stopDragging(announce: boolean): void {
      const dragState = this.dragState;
      if (!dragState) return;
      this.dragState = undefined;
      delete dragState.handle.dataset.dragging;
      windowValue.removeEventListener('pointermove', this.handlePointerMove);
      windowValue.removeEventListener('pointerup', this.handlePointerEnd);
      windowValue.removeEventListener('pointercancel', this.handlePointerEnd);
      try {
        if (dragState.handle.hasPointerCapture(dragState.pointerId)) {
          dragState.handle.releasePointerCapture(dragState.pointerId);
        }
      } catch {
        // The pointer can be released by the browser before toolbar cleanup runs.
      }
      if (announce) this.announcePosition();
    }

    private handleMovementKey(event: KeyboardEvent): void {
      if (event.key === 'Home' || event.key === 'Escape') {
        event.preventDefault();
        this.resetPosition(true);
        return;
      }
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const step = event.shiftKey ? KEYBOARD_LARGE_MOVE_STEP_PX : KEYBOARD_MOVE_STEP_PX;
      const rect = this.getBoundingClientRect();
      const horizontal = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
      const vertical = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
      this.applyPosition(rect.left + horizontal, rect.top + vertical, rect.width, rect.height);
      this.announcePosition();
    }

    private applyPosition(left: number, top: number, width: number, height: number): void {
      const maximumLeft = Math.max(0, windowValue.innerWidth - Math.max(0, width));
      const maximumTop = Math.max(0, windowValue.innerHeight - Math.max(0, height));
      const constrainedLeft = Math.min(maximumLeft, Math.max(0, left));
      const constrainedTop = Math.min(maximumTop, Math.max(0, top));
      this.style.left = `${Math.round(constrainedLeft)}px`;
      this.style.top = `${Math.round(constrainedTop)}px`;
      this.style.right = 'auto';
      this.style.bottom = 'auto';
      this.dataset.moved = 'true';
    }

    private resetPosition(announce: boolean): void {
      this.stopDragging(false);
      this.style.removeProperty('left');
      this.style.removeProperty('top');
      this.style.removeProperty('right');
      this.style.removeProperty('bottom');
      delete this.dataset.moved;
      if (announce && this.elements) {
        const position = (this.dataset.position ?? 'configured').replace('-', ' ');
        this.elements.moveStatus.textContent = `Toolbar position reset to ${position}.`;
      }
    }

    private announcePosition(): void {
      if (!this.elements) return;
      const rect = this.getBoundingClientRect();
      this.elements.moveStatus.textContent = `Toolbar moved to ${Math.round(rect.left)} pixels from the left and ${Math.round(rect.top)} pixels from the top.`;
    }

    private startPositionTracking(): void {
      if (this.positionTracking) return;
      this.positionTracking = true;
      windowValue.addEventListener('resize', this.handleViewportResize);
    }

    private stopPositionTracking(): void {
      this.stopDragging(false);
      if (!this.positionTracking) return;
      this.positionTracking = false;
      windowValue.removeEventListener('resize', this.handleViewportResize);
    }

    private bindControls(): void {
      const elements = this.elements;
      if (!elements) return;
      elements.start.addEventListener('click', () => {
        const captureVideo = elements.captureVideo.checked;
        void this.run(
          async () => {
            const summary = await this.controller?.startSession(undefined, { captureVideo });
            if (!summary || !this.elements) return;
            if (summary.videoStatus === 'recording') {
              this.elements.message.dataset.kind = 'success';
              this.elements.message.textContent = 'Browser-tab video is recording.';
            } else if (!captureVideo) {
              this.elements.message.dataset.kind = 'info';
              this.elements.message.textContent =
                'Session started without video. Screenshots, actions, and logs are active.';
            }
          },
          captureVideo
            ? 'In the sharing dialog, choose Browser Tab, select this application tab, then choose Share.'
            : undefined,
        );
      });
      elements.captureVideo.addEventListener('change', () => this.updateStartButton());
      elements.pause.addEventListener('click', () => {
        void this.run(() => {
          const summary = this.controller?.getSessionSummary();
          return summary?.status === 'paused'
            ? this.controller?.resumeSession()
            : this.controller?.pauseSession();
        });
      });
      elements.screenshot.addEventListener('click', () => {
        void this.run(async () => {
          const record = await this.controller?.captureScreenshot('Manual screenshot');
          if (record && this.elements) {
            this.elements.message.dataset.kind = 'success';
            this.elements.message.textContent = `Screenshot captured: ${record.fileName}`;
          }
        });
      });
      elements.result.addEventListener('change', () => {
        const selectedResult = elements.result.value as SessionResultStatus;
        void this.run(() => this.controller?.setSessionResult(selectedResult));
      });
      elements.stop.addEventListener('click', () => {
        void this.run(async () => {
          const result = await this.controller?.stopSession();
          if (!result || !this.elements) return;
          this.elements.message.dataset.kind = 'success';
          if (result.summary.evidence.hasVideo) {
            this.elements.message.textContent =
              'Session stopped. Video was saved as recording.webm.';
          } else if (result.summary.videoStatus === 'unavailable') {
            this.elements.message.dataset.kind = 'error';
            this.elements.message.textContent =
              'Session stopped. Video was unavailable, but all other evidence was saved.';
          } else {
            this.elements.message.textContent = 'Session stopped without video.';
          }
        });
      });
      elements.download.addEventListener('click', () => {
        void this.run(async () => {
          const result = await this.controller?.downloadEvidence();
          if (!result || !this.elements) return;
          this.elements.message.dataset.kind = 'success';
          this.elements.message.textContent = `Evidence downloaded: ${result.fileName}`;
        });
      });
      const addNote = (): void => {
        const text = elements.note.value.trim();
        if (!text) return;
        void this.run(() => {
          const record = this.controller?.addNote(text);
          elements.note.value = '';
          return record;
        });
      };
      elements.addNote.addEventListener('click', addNote);
      elements.note.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') addNote();
      });
    }

    private async run(action: () => unknown, pendingMessage?: string): Promise<void> {
      if (this.busy || !this.controller) return;
      this.busy = true;
      if (this.elements) {
        this.elements.message.textContent = '';
        delete this.elements.message.dataset.kind;
        if (pendingMessage) {
          this.elements.message.dataset.kind = 'info';
          this.elements.message.textContent = pendingMessage;
        }
      }
      this.renderState(this.controller.getSessionSummary());
      try {
        await action();
      } catch (error) {
        if (this.elements) {
          this.elements.message.dataset.kind = 'error';
          this.elements.message.textContent = errorMessage(error);
        }
      } finally {
        this.busy = false;
        this.renderState(this.controller.getSessionSummary());
      }
    }

    private renderState(summary: SessionSummary): void {
      const elements = this.elements;
      if (!elements) return;
      const active = summary.status === 'recording' || summary.status === 'paused';
      const wasActive = this.previousStatus === 'recording' || this.previousStatus === 'paused';
      if (wasActive && summary.status === 'stopped') elements.captureVideo.checked = false;
      if (active && (summary.videoStatus === 'unavailable' || summary.videoStatus === 'captured')) {
        elements.captureVideo.checked = false;
      }
      this.previousStatus = summary.status;
      elements.status.textContent = summary.status;
      const screenshotTotal = summary.evidence.screenshots;
      elements.screenshotCount.textContent = `${screenshotTotal} ${screenshotTotal === 1 ? 'shot' : 'shots'}`;
      elements.duration.textContent = formatDuration(summary.durationMs);
      elements.duration.dateTime = `PT${Math.max(0, Math.round(summary.durationMs / 1_000))}S`;
      elements.videoIndicator.dataset.active = String(summary.videoStatus === 'recording');
      elements.videoIndicator.dataset.state = summary.videoStatus;
      elements.videoStatus.textContent = videoStatusLabel(summary);
      const latestWarning = summary.warnings[summary.warnings.length - 1];
      const latestVideoWarning = [...summary.warnings]
        .reverse()
        .find((warning) => warning.code === 'VIDEO_UNAVAILABLE' || warning.code === 'VIDEO_ENDED');
      const videoAccessibleLabel = latestVideoWarning
        ? `${videoStatusLabel(summary)}. ${latestVideoWarning.message}`
        : videoStatusLabel(summary);
      elements.videoStatus.setAttribute('aria-label', videoAccessibleLabel);
      elements.videoStatus.title = latestVideoWarning?.message ?? '';
      if (latestWarning && latestWarning.timestamp !== this.latestWarningTimestamp) {
        elements.message.dataset.kind = 'error';
        elements.message.textContent = latestWarning.message;
        this.latestWarningTimestamp = latestWarning.timestamp;
      } else if (!latestWarning) {
        this.latestWarningTimestamp = undefined;
      }
      elements.start.disabled = this.busy || active;
      elements.captureVideo.disabled = this.busy || active;
      elements.pause.disabled = this.busy || !active;
      elements.pause.textContent = summary.status === 'paused' ? 'Resume' : 'Pause';
      elements.pause.setAttribute(
        'aria-label',
        summary.status === 'paused' ? 'Resume session' : 'Pause session',
      );
      elements.screenshot.disabled = this.busy || summary.status !== 'recording';
      elements.result.disabled = this.busy || !active;
      elements.result.value = summary.result;
      elements.stop.disabled = this.busy || !active;
      elements.download.disabled = this.busy || summary.status !== 'stopped';
      elements.note.disabled = this.busy || !active;
      elements.addNote.disabled = this.busy || !active;
      this.updateStartButton();
    }

    private updateStartButton(): void {
      const elements = this.elements;
      if (!elements) return;
      const label = elements.captureVideo.checked ? 'Start with video' : 'Start without video';
      elements.start.textContent = label;
      elements.start.setAttribute('aria-label', label);
    }

    private startClock(): void {
      this.stopClock();
      this.timer = windowValue.setInterval(() => {
        if (!this.controller) return;
        this.renderState(this.controller.getSessionSummary());
      }, 500);
    }

    private stopClock(): void {
      if (this.timer !== undefined) windowValue.clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  registry.define(ELEMENT_NAME, TestWitnessToolbarElement);
}

/** Mounts one self-contained toolbar into the supplied browser document. */
export function mountTestWitnessToolbar(
  controller: TestWitnessToolbarController,
  position: ToolbarPosition,
  documentValue: Document = document,
): TestWitnessToolbarHandle {
  const windowValue = documentValue.defaultView;
  if (!windowValue?.customElements) {
    throw new Error('The TestWitness toolbar requires Custom Elements support.');
  }
  defineToolbar(windowValue.customElements, windowValue);
  const element = documentValue.createElement(ELEMENT_NAME) as ToolbarElement;
  element.configure(controller, position);
  (documentValue.body ?? documentValue.documentElement).append(element);
  return {
    element,
    destroy: () => element.dispose(),
  };
}
