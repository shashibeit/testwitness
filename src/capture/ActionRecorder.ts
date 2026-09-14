import type { ResolvedTestWitnessConfig } from '../types/config';
import type { ActionRecord, ActionType } from '../types/evidence';
import { TestWitnessError } from '../utils/errors';
import { systemClock, toIsoTimestamp, type Clock } from '../utils/timestamps';

const TOOLBAR_SELECTOR = '[data-test-witness]';
const MAX_TEXT_LENGTH = 160;
const MAX_CSS_PATH_DEPTH = 5;

/** Structural subset implemented by DataSanitizer and convenient for unit tests. */
export interface ActionDataSanitizer {
  sanitizeText(value: string): string;
  sanitizeUrl(value: string): string;
  isSensitiveFieldName(name: string): boolean;
}

export interface ActionRecorderOptions {
  config: ResolvedTestWitnessConfig['actions'];
  sanitizer: ActionDataSanitizer;
  onRecord: (record: ActionRecord) => void;
  document?: Document;
  window?: Window;
  now?: Clock;
  /** Receives recorder callback/sanitizer errors without disrupting the host application. */
  onError?: (error: unknown) => void;
}

type HistoryMethod = (
  this: History,
  data: unknown,
  unused: string,
  url?: string | URL | null,
) => unknown;

function trimText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_LENGTH);
}

function escapeAttributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escapeIdentifier(value: string): string {
  const cssApi = globalThis.CSS;
  if (typeof cssApi?.escape === 'function') return cssApi.escape(value);

  return value.replace(/[^a-zA-Z0-9_-]/g, (character) => {
    return `\\${character.codePointAt(0)?.toString(16) ?? '0'} `;
  });
}

/** Records privacy-safe DOM and same-document navigation actions. */
export class ActionRecorder {
  private readonly config: ResolvedTestWitnessConfig['actions'];
  private readonly sanitizer: ActionDataSanitizer;
  private readonly onRecord: (record: ActionRecord) => void;
  private readonly documentValue?: Document;
  private readonly windowValue?: Window;
  private readonly now: Clock;
  private readonly onError?: (error: unknown) => void;

  private started = false;
  private paused = false;
  private sequence = 0;
  private originalPushState?: HistoryMethod;
  private originalReplaceState?: HistoryMethod;
  private wrappedPushState?: HistoryMethod;
  private wrappedReplaceState?: HistoryMethod;

  public constructor(options: ActionRecorderOptions) {
    this.config = options.config;
    this.sanitizer = options.sanitizer;
    this.onRecord = options.onRecord;
    this.documentValue =
      options.document ?? (typeof document === 'undefined' ? undefined : document);
    this.windowValue = options.window ?? (typeof window === 'undefined' ? undefined : window);
    this.now = options.now ?? systemClock;
    this.onError = options.onError;
  }

  /** The sequence assigned to the most recently emitted action. */
  public get currentSequence(): number {
    return this.sequence;
  }

  /** Installs listeners once. Starting again while active is intentionally a no-op. */
  public start(): void {
    if (this.started) return;

    this.started = true;
    this.paused = false;
    this.sequence = 0;

    if (!this.config.enabled) return;

    try {
      if (this.config.captureClicks) {
        this.documentValue?.addEventListener('click', this.handleClick, true);
      }
      if (this.config.captureFormSubmissions) {
        this.documentValue?.addEventListener('submit', this.handleSubmit, true);
      }
      if (this.config.captureInputChanges) {
        this.documentValue?.addEventListener('change', this.handleChange, true);
      }
      if (this.config.captureNavigation) {
        this.installNavigationCapture();
      }
    } catch (error) {
      this.stop();
      throw new TestWitnessError(
        'INSTRUMENTATION_FAILED',
        'Browser action recording could not be installed.',
        error,
      );
    }
  }

  public pause(): void {
    if (this.started) this.paused = true;
  }

  public resume(): void {
    if (this.started) this.paused = false;
  }

  /** Removes only listeners and History wrappers still owned by this recorder. */
  public stop(): void {
    if (!this.started) return;

    this.documentValue?.removeEventListener('click', this.handleClick, true);
    this.documentValue?.removeEventListener('submit', this.handleSubmit, true);
    this.documentValue?.removeEventListener('change', this.handleChange, true);
    this.removeNavigationCapture();

    this.started = false;
    this.paused = false;
  }

  private readonly handleClick = (event: Event): void => {
    const element = this.eventElement(event);
    if (!element || this.shouldIgnore(element)) return;
    this.safeRecord(() => this.elementRecord('click', element, true));
  };

