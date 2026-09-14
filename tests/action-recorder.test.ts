import { afterEach, describe, expect, it, vi } from 'vitest';

import { ActionRecorder, type ActionDataSanitizer } from '../src/capture/ActionRecorder';
import type { ResolvedTestWitnessConfig } from '../src/types/config';
import type { ActionRecord } from '../src/types/evidence';

const ACTION_CONFIG: ResolvedTestWitnessConfig['actions'] = {
  enabled: true,
  captureClicks: true,
  captureFormSubmissions: true,
  captureInputChanges: true,
  captureNavigation: true,
  captureTextInputValues: false,
};

const sanitizer: ActionDataSanitizer = {
  sanitizeText: (value) => value.replace(/secret/gi, '[REDACTED]'),
  sanitizeUrl: (value) => value.replace(/([?&]token=)[^&]+/i, '$1[REDACTED]'),
  isSensitiveFieldName: (name) => /password|token|secret/i.test(name),
};

type HistoryMethod = History['pushState'];

function readHistoryMethod(name: 'pushState' | 'replaceState'): HistoryMethod {
  return Reflect.get(window.history, name) as HistoryMethod;
}

function writeHistoryMethod(name: 'pushState' | 'replaceState', method: HistoryMethod): void {
  Reflect.set(window.history, name, method);
}

const originalPushState = readHistoryMethod('pushState');
const originalReplaceState = readHistoryMethod('replaceState');

afterEach(() => {
  writeHistoryMethod('pushState', originalPushState);
  writeHistoryMethod('replaceState', originalReplaceState);
  originalReplaceState.call(window.history, null, '', '/');
});

function createRecorder(
  records: ActionRecord[],
  config: Partial<ResolvedTestWitnessConfig['actions']> = {},
): ActionRecorder {
  return new ActionRecorder({
    config: { ...ACTION_CONFIG, ...config },
    sanitizer,
    onRecord: (record) => records.push(record),
    document,
    window,
    now: () => new Date('2026-09-07T16:30:00.000Z'),
  });
}

