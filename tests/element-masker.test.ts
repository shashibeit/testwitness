import { describe, expect, it } from 'vitest';

import { DataSanitizer } from '../src/privacy/DataSanitizer';
import { ElementMasker } from '../src/privacy/ElementMasker';
import type { ResolvedTestWitnessConfig } from '../src/types/config';

const PRIVACY: ResolvedTestWitnessConfig['privacy'] = {
  maskSelectors: ['.pii'],
  excludeSelectors: ['.excluded'],
  sensitiveFieldNames: ['company-secret'],
  sensitiveQueryParameters: [],
  redactHeaders: [],
};

function visibleRectangle(): DOMRect {
  return {
    bottom: 30,
    height: 20,
    left: 10,
    right: 110,
    top: 10,
    width: 100,
    x: 10,
    y: 10,
    toJSON: () => ({}),
  };
}

describe('ElementMasker', () => {
  it('filters masks, exclusions, toolbar, and every sensitive input before cloning', () => {
    document.body.innerHTML = `
      <div class="pii">Customer 123</div>
      <div class="excluded">Do not show</div>
      <input id="password" type="password" value="Password1!">
      <input id="hidden" type="hidden" value="hidden-secret">
      <input id="file" type="file">
      <input id="token" name="access_token" value="token-secret">
      <input id="custom" name="company-secret" value="company-value">
      <button id="normal">Normal</button>
      <div id="toolbar" data-test-witness style="visibility: visible">Toolbar</div>
    `;
    const pii = document.querySelector<HTMLElement>('.pii')!;
    const password = document.querySelector<HTMLElement>('#password')!;
    pii.getBoundingClientRect = visibleRectangle;
    password.getBoundingClientRect = visibleRectangle;
    const masker = new ElementMasker({
      privacy: PRIVACY,
      sanitizer: new DataSanitizer({ sensitiveFieldNames: PRIVACY.sensitiveFieldNames }),
      document,
      window,
    });

    const session = masker.prepare();

    for (const id of ['password', 'hidden', 'file', 'token', 'custom', 'toolbar']) {
      expect(session.filter(document.querySelector<HTMLElement>(`#${id}`)!)).toBe(false);
    }
    expect(session.filter(document.querySelector<HTMLElement>('.pii')!)).toBe(false);
    expect(session.filter(document.querySelector<HTMLElement>('.excluded')!)).toBe(false);
    expect(session.filter(document.querySelector<HTMLElement>('#normal')!)).toBe(true);
    expect(document.querySelector<HTMLElement>('#toolbar')?.style.visibility).toBe('hidden');
    const overlays = document.querySelectorAll<HTMLElement>('[data-test-witness-mask-overlay]');
    expect(overlays).toHaveLength(2);
    expect([...overlays].every((overlay) => overlay.textContent === '')).toBe(true);

    session.restore();
    session.restore();
    expect(document.querySelectorAll('[data-test-witness-mask-overlay]')).toHaveLength(0);
    expect(document.querySelector<HTMLElement>('#toolbar')?.style.visibility).toBe('visible');
  });

  it('finds sensitive controls inside open shadow roots', () => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    const input = document.createElement('input');
    input.name = 'csrf_token';
    input.value = 'never-clone';
    shadow.append(input);
    document.body.append(host);
    const masker = new ElementMasker({
      privacy: PRIVACY,
      sanitizer: new DataSanitizer(),
      document,
      window,
    });

    const session = masker.prepare();

    expect(session.filter(input)).toBe(false);
    session.restore();
  });

  it('allows non-element child nodes visited by the screenshot renderer', () => {
    const masker = new ElementMasker({
      privacy: PRIVACY,
      sanitizer: new DataSanitizer(),
      document,
      window,
    });
    const session = masker.prepare();

    expect(session.filter(document.createTextNode('Visible page text'))).toBe(true);
    expect(session.filter(document.createComment('React marker'))).toBe(true);

    session.restore();
  });

  it('restores partial changes and returns a typed error for invalid selectors', () => {
    const toolbar = document.createElement('div');
    toolbar.dataset.testWitness = '';
    toolbar.style.visibility = 'collapse';
    document.body.append(toolbar);
    const masker = new ElementMasker({
      privacy: { ...PRIVACY, maskSelectors: [':not('] },
      sanitizer: new DataSanitizer(),
      document,
      window,
    });

    expect(() => masker.prepare()).toThrowError(
      expect.objectContaining({ code: 'SCREENSHOT_FAILED' }),
    );
    expect(toolbar.style.visibility).toBe('collapse');
  });

  it('rejects concurrent masking sessions and permits another after restore', () => {
    const masker = new ElementMasker({
      privacy: PRIVACY,
      sanitizer: new DataSanitizer(),
      document,
      window,
    });
    const first = masker.prepare();

    expect(() => masker.prepare()).toThrowError(
      expect.objectContaining({ code: 'SCREENSHOT_FAILED' }),
    );
    first.restore();
    const second = masker.prepare();
    second.restore();
  });
});