  private readonly handleSubmit = (event: Event): void => {
    const element = this.eventElement(event);
    if (!element || this.shouldIgnore(element)) return;
    this.safeRecord(() => this.elementRecord('form-submit', element, false));
  };

  private readonly handleChange = (event: Event): void => {
    const element = this.eventElement(event);
    if (!element || this.shouldIgnore(element) || !this.isFormControl(element)) return;
    this.safeRecord(() => this.changeRecord(element));
  };

  private readonly handlePopState = (): void => {
    this.safeRecord(() => this.navigationRecord('popstate'));
  };

  private readonly handleHashChange = (): void => {
    this.safeRecord(() => this.navigationRecord('hashchange'));
  };

  private readonly handlePageHide = (): void => {
    this.safeRecord(() => this.navigationRecord('navigation'));
  };

  private installNavigationCapture(): void {
    const windowValue = this.windowValue;
    if (!windowValue) return;

    windowValue.addEventListener('popstate', this.handlePopState);
    windowValue.addEventListener('hashchange', this.handleHashChange);
    windowValue.addEventListener('pagehide', this.handlePageHide);

    const historyValue = windowValue.history;
    const pushStateValue: unknown = Reflect.get(historyValue, 'pushState');
    const replaceStateValue: unknown = Reflect.get(historyValue, 'replaceState');
    if (typeof pushStateValue !== 'function' || typeof replaceStateValue !== 'function') return;

    this.originalPushState = pushStateValue as HistoryMethod;
    this.originalReplaceState = replaceStateValue as HistoryMethod;

    const originalPushState = this.originalPushState;
    const originalReplaceState = this.originalReplaceState;
    const recordPush = (): void => this.safeRecord(() => this.navigationRecord('history-push'));
    const recordReplace = (): void =>
      this.safeRecord(() => this.navigationRecord('history-replace'));

    this.wrappedPushState = function wrappedPushState(
      this: History,
      data: unknown,
      unused: string,
      url?: string | URL | null,
    ): unknown {
      const returnValue = originalPushState.call(this, data, unused, url);
      recordPush();
      return returnValue;
    };
    this.wrappedReplaceState = function wrappedReplaceState(
      this: History,
      data: unknown,
      unused: string,
      url?: string | URL | null,
    ): unknown {
      const returnValue = originalReplaceState.call(this, data, unused, url);
      recordReplace();
      return returnValue;
    };

    if (!Reflect.set(historyValue, 'pushState', this.wrappedPushState)) {
      throw new Error('history.pushState is not writable.');
    }
    if (!Reflect.set(historyValue, 'replaceState', this.wrappedReplaceState)) {
      throw new Error('history.replaceState is not writable.');
    }
  }

  private removeNavigationCapture(): void {
    const windowValue = this.windowValue;
    if (!windowValue) return;

    windowValue.removeEventListener('popstate', this.handlePopState);
    windowValue.removeEventListener('hashchange', this.handleHashChange);
    windowValue.removeEventListener('pagehide', this.handlePageHide);

    const historyValue = windowValue.history;
    const currentPushState: unknown = Reflect.get(historyValue, 'pushState');
    const currentReplaceState: unknown = Reflect.get(historyValue, 'replaceState');
    if (this.wrappedPushState && currentPushState === this.wrappedPushState) {
      Reflect.set(historyValue, 'pushState', this.originalPushState);
    }
    if (this.wrappedReplaceState && currentReplaceState === this.wrappedReplaceState) {
      Reflect.set(historyValue, 'replaceState', this.originalReplaceState);
    }

    this.originalPushState = undefined;
    this.originalReplaceState = undefined;
    this.wrappedPushState = undefined;
    this.wrappedReplaceState = undefined;
  }

  private safeRecord(
    createRecord: () => Omit<ActionRecord, 'sequence' | 'timestamp' | 'url'>,
  ): void {
    if (!this.started || this.paused || !this.config.enabled) return;

    try {
      const record: ActionRecord = {
        ...createRecord(),
        sequence: this.sequence + 1,
        timestamp: toIsoTimestamp(this.now()),
        url: this.sanitizer.sanitizeUrl(this.windowValue?.location.href ?? ''),
      };
      this.onRecord(record);
      this.sequence = record.sequence;
    } catch (error) {
      try {
        this.onError?.(error);
      } catch {
        // A diagnostics callback must never alter the host action.
      }
    }
  }