describe('ActionRecorder', () => {
  it('records a click with sanitized data and identifier priority', () => {
    const records: ActionRecord[] = [];
    const recorder = createRecorder(records);
    const button = document.createElement('button');
    button.dataset.testid = 'save-secret';
    button.id = 'lower-priority-id';
    button.name = 'lower-priority-name';
    button.setAttribute('aria-label', 'Lower priority label');
    button.textContent = 'Save secret payment';
    document.body.append(button);
    window.history.replaceState(null, '', '/pay?token=private');

    recorder.start();
    button.click();
    recorder.stop();

    expect(records).toEqual([
      {
        sequence: 1,
        timestamp: '2026-09-07T16:30:00.000Z',
        type: 'click',
        elementTag: 'button',
        elementIdentifier: '[data-testid="save-[REDACTED]"]',
        elementText: 'Save [REDACTED] payment',
        url: 'http://localhost:3000/pay?token=[REDACTED]',
      },
    ]);
    expect(recorder.currentSequence).toBe(1);
  });

  it('uses id, name, aria-label, then a short CSS path as identifier fallbacks', () => {
    const records: ActionRecord[] = [];
    const recorder = createRecorder(records, { captureNavigation: false });
    document.body.innerHTML = `
      <button id="by-id">ID</button>
      <button name="by-name">Name</button>
      <button aria-label="By aria">Aria</button>
      <section><button>First</button><button>Second</button></section>
    `;
    const buttons = Array.from(document.querySelectorAll('button'));

    recorder.start();
    buttons.forEach((button) => button.click());
    recorder.stop();

    expect(records.map((record) => record.elementIdentifier)).toEqual([
      '#by-id',
      '[name="by-name"]',
      '[aria-label="By aria"]',
      'html > body > section > button:nth-of-type(1)',
      'html > body > section > button:nth-of-type(2)',
    ]);
  });

  it('never captures password, hidden, file, or sensitive-field values', () => {
    const records: ActionRecord[] = [];
    const recorder = createRecorder(records, {
      captureNavigation: false,
      captureClicks: false,
      captureFormSubmissions: false,
      captureTextInputValues: true,
    });
    const controls = [
      Object.assign(document.createElement('input'), { type: 'password', value: 'Password1!' }),
      Object.assign(document.createElement('input'), { type: 'hidden', value: 'hidden-value' }),
      Object.assign(document.createElement('input'), { type: 'file' }),
      Object.assign(document.createElement('input'), {
        type: 'text',
        name: 'access-token',
        value: 'secret-token-value',
      }),
    ];
    document.body.append(...controls);

    recorder.start();
    controls.forEach((control) => control.dispatchEvent(new Event('change', { bubbles: true })));
    recorder.stop();

    expect(records).toHaveLength(4);
    expect(records.every((record) => record.value === undefined)).toBe(true);
    expect(JSON.stringify(records)).not.toContain('Password1');
    expect(JSON.stringify(records)).not.toContain('hidden-value');
    expect(JSON.stringify(records)).not.toContain('token-value');
  });

  it('omits normal text by default and captures sanitized text only when opted in', () => {
    const input = Object.assign(document.createElement('input'), {
      type: 'text',
      name: 'summary',
      value: 'contains secret details',
    });
    const checkbox = Object.assign(document.createElement('input'), {
      type: 'checkbox',
      checked: true,
    });
    document.body.append(input, checkbox);

    const defaultRecords: ActionRecord[] = [];
    const defaultRecorder = createRecorder(defaultRecords, { captureNavigation: false });
    defaultRecorder.start();
    input.dispatchEvent(new Event('change', { bubbles: true }));
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    defaultRecorder.stop();

    expect(defaultRecords.map((record) => record.value)).toEqual([undefined, 'checked']);

    const optedInRecords: ActionRecord[] = [];
    const optedInRecorder = createRecorder(optedInRecords, {
      captureNavigation: false,
      captureTextInputValues: true,
    });
    optedInRecorder.start();
    input.dispatchEvent(new Event('change', { bubbles: true }));
    optedInRecorder.stop();

    expect(optedInRecords[0]?.value).toBe('contains [REDACTED] details');
  });

  it('records form submission without serializing form text or values', () => {
    const records: ActionRecord[] = [];
    const recorder = createRecorder(records, { captureNavigation: false });
    const form = document.createElement('form');
    form.id = 'checkout';
    form.innerHTML = '<label>Customer secret<input name="customer" value="private"></label>';
    document.body.append(form);

    recorder.start();
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    recorder.stop();

    expect(records).toEqual([
      expect.objectContaining({
        type: 'form-submit',
        elementTag: 'form',
        elementIdentifier: '#checkout',
      }),
    ]);
    expect(records[0]?.elementText).toBeUndefined();
    expect(records[0]?.value).toBeUndefined();
  });

  it('ignores toolbar actions and supports Text node event targets', () => {
    const records: ActionRecord[] = [];
    const recorder = createRecorder(records, { captureNavigation: false });
    const toolbar = document.createElement('div');
    toolbar.dataset.testWitness = '';
    toolbar.innerHTML = '<button>Toolbar action</button>';
    const pageButton = document.createElement('button');
    pageButton.textContent = 'Page action';
    document.body.append(toolbar, pageButton);

    recorder.start();
    toolbar.querySelector('button')?.click();
    pageButton.firstChild?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    recorder.stop();

    expect(records).toHaveLength(1);
    expect(records[0]?.elementText).toBe('Page action');
  });

  it('is idempotent and gates records while paused or stopped', () => {
    const records: ActionRecord[] = [];
    const recorder = createRecorder(records, { captureNavigation: false });
    const button = document.createElement('button');
    document.body.append(button);

    recorder.start();
    recorder.start();
    button.click();
    recorder.pause();
    button.click();
    recorder.resume();
    button.click();
    recorder.stop();
    recorder.stop();
    button.click();

    expect(records.map((record) => record.sequence)).toEqual([1, 2]);
  });

  it('captures History and navigation events after preserving native behavior', () => {
    const records: ActionRecord[] = [];
    const recorder = createRecorder(records, {
      captureClicks: false,
      captureFormSubmissions: false,
      captureInputChanges: false,
    });
    window.history.replaceState(null, '', '/initial');
    const pushBeforeStart = readHistoryMethod('pushState');
    const replaceBeforeStart = readHistoryMethod('replaceState');

    recorder.start();
    window.history.pushState({ route: 1 }, '', '/first');
    window.history.replaceState({ route: 2 }, '', '/second');
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    window.dispatchEvent(new Event('pagehide'));

    expect(window.location.pathname).toBe('/second');
    expect(records.map((record) => record.type)).toEqual([
      'history-push',
      'history-replace',
      'popstate',
      'hashchange',
      'navigation',
    ]);
    expect(records.map((record) => record.sequence)).toEqual([1, 2, 3, 4, 5]);

    recorder.stop();
    expect(readHistoryMethod('pushState')).toBe(pushBeforeStart);
    expect(readHistoryMethod('replaceState')).toBe(replaceBeforeStart);

    window.history.pushState(null, '', '/after-stop');
    expect(records).toHaveLength(5);
  });

  it('does not overwrite a History patch installed later by the host', () => {
    const records: ActionRecord[] = [];
    const recorder = createRecorder(records);
    const nativePush = readHistoryMethod('pushState');
    const hostPatch = vi.fn(function hostPushState(
      this: History,
      data: unknown,
      unused: string,
      url?: string | URL | null,
    ): void {
      nativePush.call(this, data, unused, url);
    });

    recorder.start();
    writeHistoryMethod('pushState', hostPatch);
    recorder.stop();

    expect(readHistoryMethod('pushState')).toBe(hostPatch);
    window.history.pushState(null, '', '/owned-by-host');
    expect(hostPatch).toHaveBeenCalledOnce();
  });

  it('does not install hooks when action recording is disabled', () => {
    const records: ActionRecord[] = [];
    const recorder = createRecorder(records, { enabled: false });
    const pushBeforeStart = readHistoryMethod('pushState');
    const button = document.createElement('button');
    document.body.append(button);

    recorder.start();
    button.click();
    window.dispatchEvent(new Event('pagehide'));

    expect(records).toEqual([]);
    expect(readHistoryMethod('pushState')).toBe(pushBeforeStart);
    recorder.stop();
  });

  it('reports sanitizer/callback errors without changing host action behavior', () => {
    const onError = vi.fn();
    const onRecord = vi.fn(() => {
      throw new Error('store unavailable');
    });
    const recorder = new ActionRecorder({
      config: ACTION_CONFIG,
      sanitizer,
      onRecord,
      onError,
      document,
      window,
    });
    const button = document.createElement('button');
    document.body.append(button);

    recorder.start();
    expect(() => button.click()).not.toThrow();
    expect(() => window.history.pushState(null, '', '/still-navigates')).not.toThrow();
    recorder.stop();

    expect(onRecord).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(window.location.pathname).toBe('/still-navigates');
    expect(recorder.currentSequence).toBe(0);
  });
});
