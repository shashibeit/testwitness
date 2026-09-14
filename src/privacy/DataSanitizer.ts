import {
  DEFAULT_REDACT_HEADERS,
  DEFAULT_SENSITIVE_FIELD_NAMES,
  DEFAULT_SENSITIVE_QUERY_PARAMETERS,
} from '../core/config';
import type { SanitizedValue } from '../types/evidence';

export const REDACTED_VALUE = '[REDACTED]';

const OMITTED_BINARY_VALUE = '[BINARY OMITTED]';
const CIRCULAR_VALUE = '[Circular]';
const MAX_DEPTH_VALUE = '[Maximum depth reached]';
const UNREADABLE_VALUE = '[Unreadable value]';

export interface DataSanitizerOptions {
  sensitiveFieldNames?: readonly string[];
  sensitiveQueryParameters?: readonly string[];
  redactHeaders?: readonly string[];
  maxStringLength?: number;
  maxDepth?: number;
  maxEntries?: number;
}

interface SanitizeContext {
  seen: WeakSet<object>;
  depth: number;
}

function canonicalizeName(value: string): string {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Invalid percent escapes are still canonicalized conservatively below.
  }
  return decoded.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function namesSet(mandatory: readonly string[], configured: readonly string[] = []): Set<string> {
  return new Set([...mandatory, ...configured].map(canonicalizeName).filter(Boolean));
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function safeString(value: unknown): string {
  try {
    return String(value);
  } catch {
    return UNREADABLE_VALUE;
  }
}

function boundedInteger(value: number | undefined, fallback: number, minimum: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(minimum, Math.floor(value))
    : fallback;
}

function isBlob(value: object): value is Blob {
  return typeof Blob !== 'undefined' && value instanceof Blob;
}

function isFile(value: object): value is File {
  return typeof File !== 'undefined' && value instanceof File;
}

function isDomNode(value: object): value is Node {
  return typeof Node !== 'undefined' && value instanceof Node;
}

/** Central, defensive conversion of browser values into privacy-safe evidence data. */
export class DataSanitizer {
  readonly #sensitiveFields: Set<string>;
  readonly #sensitiveQueryParameters: Set<string>;
  readonly #redactedHeaders: Set<string>;
  readonly #maxStringLength: number;
  readonly #maxDepth: number;
  readonly #maxEntries: number;
  readonly #embeddedSecretPattern: RegExp;

  public constructor(options: DataSanitizerOptions = {}) {
    this.#sensitiveFields = namesSet(
      [
        ...DEFAULT_SENSITIVE_FIELD_NAMES,
        ...DEFAULT_SENSITIVE_QUERY_PARAMETERS,
        ...DEFAULT_REDACT_HEADERS,
      ],
      [
        ...(options.sensitiveFieldNames ?? []),
        ...(options.sensitiveQueryParameters ?? []),
        ...(options.redactHeaders ?? []),
      ],
    );
    this.#sensitiveQueryParameters = namesSet(
      DEFAULT_SENSITIVE_QUERY_PARAMETERS,
      options.sensitiveQueryParameters,
    );
    this.#redactedHeaders = namesSet(DEFAULT_REDACT_HEADERS, options.redactHeaders);
    this.#maxStringLength = boundedInteger(options.maxStringLength, 4_000, 32);
    this.#maxDepth = boundedInteger(options.maxDepth, 6, 1);
    this.#maxEntries = boundedInteger(options.maxEntries, 100, 1);

    const embeddedNames = [
      ...DEFAULT_SENSITIVE_FIELD_NAMES,
      ...DEFAULT_SENSITIVE_QUERY_PARAMETERS,
      ...DEFAULT_REDACT_HEADERS,
      ...(options.sensitiveFieldNames ?? []),
      ...(options.sensitiveQueryParameters ?? []),
      ...(options.redactHeaders ?? []),
    ]
      .filter((value, index, values) => values.indexOf(value) === index)
      .sort((left, right) => right.length - left.length)
      .map(escapeRegularExpression)
      .join('|');
    this.#embeddedSecretPattern = new RegExp(
      `(["']?(?:${embeddedNames})["']?\\s*[:=]\\s*)(?:(?:Bearer|Basic)\\s+[^\\s,;&]+|"[^"]*"|'[^']*'|[^\\s,;&]+)`,
      'giu',
    );
  }

  public isSensitiveFieldName(name: string): boolean {
    const canonical = canonicalizeName(name);
    if (this.#sensitiveFields.has(canonical)) return true;

    for (const sensitiveName of this.#sensitiveFields) {
      if (sensitiveName.length >= 4 && canonical.includes(sensitiveName)) return true;
    }
    return false;
  }

  public sanitizeText(value: unknown, maximumLength = this.#maxStringLength): string {
    const limit = boundedInteger(maximumLength, this.#maxStringLength, 1);
    let text = safeString(value);
    text = text.replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/giu, (match) => {
      const scheme = match.slice(0, match.indexOf(' '));
      return `${scheme} ${REDACTED_VALUE}`;
    });
    text = text.replace(
      /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}(?:\.[A-Za-z0-9_-]{5,})?\b/gu,
      REDACTED_VALUE,
    );
    text = text.replace(this.#embeddedSecretPattern, `$1${REDACTED_VALUE}`);
    return text.length <= limit ? text : `${text.slice(0, limit)}…`;
  }

  public sanitizeValue(value: unknown): SanitizedValue {
    return this.sanitizeUnknown(value, { seen: new WeakSet<object>(), depth: 0 });
  }

  public sanitizeBody(value: unknown): SanitizedValue {
    if (typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams) {
      return this.sanitizeParameterEntries(value.entries());
    }

    if (typeof FormData !== 'undefined' && value instanceof FormData) {
      const result: Array<[string, SanitizedValue]> = [];
      for (const [name, entry] of value.entries()) {
        result.push([
          name,
          this.isSensitiveFieldName(name)
            ? REDACTED_VALUE
            : typeof entry === 'string'
              ? this.sanitizeText(entry)
              : OMITTED_BINARY_VALUE,
        ]);
        if (result.length >= this.#maxEntries) break;
      }
      return Object.fromEntries(result);
    }

    return this.sanitizeValue(value);
  }

  public sanitizeUrl(value: string | URL): string {
    const raw = safeString(value);
    try {
      const baseUrl =
        typeof globalThis.location?.href === 'string'
          ? globalThis.location.href
          : 'https://test-witness.invalid/';
      const url = new URL(raw, baseUrl);
      if (url.username) url.username = REDACTED_VALUE;
      if (url.password) url.password = REDACTED_VALUE;
      url.search = this.sanitizeSearchParameters(url.searchParams).toString();
      url.hash = this.sanitizeHash(url.hash);
      url.pathname = url.pathname.replace(
        /;jsessionid=[^/;?#]*/giu,
        `;jsessionid=${encodeURIComponent(REDACTED_VALUE)}`,
      );
      return url.toString();
    } catch {
      return this.sanitizeMalformedUrl(raw);
    }
  }

  public sanitizeHeaders(headers: HeadersInit | string | undefined): Record<string, string> {
    if (headers === undefined) return {};

    const entries: Array<[string, string]> = [];
    try {
      if (typeof headers === 'string') {
        for (const line of headers.split(/\r?\n/u)) {
          const separator = line.indexOf(':');
          if (separator <= 0) continue;
          entries.push([line.slice(0, separator).trim(), line.slice(separator + 1).trim()]);
        }
      } else {
        new Headers(headers).forEach((headerValue, name) => entries.push([name, headerValue]));
      }
    } catch {
      return {};
    }

    const sanitizedEntries = entries.slice(0, this.#maxEntries).map(([name, headerValue]) => {
      const normalizedName = name.trim().toLowerCase();
      const sanitizedValue = this.#redactedHeaders.has(canonicalizeName(normalizedName))
        ? REDACTED_VALUE
        : this.sanitizeText(headerValue);
      return [normalizedName, sanitizedValue] as const;
    });
    return Object.fromEntries(sanitizedEntries);
  }

  private sanitizeUnknown(value: unknown, context: SanitizeContext): SanitizedValue {
    if (value === null) return null;
    if (typeof value === 'string') return this.sanitizeText(value);
    if (typeof value === 'number') return Number.isFinite(value) ? value : safeString(value);
    if (typeof value === 'boolean') return value;
    if (typeof value === 'bigint') return `${value.toString()}n`;
    if (typeof value === 'undefined') return '[undefined]';
    if (typeof value === 'symbol') return this.sanitizeText(value.description ?? '[symbol]');
    if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;

    if (context.seen.has(value)) return CIRCULAR_VALUE;
    if (context.depth >= this.#maxDepth) return MAX_DEPTH_VALUE;
    context.seen.add(value);

    try {
      if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString();
      }
      if (value instanceof URL) return this.sanitizeUrl(value);
      if (value instanceof Error) {
        return {
          name: this.sanitizeText(value.name),
          message: this.sanitizeText(value.message),
          ...(value.stack ? { stack: this.sanitizeText(value.stack) } : {}),
        };
      }
      if (isFile(value)) {
        return `${OMITTED_BINARY_VALUE} (${this.sanitizeText(value.type || 'file')}, ${value.size} bytes)`;
      }
      if (isBlob(value)) {
        return `${OMITTED_BINARY_VALUE} (${this.sanitizeText(value.type || 'blob')}, ${value.size} bytes)`;
      }
      if (isDomNode(value)) {
        const nodeName = 'nodeName' in value ? value.nodeName.toLowerCase() : 'node';
        return `[DOM ${nodeName}]`;
      }
      if (typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams) {
        return this.sanitizeParameterEntries(value.entries());
      }
      if (typeof FormData !== 'undefined' && value instanceof FormData) {
        return this.sanitizeBody(value);
      }
      if (Array.isArray(value)) {
        return value
          .slice(0, this.#maxEntries)
          .map((entry) =>
            this.sanitizeUnknown(entry, { seen: context.seen, depth: context.depth + 1 }),
          );
      }

      return this.sanitizeObject(value, context);
    } catch {
      return UNREADABLE_VALUE;
    }
  }

  private sanitizeObject(
    value: object,
    context: SanitizeContext,
  ): { [key: string]: SanitizedValue } | string {
    let descriptors: Record<PropertyKey, PropertyDescriptor>;
    try {
      descriptors = Object.getOwnPropertyDescriptors(value);
    } catch {
      return UNREADABLE_VALUE;
    }

    const entries: Array<[string, SanitizedValue]> = [];
    for (const [key, descriptor] of Object.entries(descriptors).slice(0, this.#maxEntries)) {
      if (this.isSensitiveFieldName(key)) {
        entries.push([key, REDACTED_VALUE]);
        continue;
      }

      let propertyValue: unknown;
      try {
        propertyValue =
          'value' in descriptor ? descriptor.value : descriptor.get ? '[Getter]' : '[Setter]';
      } catch {
        propertyValue = UNREADABLE_VALUE;
      }
      entries.push([
        this.sanitizeText(key, 200),
        this.sanitizeUnknown(propertyValue, {
          seen: context.seen,
          depth: context.depth + 1,
        }),
      ]);
    }
    return Object.fromEntries(entries);
  }

  private sanitizeSearchParameters(parameters: URLSearchParams): URLSearchParams {
    const sanitized = new URLSearchParams();
    for (const [name, parameterValue] of parameters.entries()) {
      sanitized.append(
        name,
        this.#sensitiveQueryParameters.has(canonicalizeName(name))
          ? REDACTED_VALUE
          : this.sanitizeText(parameterValue),
      );
    }
    return sanitized;
  }

  private sanitizeParameterEntries(entries: IterableIterator<[string, string]>): {
    [key: string]: SanitizedValue;
  } {
    const result: Array<[string, SanitizedValue]> = [];
    for (const [name, parameterValue] of entries) {
      result.push([
        name,
        this.#sensitiveQueryParameters.has(canonicalizeName(name)) ||
        this.isSensitiveFieldName(name)
          ? REDACTED_VALUE
          : this.sanitizeText(parameterValue),
      ]);
      if (result.length >= this.#maxEntries) break;
    }
    return Object.fromEntries(result);
  }

  private sanitizeHash(hash: string): string {
    if (!hash) return '';
    const fragment = hash.slice(1);
    const queryStart = fragment.indexOf('?');
    if (queryStart >= 0) {
      const route = this.sanitizeText(fragment.slice(0, queryStart));
      const parameters = new URLSearchParams(fragment.slice(queryStart + 1));
      return `#${route}?${this.sanitizeSearchParameters(parameters).toString()}`;
    }
    if (fragment.includes('=')) {
      return `#${this.sanitizeSearchParameters(new URLSearchParams(fragment)).toString()}`;
    }
    return `#${this.sanitizeText(fragment)}`;
  }

  private sanitizeMalformedUrl(raw: string): string {
    let sanitized = this.sanitizeText(raw);
    sanitized = sanitized.replace(
      /([?&#;])([^=&#;]+)=([^&#;]*)/gu,
      (match, separator: string, name: string) =>
        this.#sensitiveQueryParameters.has(canonicalizeName(name))
          ? `${separator}${name}=${encodeURIComponent(REDACTED_VALUE)}`
          : match,
    );
    return sanitized;
  }
}