  private elementRecord(
    type: Extract<ActionType, 'click' | 'form-submit'>,
    element: Element,
    includeText: boolean,
  ): Omit<ActionRecord, 'sequence' | 'timestamp' | 'url'> {
    const record: Omit<ActionRecord, 'sequence' | 'timestamp' | 'url'> = {
      type,
      elementTag: element.tagName.toLowerCase(),
      elementIdentifier: this.safeElementIdentifier(element),
    };

    if (includeText) {
      const text = this.safeElementText(element);
      if (text) record.elementText = text;
    }

    return record;
  }

  private changeRecord(
    element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  ): Omit<ActionRecord, 'sequence' | 'timestamp' | 'url'> {
    const record: Omit<ActionRecord, 'sequence' | 'timestamp' | 'url'> = {
      type: 'input-change',
      elementTag: element.tagName.toLowerCase(),
      elementIdentifier: this.safeElementIdentifier(element),
    };

    if (element.tagName === 'INPUT') {
      const input = element as HTMLInputElement;
      const type = input.type.toLowerCase();
      if (type === 'checkbox' || type === 'radio') {
        record.value = input.checked ? 'checked' : 'unchecked';
        return record;
      }
      if (type === 'password' || type === 'hidden' || type === 'file') return record;
    }

    if (this.config.captureTextInputValues && !this.isSensitiveField(element)) {
      record.value = trimText(this.sanitizer.sanitizeText(element.value));
    }

    return record;
  }

  private safeElementIdentifier(element: Element): string {
    const testId = trimText(this.sanitizer.sanitizeText(element.getAttribute('data-testid') ?? ''));
    if (testId) return `[data-testid="${escapeAttributeValue(testId)}"]`;

    const id = trimText(this.sanitizer.sanitizeText(element.id));
    if (id) return `#${escapeIdentifier(id)}`;

    const name = trimText(this.sanitizer.sanitizeText(element.getAttribute('name') ?? ''));
    if (name) return `[name="${escapeAttributeValue(name)}"]`;

    const ariaLabel = trimText(
      this.sanitizer.sanitizeText(element.getAttribute('aria-label') ?? ''),
    );
    if (ariaLabel) return `[aria-label="${escapeAttributeValue(ariaLabel)}"]`;

    return this.shortCssPath(element);
  }

  private shortCssPath(element: Element): string {
    const segments: string[] = [];
    let current: Element | null = element;

    while (current && segments.length < MAX_CSS_PATH_DEPTH) {
      const currentTagName = current.tagName;
      const tagName = currentTagName.toLowerCase();
      const rawId = trimText(this.sanitizer.sanitizeText(current.id));
      if (rawId) {
        segments.unshift(`#${escapeIdentifier(rawId)}`);
        break;
      }

      let segment = tagName;
      const parentElement: Element | null = current.parentElement;
      if (parentElement) {
        const sameTagSiblings = Array.from(parentElement.children).filter(
          (child) => child.tagName === currentTagName,
        );
        if (sameTagSiblings.length > 1) {
          segment += `:nth-of-type(${sameTagSiblings.indexOf(current) + 1})`;
        }
      }

      segments.unshift(segment);
      current = parentElement;
      if (tagName === 'html') break;
    }

    return segments.join(' > ');
  }

  private safeElementText(element: Element): string | undefined {
    if (this.isFormControl(element)) return undefined;
    const sanitized = trimText(this.sanitizer.sanitizeText(element.textContent ?? ''));
    return sanitized || undefined;
  }

  private isSensitiveField(
    element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  ): boolean {
    const candidateNames = [
      element.name,
      element.id,
      element.getAttribute('autocomplete') ?? '',
      element.getAttribute('data-testid') ?? '',
    ];
    return candidateNames.some(
      (candidate) => candidate.length > 0 && this.sanitizer.isSensitiveFieldName(candidate),
    );
  }

  private isFormControl(
    element: Element,
  ): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
    return (
      element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT'
    );
  }

  private eventElement(event: Event): Element | undefined {
    const target = event.target;
    if (!target || !('nodeType' in target)) return undefined;

    const node = target as Node;
    return node.nodeType === 1 ? (node as Element) : (node.parentElement ?? undefined);
  }

  private shouldIgnore(element: Element): boolean {
    return element.closest(TOOLBAR_SELECTOR) !== null;
  }

  private navigationRecord(
    type: Extract<
      ActionType,
      'navigation' | 'history-push' | 'history-replace' | 'popstate' | 'hashchange'
    >,
  ): Omit<ActionRecord, 'sequence' | 'timestamp' | 'url'> {
    return { type };
  }
}
