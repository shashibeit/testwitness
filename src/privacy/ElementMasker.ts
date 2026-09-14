import type { ResolvedTestWitnessConfig } from '../types/config';
import { TestWitnessError } from '../utils/errors';
import type { DataSanitizer } from './DataSanitizer';

const TOOLBAR_SELECTOR = '[data-test-witness]';
const FORM_CONTROL_SELECTOR = 'input, textarea, select';

export interface MaskingSession {
  /** html-to-image invokes its filter for every child node, including text and comments. */
  filter: (node: Node) => boolean;
  restore: () => void;
}

export interface ElementMaskerOptions {
  privacy: ResolvedTestWitnessConfig['privacy'];
  sanitizer: DataSanitizer;
  document?: Document;
  window?: Window;
}

interface StyleSnapshot {
  element: HTMLElement;
  value: string;
  priority: string;
}

function openQueryRoots(documentValue: Document): ParentNode[] {
  const roots: ParentNode[] = [documentValue];
  for (let index = 0; index < roots.length; index += 1) {
    const root = roots[index];
    if (!root) continue;
    for (const element of root.querySelectorAll('*')) {
      if (element.shadowRoot && !roots.includes(element.shadowRoot)) roots.push(element.shadowRoot);
    }
  }
  return roots;
}

function addMatches(
  roots: readonly ParentNode[],
  selector: string,
  destination: Set<HTMLElement>,
): void {
  for (const root of roots) {
    for (const element of root.querySelectorAll(selector)) {
      if (element instanceof HTMLElement) destination.add(element);
    }
  }
}

function isWithinSet(element: HTMLElement, elements: ReadonlySet<HTMLElement>): boolean {
  let current: Node | null = element;
  while (current) {
    if (current instanceof HTMLElement && elements.has(current)) return true;
    current =
      current.parentNode instanceof ShadowRoot ? current.parentNode.host : current.parentNode;
  }
  return false;
}

function formControlIsSensitive(element: HTMLElement, sanitizer: DataSanitizer): boolean {
  if (element.tagName === 'INPUT') {
    const type = (element.getAttribute('type') ?? 'text').toLowerCase();
    if (type === 'password' || type === 'hidden' || type === 'file') return true;
  }
  const autocomplete = (element.getAttribute('autocomplete') ?? '').toLowerCase();
  if (autocomplete === 'current-password' || autocomplete === 'new-password') return true;

  return [
    element.getAttribute('name') ?? '',
    element.id,
    element.getAttribute('data-testid') ?? '',
    autocomplete,
  ].some((name) => name && sanitizer.isSensitiveFieldName(name));
}

/** Builds a reversible privacy layer used only for the duration of one screenshot. */
export class ElementMasker {
  readonly #privacy: ResolvedTestWitnessConfig['privacy'];
  readonly #sanitizer: DataSanitizer;
  readonly #document?: Document;
  readonly #window?: Window;
  #active = false;

  public constructor(options: ElementMaskerOptions) {
    this.#privacy = options.privacy;
    this.#sanitizer = options.sanitizer;
    this.#document = options.document ?? (typeof document === 'undefined' ? undefined : document);
    this.#window = options.window ?? (typeof window === 'undefined' ? undefined : window);
  }

  public prepare(): MaskingSession {
    if (this.#active) {
      throw new TestWitnessError(
        'SCREENSHOT_FAILED',
        'A screenshot privacy-masking operation is already active.',
      );
    }
    if (!this.#document) {
      throw new TestWitnessError(
        'SCREENSHOT_FAILED',
        'Screenshot masking requires an active browser document.',
      );
    }

    this.#active = true;
    const overlays: HTMLElement[] = [];
    const toolbarStyles: StyleSnapshot[] = [];
    let restored = false;
    const restore = (): void => {
      if (restored) return;
      restored = true;
      for (const overlay of overlays) overlay.remove();
      for (const snapshot of toolbarStyles) {
        if (snapshot.value) {
          snapshot.element.style.setProperty('visibility', snapshot.value, snapshot.priority);
        } else {
          snapshot.element.style.removeProperty('visibility');
        }
      }
      this.#active = false;
    };

    try {
      const roots = openQueryRoots(this.#document);
      const excluded = new Set<HTMLElement>();
      const masked = new Set<HTMLElement>();
      const sensitive = new Set<HTMLElement>();
      const toolbar = new Set<HTMLElement>();

      for (const selector of this.#privacy.excludeSelectors) {
        addMatches(roots, selector, excluded);
      }
      for (const selector of this.#privacy.maskSelectors) {
        addMatches(roots, selector, masked);
      }
      addMatches(roots, TOOLBAR_SELECTOR, toolbar);
      const formControls = new Set<HTMLElement>();
      addMatches(roots, FORM_CONTROL_SELECTOR, formControls);
      for (const control of formControls) {
        if (formControlIsSensitive(control, this.#sanitizer)) sensitive.add(control);
      }

      if (masked.has(this.#document.documentElement) || masked.has(this.#document.body)) {
        throw new Error('The screenshot root itself cannot be used as a mask selector.');
      }

      for (const element of toolbar) {
        toolbarStyles.push({
          element,
          value: element.style.getPropertyValue('visibility'),
          priority: element.style.getPropertyPriority('visibility'),
        });
        element.style.setProperty('visibility', 'hidden', 'important');
      }

      for (const element of new Set([...masked, ...sensitive])) {
        if (isWithinSet(element, excluded)) continue;
        const rectangle = element.getBoundingClientRect();
        if (rectangle.width <= 0 || rectangle.height <= 0) continue;
        const overlay = this.#document.createElement('div');
        overlay.dataset.testWitnessMaskOverlay = '';
        overlay.setAttribute('aria-hidden', 'true');
        Object.assign(overlay.style, {
          background: '#111827',
          borderRadius: '2px',
          height: `${rectangle.height}px`,
          left: `${rectangle.left + (this.#window?.scrollX ?? 0)}px`,
          margin: '0',
          padding: '0',
          pointerEvents: 'none',
          position: 'absolute',
          top: `${rectangle.top + (this.#window?.scrollY ?? 0)}px`,
          width: `${rectangle.width}px`,
          zIndex: '2147483646',
        });
        this.#document.body.append(overlay);
        overlays.push(overlay);
      }

      const filtered = new Set<Element>([...excluded, ...masked, ...sensitive, ...toolbar]);
      return {
        filter: (node) => {
          if (node.nodeType !== 1) return true;
          const element = node as Element;
          return !filtered.has(element) && element.closest(TOOLBAR_SELECTOR) === null;
        },
        restore,
      };
    } catch (error) {
      restore();
      if (error instanceof TestWitnessError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new TestWitnessError(
        'SCREENSHOT_FAILED',
        `Screenshot privacy masking failed: ${message}`,
        error,
      );
    }
  }
}
