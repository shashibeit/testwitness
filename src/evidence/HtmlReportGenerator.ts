import type { NetworkRequestOutcome, VideoRecord } from '../types/evidence';
import type { SessionSummary, VideoCaptureStatus } from '../types/session';
import type { EvidenceSnapshot } from './EvidenceStore';

type ReportScreenshot = EvidenceSnapshot['screenshots'][number];
type ReportMetadata = EvidenceSnapshot['metadata'];
type ReportNetworkError = EvidenceSnapshot['networkErrors'][number];

export interface ReportAssetManifest {
  /** ZIP-relative screenshot paths keyed by ScreenshotRecord.id. */
  screenshots: Record<string, string>;
  /** ZIP-relative WebM path. */
  video?: string;
}

interface RequestView {
  id: string;
  timestamp: string;
  transport: 'fetch' | 'xhr';
  method: string;
  url: string;
  status?: number;
  durationMs: number;
  outcome: NetworkRequestOutcome;
  detail?: ReportNetworkError;
  eventId: string;
}

interface EndpointGroup {
  method: string;
  endpoint: string;
  requests: RequestView[];
  successful: number;
  failed: number;
  totalDurationMs: number;
  maxDurationMs: number;
  statuses: Map<string, number>;
  outcomes: Map<string, number>;
}

interface ExplorerItem {
  id: string;
  timestamp: string;
  sourceOrder: number;
  category: string;
  title: string;
  classNames: readonly string[];
  body: string;
}

interface FilterCard {
  id: string;
  label: string;
  count: number;
  description: string;
  emptyMessage: string;
}

const RESULT_LABELS = {
  passed: 'Passed',
  failed: 'Failed',
  blocked: 'Blocked',
  'not-set': 'Not set',
} as const;

const OUTCOME_LABELS: Record<NetworkRequestOutcome, string> = {
  success: 'Succeeded',
  'http-error': 'HTTP error',
  'network-error': 'Network error',
  timeout: 'Timed out',
  abort: 'Aborted',
};

const VIDEO_STATUS_LABELS: Record<VideoCaptureStatus, string> = {
  off: 'Off',
  'requesting-permission': 'Requesting permission',
  recording: 'Recording',
  paused: 'Paused',
  finalizing: 'Finalizing',
  captured: 'Captured',
  unavailable: 'Unavailable',
};

const REPORT_STYLES = `
:root{color-scheme:light;--ink:#172b3a;--navy:#102a43;--blue:#1769aa;--blue-soft:#eaf3fb;--line:#d3dfe9;--muted:#52667a;--surface:#f5f8fb;--white:#fff;--good:#176b3a;--good-soft:#e2f4e8;--bad:#a51d2d;--bad-soft:#fde7ea;--warn:#805000;--warn-soft:#fff0cf;--shadow:0 8px 24px rgba(16,42,67,.08)}*{box-sizing:border-box}html{background:var(--white)}body{margin:0;color:var(--ink);background:var(--white);font:15px/1.55 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:var(--blue);text-underline-offset:2px}a:hover{text-decoration-thickness:2px}.skip-link{position:fixed;z-index:10;top:8px;left:8px;padding:9px 12px;color:var(--white);background:var(--navy);border-radius:5px;transform:translateY(-150%)}.skip-link:focus{transform:none}.report-header{padding:30px max(24px,calc((100vw - 1380px)/2));color:var(--white);background:linear-gradient(120deg,var(--navy),#174f78)}.header-layout{display:flex;align-items:flex-end;justify-content:space-between;gap:24px}.eyebrow{margin:0 0 4px;color:#cde0f0;font-size:12px;font-weight:700;letter-spacing:.09em;text-transform:uppercase}.report-header h1{margin:0;font-size:clamp(25px,4vw,36px);line-height:1.2}.report-header .subject{margin:8px 0 0;color:#e4eef6;font-size:16px}.result{display:inline-flex;align-items:center;white-space:nowrap;padding:7px 13px;border:1px solid rgba(255,255,255,.35);border-radius:999px;background:#e7edf3;color:var(--navy);font-weight:800}.result.passed{background:var(--good-soft);color:var(--good)}.result.failed{background:var(--bad-soft);color:var(--bad)}.result.blocked{background:var(--warn-soft);color:var(--warn)}main{max-width:1440px;margin:auto;padding:28px 32px 54px}section{margin:0 0 34px;scroll-margin-top:16px}h2{margin:0 0 14px;padding-bottom:7px;color:var(--navy);font-size:22px;border-bottom:2px solid var(--line)}h3{margin:20px 0 10px;color:var(--navy);font-size:17px}.lede{max-width:900px;margin:-4px 0 18px;color:var(--muted)}.summary-cards,.health-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:11px}.summary-card,.health-card{min-width:0;padding:15px;border:1px solid var(--line);border-radius:9px;background:var(--surface)}.summary-card span,.health-card span{display:block;color:var(--muted);font-size:13px}.summary-card strong,.health-card strong{display:block;margin-top:2px;color:var(--navy);font-size:20px;overflow-wrap:anywhere}.summary-card time{font-size:14px}.coverage-note{padding:12px 14px;border-left:4px solid var(--blue);background:var(--blue-soft)}.warning-list{margin:0;padding-left:22px}.warning-list li{margin:7px 0}.filter-shell{min-inline-size:0;margin:0;padding:0;border:0}.filter-shell legend{margin:0 0 7px;padding:0;color:var(--navy);font-size:17px;font-weight:700}.filter-instructions{margin:0 0 12px;color:var(--muted)}.filter-input{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}.filter-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:9px;margin-bottom:13px}.filter-card{display:block;min-width:0;padding:12px;border:1px solid var(--line);border-radius:8px;background:var(--white);cursor:pointer;box-shadow:0 1px 2px rgba(16,42,67,.04)}.filter-card span,.filter-card small{display:block}.filter-card span{color:var(--navy);font-weight:700}.filter-card strong{display:block;margin:1px 0;color:var(--navy);font-size:22px}.filter-card small{color:var(--muted);line-height:1.35}.filter-card:hover{border-color:var(--blue);background:var(--blue-soft)}#filter-all:checked~.filter-cards label[for="filter-all"],#filter-actions:checked~.filter-cards label[for="filter-actions"],#filter-screenshots:checked~.filter-cards label[for="filter-screenshots"],#filter-errors:checked~.filter-cards label[for="filter-errors"],#filter-warnings:checked~.filter-cards label[for="filter-warnings"],#filter-requests:checked~.filter-cards label[for="filter-requests"],#filter-notes:checked~.filter-cards label[for="filter-notes"]{border-color:var(--blue);background:var(--blue-soft);box-shadow:inset 0 0 0 2px var(--blue)}#filter-all:focus-visible~.filter-cards label[for="filter-all"],#filter-actions:focus-visible~.filter-cards label[for="filter-actions"],#filter-screenshots:focus-visible~.filter-cards label[for="filter-screenshots"],#filter-errors:focus-visible~.filter-cards label[for="filter-errors"],#filter-warnings:focus-visible~.filter-cards label[for="filter-warnings"],#filter-requests:focus-visible~.filter-cards label[for="filter-requests"],#filter-notes:focus-visible~.filter-cards label[for="filter-notes"]{outline:3px solid var(--blue);outline-offset:2px}.filter-state{display:none;margin:0 0 10px;color:var(--muted);font-weight:600}#filter-all:checked~.filter-states .state-all,#filter-actions:checked~.filter-states .state-actions,#filter-screenshots:checked~.filter-states .state-screenshots,#filter-errors:checked~.filter-states .state-errors,#filter-warnings:checked~.filter-states .state-warnings,#filter-requests:checked~.filter-states .state-requests,#filter-notes:checked~.filter-states .state-notes{display:block}#filter-actions:checked~.event-list .event:not(.kind-action),#filter-screenshots:checked~.event-list .event:not(.kind-screenshot),#filter-errors:checked~.event-list .event:not(.is-error),#filter-warnings:checked~.event-list .event:not(.is-warning),#filter-requests:checked~.event-list .event:not(.kind-request),#filter-notes:checked~.event-list .event:not(.kind-note){display:none}.filter-empty{display:none;margin:12px 0;color:var(--muted);font-style:italic}#filter-all:checked~.empty-all,#filter-actions:checked~.empty-actions,#filter-screenshots:checked~.empty-screenshots,#filter-errors:checked~.empty-errors,#filter-warnings:checked~.empty-warnings,#filter-requests:checked~.empty-requests,#filter-notes:checked~.empty-notes{display:block}.event-list{display:grid;gap:9px}.event{border:1px solid var(--line);border-left:5px solid var(--blue);border-radius:8px;background:var(--white);box-shadow:0 2px 7px rgba(16,42,67,.04)}.event.is-error{border-left-color:var(--bad)}.event.is-warning{border-left-color:var(--warn)}.event.is-success{border-left-color:var(--good)}.event summary{display:grid;grid-template-columns:minmax(104px,auto) 1fr auto;align-items:center;gap:12px;padding:12px 14px;cursor:pointer}.event summary:hover{background:var(--surface)}.event[open] summary{border-bottom:1px solid var(--line);background:var(--surface)}.event-badge{display:inline-block;width:max-content;padding:3px 8px;border-radius:999px;background:var(--blue-soft);color:var(--navy);font-size:12px;font-weight:800}.is-error .event-badge{background:var(--bad-soft);color:var(--bad)}.is-warning .event-badge{background:var(--warn-soft);color:var(--warn)}.is-success .event-badge{background:var(--good-soft);color:var(--good)}.event-title{min-width:0;overflow-wrap:anywhere}.event-time{color:var(--muted);font-size:12px;text-align:right}.event-body{padding:14px}.record-details,.metadata-list{display:grid;grid-template-columns:minmax(145px,220px) 1fr;margin:0;border:1px solid var(--line);border-radius:8px;overflow:hidden}.record-details dt,.record-details dd,.metadata-list dt,.metadata-list dd{margin:0;padding:8px 11px;border-bottom:1px solid var(--line)}.record-details dt,.metadata-list dt{font-weight:700;background:var(--surface)}.record-details dd,.metadata-list dd{min-width:0;overflow-wrap:anywhere}.record-details dt:last-of-type,.record-details dd:last-of-type,.metadata-list dt:last-of-type,.metadata-list dd:last-of-type{border-bottom:0}code,pre{font:12px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace}code{overflow-wrap:anywhere}pre{max-height:320px;margin:0;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}.table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:8px}table{width:100%;border-collapse:collapse}th,td{padding:8px 10px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line);overflow-wrap:anywhere}th{background:var(--surface);color:var(--navy)}tbody tr:last-child td{border-bottom:0}.endpoint-list{display:grid;gap:11px}.endpoint-group{border:1px solid var(--line);border-radius:9px;background:var(--white);box-shadow:var(--shadow)}.endpoint-group>summary{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:14px;cursor:pointer}.endpoint-group[open]>summary{border-bottom:1px solid var(--line);background:var(--surface)}.endpoint-name{display:flex;align-items:center;gap:9px;min-width:0}.method{display:inline-block;padding:3px 7px;border-radius:4px;background:var(--navy);color:var(--white);font:700 11px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace}.endpoint-name code{min-width:0}.endpoint-counts{color:var(--muted);font-size:13px;text-align:right}.endpoint-body{padding:14px}.endpoint-metrics{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 12px}.tag{display:inline-block;padding:4px 8px;border:1px solid var(--line);border-radius:999px;background:var(--surface);font-size:12px}.gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}.gallery figure{margin:0;padding:10px;border:1px solid var(--line);border-radius:9px;background:var(--white);box-shadow:var(--shadow);scroll-margin-top:12px}.gallery img{display:block;width:100%;height:auto;max-height:420px;object-fit:contain;background:var(--surface)}.gallery figcaption{padding-top:9px}.gallery figcaption code{display:block;margin-top:4px}.notes{padding-left:24px}.notes li{margin-bottom:11px}.video{display:block;width:100%;max-height:720px;background:#000;border-radius:8px}.empty{color:var(--muted);font-style:italic}.report-footer{padding:18px 32px;color:var(--muted);text-align:center;border-top:1px solid var(--line);background:var(--surface)}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}@media(max-width:700px){.report-header{padding:24px 18px}.header-layout{display:block}.result{margin-top:16px}main{padding:22px 16px 42px}.summary-cards,.health-cards,.filter-cards{grid-template-columns:1fr 1fr}.event summary{grid-template-columns:1fr;gap:5px}.event-time{text-align:left}.record-details,.metadata-list{grid-template-columns:1fr}.record-details dt,.metadata-list dt{border-bottom:0}.endpoint-group>summary{display:block}.endpoint-counts{margin-top:6px;text-align:left}.endpoint-name{align-items:flex-start;flex-direction:column}.gallery{grid-template-columns:1fr}}@media(max-width:420px){.summary-cards,.health-cards,.filter-cards{grid-template-columns:1fr}}@media print{.skip-link,.filter-instructions,.filter-input,.filter-cards,.filter-states,.filter-empty{display:none!important}.report-header{padding:12px 0;color:#000;background:#fff}.report-header .eyebrow,.report-header .subject{color:#333}main{max-width:none;padding:14px 0}.event-list .event{display:block!important;break-inside:avoid}details:not([open])>:not(summary){display:block!important}.event summary,.endpoint-group>summary{cursor:default}.event-body,.endpoint-body{display:block!important}.table-wrap{overflow:visible}.gallery figure,.endpoint-group,.summary-card,.health-card{break-inside:avoid;box-shadow:none}a{color:inherit;text-decoration:none}.report-footer{background:#fff}}`;

const SUCCESS_FILTER_STYLES = `
#filter-successes:checked~.filter-cards label[for="filter-successes"]{border-color:var(--good);background:var(--good-soft);box-shadow:inset 0 0 0 2px var(--good)}
#filter-successes:focus-visible~.filter-cards label[for="filter-successes"]{outline:3px solid var(--good);outline-offset:2px}
#filter-successes:checked~.filter-states .state-successes{display:block}
#filter-successes:checked~.event-list .event:not(.is-success){display:none}
#filter-successes:checked~.empty-successes{display:block}
`;

/** Escapes text and quoted attribute values for safe static HTML insertion. */
export function escapeHtml(value: string | number | boolean | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  return text.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function optional(value: string | number | undefined): string {
  return value === undefined || value === ''
    ? '<span aria-label="Not provided">—</span>'
    : escapeHtml(value);
}

function time(value?: string): string {
  return value
    ? `<time datetime="${escapeHtml(value)}">${escapeHtml(value)}</time>`
    : '<span aria-label="Not provided">—</span>';
}

function formatDuration(durationMs: number): string {
  const total = Number.isFinite(durationMs) ? Math.max(0, Math.floor(durationMs)) : 0;
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1_000);
  const milliseconds = total % 1_000;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}

function formatLatency(durationMs: number): string {
  const milliseconds = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
  return milliseconds < 1_000
    ? `${Math.round(milliseconds)} ms`
    : `${(milliseconds / 1_000).toFixed(2)} s`;
}

function formatBytes(size: number): string {
  const bytes = Number.isFinite(size) ? Math.max(0, size) : 0;
  if (bytes < 1_024) return `${Math.round(bytes)} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KiB`;
  return `${(bytes / 1_048_576).toFixed(1)} MiB`;
}

function normalizeJson(value: unknown, ancestors = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (ancestors.has(value)) return '[Circular]';
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return value.map((entry) => normalizeJson(entry, ancestors));
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      try {
        normalized[key] = normalizeJson(Reflect.get(value, key), ancestors);
      } catch {
        normalized[key] = '[Unavailable]';
      }
    }
    return normalized;
  } finally {
    ancestors.delete(value);
  }
}

function structured(value: unknown): string {
  try {
    return escapeHtml(JSON.stringify(normalizeJson(value)) ?? '');
  } catch {
    return '[Unable to display captured value]';
  }
}

function safeAssetPath(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) return undefined;
  if (
    /^[\\/#?]/u.test(value) ||
    value.includes('\\') ||
    value.includes('?') ||
    value.includes('#')
  ) {
    return undefined;
  }
  for (const character of value) {
    if (character.charCodeAt(0) < 32) return undefined;
  }
  const segments = value.split('/');
  if (segments.some((segment) => segment.length === 0)) return undefined;
  for (let index = 0; index < segments.length; index += 1) {
    let decoded = segments[index] ?? '';
    try {
      for (let pass = 0; pass < 3; pass += 1) decoded = decodeURIComponent(decoded);
    } catch {
      return undefined;
    }
    if (
      decoded === '.' ||
      decoded === '..' ||
      decoded.includes('/') ||
      decoded.includes('\\') ||
      (index === 0 && decoded.includes(':'))
    ) {
      return undefined;
    }
  }
  return value;
}

function resultKey(summary: SessionSummary): keyof typeof RESULT_LABELS {
  switch (summary.result) {
    case 'passed':
    case 'failed':
    case 'blocked':
    case 'not-set':
      return summary.result;
  }
}

type DefinitionRow = readonly [label: string, safeValue: string];

function definitionList(rows: readonly DefinitionRow[], className = 'record-details'): string {
  return `<dl class="${className}">${rows.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${value}</dd>`).join('')}</dl>`;
}

function metadataRows(metadata: ReportMetadata): DefinitionRow[] {
  const rows: DefinitionRow[] = [
    ['Session ID', escapeHtml(metadata.sessionId)],
    ['Application', escapeHtml(metadata.applicationName)],
    ['Environment', escapeHtml(metadata.environment)],
    ['Release version', optional(metadata.releaseVersion)],
    ['Tester', optional(metadata.testerName)],
    ['Tester ID', optional(metadata.testerEmployeeId)],
    ['Test case ID', optional(metadata.testCaseId)],
    ['Test case name', optional(metadata.testCaseName)],
    ['Requirement ID', optional(metadata.requirementId)],
    ['Started', time(metadata.startedAt)],
    ['Ended', time(metadata.endedAt)],
    ['Duration', escapeHtml(formatDuration(metadata.durationMs))],
    ['Current URL', `<code>${escapeHtml(metadata.currentUrl)}</code>`],
    ['Page title', escapeHtml(metadata.pageTitle)],
    ['Browser', escapeHtml(`${metadata.browser.name} ${metadata.browser.version}`.trim())],
    [
      'Operating system',
      escapeHtml(
        `${metadata.operatingSystem.name} ${metadata.operatingSystem.version ?? ''}`.trim(),
      ),
    ],
    ['Viewport', escapeHtml(`${metadata.viewport.width} × ${metadata.viewport.height}`)],
    ['Screen', escapeHtml(`${metadata.screen.width} × ${metadata.screen.height}`)],
    ['Library version', escapeHtml(metadata.libraryVersion)],
  ];
  for (const key of Object.keys(metadata.custom).sort()) {
    rows.push([`Custom: ${key}`, escapeHtml(metadata.custom[key] ?? 'null')]);
  }
  return rows;
}

function networkDetail(value: unknown): string {
  return value === undefined
    ? '<span aria-label="Not captured">Not captured</span>'
    : `<pre>${structured(value)}</pre>`;
}

function requestIdentity(record: {
  timestamp: string;
  transport: 'fetch' | 'xhr';
  method: string;
  url: string;
  status?: number;
  durationMs: number;
  outcome: NetworkRequestOutcome;
}): string {
  return JSON.stringify([
    record.timestamp,
    record.transport,
    record.method,
    record.url,
    record.status ?? null,
    record.durationMs,
    record.outcome,
  ]);
}

function errorIdentity(record: ReportNetworkError): string {
  return requestIdentity({ ...record, outcome: record.failureType });
}

function addQueueEntry(map: Map<string, number[]>, key: string, index: number): void {
  const queue = map.get(key);
  if (queue) queue.push(index);
  else map.set(key, [index]);
}

function takeUnusedIndex(
  map: Map<string, number[]>,
  key: string,
  used: Set<number>,
): number | undefined {
  const queue = map.get(key);
  while (queue && queue.length > 0) {
    const index = queue.shift();
    if (index !== undefined && !used.has(index)) {
      used.add(index);
      return index;
    }
  }
  return undefined;
}

function normalizeRequests(evidence: EvidenceSnapshot): RequestView[] {
  const errorsById = new Map<string, number[]>();
  const errorsByIdentity = new Map<string, number[]>();
  evidence.networkErrors.forEach((record, index) => {
    addQueueEntry(errorsById, record.id, index);
    addQueueEntry(errorsByIdentity, errorIdentity(record), index);
  });
  const usedErrors = new Set<number>();
  const requests: RequestView[] = evidence.networkRequests.map((record, index) => {
    let errorIndex: number | undefined;
    if (record.outcome !== 'success') {
      errorIndex = takeUnusedIndex(errorsById, record.id, usedErrors);
      errorIndex ??= takeUnusedIndex(errorsByIdentity, requestIdentity(record), usedErrors);
    }
    return {
      ...record,
      detail: errorIndex === undefined ? undefined : evidence.networkErrors[errorIndex],
      eventId: `event-request-${index + 1}`,
    };
  });
  for (let index = 0; index < evidence.networkErrors.length; index += 1) {
    if (usedErrors.has(index)) continue;
    const record = evidence.networkErrors[index];
    if (!record) continue;
    requests.push({
      id: record.id,
      timestamp: record.timestamp,
      transport: record.transport,
      method: record.method,
      url: record.url,
      status: record.status,
      durationMs: record.durationMs,
      outcome: record.failureType,
      detail: record,
      eventId: `event-request-${requests.length + 1}`,
    });
  }
  return requests;
}

function endpointFromUrl(value: string): string {
  const stripped = value.split('#', 1)[0]?.split('?', 1)[0] ?? '';
  try {
    const isAbsolute = /^[a-z][a-z\d+.-]*:/iu.test(value);
    const isProtocolRelative = value.startsWith('//');
    const parsed = new URL(value, 'https://testwitness.invalid');
    const path = parsed.pathname || '/';
    if (isProtocolRelative) return `//${parsed.host}${path}`;
    if (isAbsolute && parsed.origin !== 'null') return `${parsed.origin}${path}`;
    return path;
  } catch {
    return stripped || '(unknown endpoint)';
  }
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function buildEndpointGroups(requests: readonly RequestView[]): EndpointGroup[] {
  const groups = new Map<string, EndpointGroup>();
  for (const request of requests) {
    const method = request.method.trim().toUpperCase() || 'UNKNOWN';
    const endpoint = endpointFromUrl(request.url);
    const key = `${method}\u0000${endpoint}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        method,
        endpoint,
        requests: [],
        successful: 0,
        failed: 0,
        totalDurationMs: 0,
        maxDurationMs: 0,
        statuses: new Map<string, number>(),
        outcomes: new Map<string, number>(),
      };
      groups.set(key, group);
    }
    group.requests.push(request);
    if (request.outcome === 'success') group.successful += 1;
    else group.failed += 1;
    const duration = Number.isFinite(request.durationMs) ? Math.max(0, request.durationMs) : 0;
    group.totalDurationMs += duration;
    group.maxDurationMs = Math.max(group.maxDurationMs, duration);
    increment(group.statuses, request.status === undefined ? 'No status' : String(request.status));
    increment(group.outcomes, OUTCOME_LABELS[request.outcome]);
  }
  return [...groups.values()].sort((left, right) => {
    if (left.failed !== right.failed) return right.failed - left.failed;
    if (left.requests.length !== right.requests.length)
      return right.requests.length - left.requests.length;
    const leftKey = `${left.method} ${left.endpoint}`;
    const rightKey = `${right.method} ${right.endpoint}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}

function renderDistribution(values: ReadonlyMap<string, number>): string {
  return [...values.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([label, count]) => `<span class="tag">${escapeHtml(label)}: ${escapeHtml(count)}</span>`)
    .join('');
}

function table(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
  caption: string,
): string {
  if (rows.length === 0) return '<p class="empty">No evidence captured.</p>';
  return `<div class="table-wrap" role="region" aria-label="${escapeHtml(caption)}" tabindex="0"><table><caption class="sr-only">${escapeHtml(caption)}</caption><thead><tr>${headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function requestRows(request: RequestView): DefinitionRow[] {
  const rows: DefinitionRow[] = [
    ['Outcome', escapeHtml(OUTCOME_LABELS[request.outcome])],
    ['Transport', escapeHtml(request.transport)],
    ['Method', escapeHtml(request.method)],
    ['Endpoint', `<code>${escapeHtml(endpointFromUrl(request.url))}</code>`],
    ['Captured URL', `<code>${escapeHtml(request.url)}</code>`],
    ['HTTP status', optional(request.status)],
    ['Duration', escapeHtml(formatLatency(request.durationMs))],
  ];
  if (request.detail) {
    rows.push(
      ['Request headers', networkDetail(request.detail.requestHeaders)],
      ['Response headers', networkDetail(request.detail.responseHeaders)],
      ['Request body', networkDetail(request.detail.requestBody)],
      ['Response body', networkDetail(request.detail.responseBody)],
    );
  }
  return rows;
}

function actionLabel(type: EvidenceSnapshot['actions'][number]['type']): string {
  switch (type) {
    case 'click':
      return 'Click';
    case 'form-submit':
      return 'Form submitted';
    case 'input-change':
      return 'Input changed';
    case 'navigation':
      return 'Page navigation';
    case 'history-push':
      return 'History navigation';
    case 'history-replace':
      return 'History replaced';
    case 'popstate':
      return 'Back or forward navigation';
    case 'hashchange':
      return 'Hash navigation';
  }
}

function relatedAction(sequence: number, actionAnchors: ReadonlyMap<number, string>): string {
  if (sequence <= 0) return 'Before the first captured action';
  const anchor = actionAnchors.get(sequence);
  const label = `After action ${sequence}`;
  return anchor ? `<a href="#${anchor}">${escapeHtml(label)}</a>` : escapeHtml(label);
}

function buildExplorerItems(
  evidence: EvidenceSnapshot,
  summary: SessionSummary,
  requests: readonly RequestView[],
  actionAnchors: ReadonlyMap<number, string>,
): ExplorerItem[] {
  let sourceOrder = 0;
  const items: ExplorerItem[] = [];
  const add = (item: Omit<ExplorerItem, 'sourceOrder'>): void => {
    sourceOrder += 1;
    items.push({ ...item, sourceOrder });
  };
  evidence.actions.forEach((action, index) => {
    const id = actionAnchors.get(action.sequence) ?? `event-action-${index + 1}`;
    const context = action.elementText ?? action.elementIdentifier ?? action.elementTag;
    const title = context ? `${actionLabel(action.type)} — ${context}` : actionLabel(action.type);
    add({
      id,
      timestamp: action.timestamp,
      category: 'Action',
      title,
      classNames: ['kind-action'],
      body: definitionList([
        ['Sequence', escapeHtml(action.sequence)],
        ['Action type', escapeHtml(action.type)],
        ['Element', optional(action.elementTag)],
        ['Safe identifier', optional(action.elementIdentifier)],
        ['Sanitized text', optional(action.elementText)],
        ['Captured value', optional(action.value)],
        ['URL', `<code>${escapeHtml(action.url)}</code>`],
      ]),
    });
  });
  evidence.notes.forEach((note, index) => {
    add({
      id: `event-note-${index + 1}`,
      timestamp: note.timestamp,
      category: 'Note',
      title: note.text,
      classNames: ['kind-note'],
      body: definitionList([
        ['Related action', relatedAction(note.actionSequence, actionAnchors)],
        ['URL', `<code>${escapeHtml(note.url)}</code>`],
      ]),
    });
  });
  evidence.screenshots.forEach((screenshot, index) => {
    add({
      id: `event-screenshot-${index + 1}`,
      timestamp: screenshot.timestamp,
      category: 'Screenshot',
      title: screenshot.label,
      classNames: ['kind-screenshot'],
      body: definitionList([
        ['Related action', relatedAction(screenshot.actionSequence, actionAnchors)],
        ['URL', `<code>${escapeHtml(screenshot.url)}</code>`],
        ['Visual evidence', `<a href="#screenshot-${index + 1}">View screenshot</a>`],
      ]),
    });
  });
  evidence.consoleLogs.forEach((entry, index) => {
    const isError = entry.level === 'error';
    add({
      id: `event-console-${index + 1}`,
      timestamp: entry.timestamp,
      category: isError ? 'Console error' : 'Console warning',
      title: entry.message,
      classNames: [isError ? 'is-error' : 'is-warning', 'kind-console'],
      body: definitionList([
        ['Level', escapeHtml(entry.level)],
        ['Message', escapeHtml(entry.message)],
        ['Arguments', `<pre>${structured(entry.arguments)}</pre>`],
        ['URL', `<code>${escapeHtml(entry.url)}</code>`],
      ]),
    });
  });
  requests.forEach((request) => {
    const succeeded = request.outcome === 'success';
    const status = request.status === undefined ? '' : ` · ${request.status}`;
    add({
      id: request.eventId,
      timestamp: request.timestamp,
      category: succeeded ? 'Request succeeded' : 'Request failed',
      title: `${request.method.toUpperCase()} ${endpointFromUrl(request.url)}${status}`,
      classNames: ['kind-request', succeeded ? 'is-success' : 'is-error'],
      body: definitionList(requestRows(request)),
    });
  });
  summary.warnings.forEach((warning, index) => {
    add({
      id: `event-capture-warning-${index + 1}`,
      timestamp: warning.timestamp,
      category: 'Capture warning',
      title: warning.message,
      classNames: ['kind-capture-warning', 'is-warning'],
      body: definitionList([
        ['Warning code', escapeHtml(warning.code)],
        ['Message', escapeHtml(warning.message)],
      ]),
    });
  });
  if (evidence.video) {
    add({
      id: 'event-video-started',
      timestamp: evidence.video.startedAt,
      category: 'Video',
      title: 'Screen recording started',
      classNames: ['kind-video'],
      body: definitionList([
        ['MIME type', escapeHtml(evidence.video.mimeType)],
        ['Recording', '<a href="#video-recording">Go to video</a>'],
      ]),
    });
    add({
      id: 'event-video-ended',
      timestamp: evidence.video.endedAt,
      category: 'Video',
      title: `Screen recording stopped — ${evidence.video.stopReason}`,
      classNames: ['kind-video'],
      body: definitionList([
        ['Duration', escapeHtml(formatDuration(evidence.video.durationMs))],
        ['Stop reason', escapeHtml(evidence.video.stopReason)],
        ['Recording', '<a href="#video-recording">Go to video</a>'],
      ]),
    });
  }
  return items.sort((left, right) => {
    if (left.timestamp < right.timestamp) return -1;
    if (left.timestamp > right.timestamp) return 1;
    return left.sourceOrder - right.sourceOrder;
  });
}

function renderExplorerItem(item: ExplorerItem): string {
  return `<details id="${item.id}" class="event ${item.classNames.join(' ')}"><summary><span class="event-badge">${escapeHtml(item.category)}</span><strong class="event-title">${escapeHtml(item.title)}</strong><span class="event-time">${time(item.timestamp)}</span></summary><div class="event-body">${item.body}</div></details>`;
}

function renderFilters(cards: readonly FilterCard[], items: readonly ExplorerItem[]): string {
  const inputs = cards
    .map(
      (card, index) =>
        `<input class="filter-input" type="radio" name="evidence-filter" id="filter-${card.id}"${index === 0 ? ' checked' : ''}>`,
    )
    .join('');
  const labels = cards
    .map(
      (card) =>
        `<label class="filter-card" for="filter-${card.id}"><span>${escapeHtml(card.label)}</span><strong>${escapeHtml(card.count)}</strong><small>${escapeHtml(card.description)}</small></label>`,
    )
    .join('');
  const states = cards
    .map(
      (card) =>
        `<p class="filter-state state-${card.id}">Showing ${escapeHtml(card.label.toLowerCase())}: ${escapeHtml(card.count)} ${card.count === 1 ? 'event' : 'events'}.</p>`,
    )
    .join('');
  const emptyStates = cards
    .filter((card) => card.count === 0)
    .map((card) => `<p class="filter-empty empty-${card.id}">${escapeHtml(card.emptyMessage)}</p>`)
    .join('');
  return `<fieldset class="filter-shell"><legend>Filter the chronological evidence</legend><p class="filter-instructions">Choose a card to show one evidence category. Open any event for its sanitized details.</p>${inputs}<div class="filter-cards">${labels}</div><div class="filter-states" aria-live="polite">${states}</div>${emptyStates}<div class="event-list">${items.map(renderExplorerItem).join('')}</div></fieldset>`;
}

function renderEndpoints(groups: readonly EndpointGroup[]): string {
  if (groups.length === 0) return '<p class="empty">No request activity was captured.</p>';
  return `<div class="endpoint-list">${groups
    .map((group, index) => {
      const average = group.totalDurationMs / group.requests.length;
      const rows = group.requests.map((request) => [
        `<a href="#${request.eventId}">${time(request.timestamp)}</a>`,
        escapeHtml(request.transport),
        optional(request.status),
        escapeHtml(OUTCOME_LABELS[request.outcome]),
        escapeHtml(formatLatency(request.durationMs)),
      ]);
      return `<details class="endpoint-group"${group.failed > 0 ? ' open' : ''}><summary><span class="endpoint-name"><span class="method">${escapeHtml(group.method)}</span><code>${escapeHtml(group.endpoint)}</code></span><span class="endpoint-counts">${escapeHtml(group.requests.length)} total · ${escapeHtml(group.successful)} succeeded · ${escapeHtml(group.failed)} failed</span></summary><div class="endpoint-body"><div class="endpoint-metrics" aria-label="Endpoint metrics"><span class="tag">Average: ${escapeHtml(formatLatency(average))}</span><span class="tag">Maximum: ${escapeHtml(formatLatency(group.maxDurationMs))}</span>${renderDistribution(group.statuses)}${renderDistribution(group.outcomes)}</div>${table(['Completed', 'Transport', 'Status', 'Outcome', 'Duration'], rows, `Requests for endpoint ${index + 1}`)}</div></details>`;
    })
    .join('')}</div>`;
}

function screenshotPath(
  assets: ReportAssetManifest,
  screenshot: ReportScreenshot,
): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(assets.screenshots, screenshot.id)) return undefined;
  return safeAssetPath(assets.screenshots[screenshot.id]);
}

function renderScreenshots(
  evidence: EvidenceSnapshot,
  assets: ReportAssetManifest,
  actionAnchors: ReadonlyMap<number, string>,
): string {
  if (evidence.screenshots.length === 0) return '<p class="empty">No screenshots captured.</p>';
  return `<div class="gallery">${evidence.screenshots
    .map((screenshot, index) => {
      const path = screenshotPath(assets, screenshot);
      const media = path
        ? `<a href="${escapeHtml(path)}"><img loading="lazy" src="${escapeHtml(path)}" alt="Screenshot: ${escapeHtml(screenshot.label)} at ${escapeHtml(screenshot.timestamp)}"></a>`
        : '<p class="empty">Screenshot asset unavailable.</p>';
      return `<figure id="screenshot-${index + 1}">${media}<figcaption><strong>${escapeHtml(screenshot.label)}</strong><br>${time(screenshot.timestamp)} · ${relatedAction(screenshot.actionSequence, actionAnchors)}<code>${escapeHtml(screenshot.url)}</code></figcaption></figure>`;
    })
    .join('')}</div>`;
}

function renderNotes(
  evidence: EvidenceSnapshot,
  actionAnchors: ReadonlyMap<number, string>,
): string {
  if (evidence.notes.length === 0) return '<p class="empty">No notes captured.</p>';
  return `<ol class="notes">${evidence.notes
    .map(
      (note) =>
        `<li><strong>${time(note.timestamp)}</strong> ${escapeHtml(note.text)}<br>${relatedAction(note.actionSequence, actionAnchors)} · <code>${escapeHtml(note.url)}</code></li>`,
    )
    .join('')}</ol>`;
}

function renderVideo(video: VideoRecord | undefined, assets: ReportAssetManifest): string {
  const videoPath = safeAssetPath(assets.video);
  if (!video || !videoPath) return '<p class="empty">No video recording available.</p>';
  return `<video class="video" controls preload="metadata" aria-label="Session screen recording"><source src="${escapeHtml(videoPath)}" type="${escapeHtml(video.mimeType)}">Your browser cannot play this recording. <a href="${escapeHtml(videoPath)}">Open the recording file</a>.</video><p>Duration: ${escapeHtml(formatDuration(video.durationMs))} · Stop reason: ${escapeHtml(video.stopReason)} · <a href="${escapeHtml(videoPath)}">Open recording.webm</a></p>`;
}

function renderWarnings(summary: SessionSummary): string {
  if (summary.warnings.length === 0)
    return '<p class="empty">No capture-health warnings recorded.</p>';
  return `<ul class="warning-list">${summary.warnings
    .map(
      (warning) =>
        `<li><strong>${escapeHtml(warning.code)}</strong> — ${escapeHtml(warning.message)} (${time(warning.timestamp)})</li>`,
    )
    .join('')}</ul>`;
}

function buildActionAnchors(evidence: EvidenceSnapshot): Map<number, string> {
  const anchors = new Map<number, string>();
  evidence.actions.forEach((action, index) => {
    if (!anchors.has(action.sequence)) anchors.set(action.sequence, `event-action-${index + 1}`);
  });
  return anchors;
}

/** Generates a deterministic, self-contained static report that references only ZIP-local assets. */
export class HtmlReportGenerator {
  public generate(
    evidence: EvidenceSnapshot,
    summary: SessionSummary,
    assets: ReportAssetManifest,
  ): string {
    const result = resultKey(summary);
    const requests = normalizeRequests(evidence);
    const endpointGroups = buildEndpointGroups(requests);
    const actionAnchors = buildActionAnchors(evidence);
    const explorerItems = buildExplorerItems(evidence, summary, requests, actionAnchors);
    const consoleErrors = evidence.consoleLogs.filter((entry) => entry.level === 'error').length;
    const consoleWarnings = evidence.consoleLogs.length - consoleErrors;
    const successfulRequests = requests.filter((request) => request.outcome === 'success').length;
    const failedRequests = requests.length - successfulRequests;
    const errorCount = consoleErrors + failedRequests;
    const warningCount = consoleWarnings + summary.warnings.length;
    const filters: FilterCard[] = [
      {
        id: 'all',
        label: 'All evidence',
        count: explorerItems.length,
        description: 'Review the full chronology',
        emptyMessage: 'No chronological evidence was captured.',
      },
      {
        id: 'actions',
        label: 'Tester journey',
        count: evidence.actions.length,
        description: 'Show captured actions',
        emptyMessage: 'No tester actions were captured.',
      },
      {
        id: 'screenshots',
        label: 'Screenshots',
        count: evidence.screenshots.length,
        description: 'Show visual checkpoints',
        emptyMessage: 'No screenshots were captured.',
      },
      {
        id: 'successes',
        label: 'Successful requests',
        count: successfulRequests,
        description: 'Show successful API outcomes',
        emptyMessage: 'No successful fetch or XMLHttpRequest outcomes were captured.',
      },
      {
        id: 'errors',
        label: 'Errors',
        count: errorCount,
        description: `${consoleErrors} console · ${failedRequests} request`,
        emptyMessage: 'No captured console errors or failed requests.',
      },
      {
        id: 'warnings',
        label: 'Warnings',
        count: warningCount,
        description: `${consoleWarnings} console · ${summary.warnings.length} capture`,
        emptyMessage: 'No console or capture-health warnings were recorded.',
      },
      {
        id: 'requests',
        label: 'Requests',
        count: requests.length,
        description: `${successfulRequests} succeeded · ${failedRequests} failed`,
        emptyMessage: 'No fetch or XMLHttpRequest activity was captured.',
      },
      {
        id: 'notes',
        label: 'Notes',
        count: evidence.notes.length,
        description: 'Show tester observations',
        emptyMessage: 'No tester notes were captured.',
      },
    ];
    const subject =
      evidence.metadata.testCaseName ??
      evidence.metadata.testCaseId ??
      evidence.metadata.pageTitle ??
      evidence.metadata.applicationName;

    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; font-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"><title>TestWitness — ${escapeHtml(evidence.metadata.applicationName)}</title><style>${REPORT_STYLES}${SUCCESS_FILTER_STYLES}</style></head>
<body><a class="skip-link" href="#report-content">Skip to report content</a><header class="report-header"><div class="header-layout"><div><p class="eyebrow">Offline QA evidence</p><h1>TestWitness Evidence Report</h1><p class="subject">${escapeHtml(subject)} · ${escapeHtml(evidence.metadata.applicationName)} · ${escapeHtml(evidence.metadata.environment)}</p></div><span class="result ${result}">Result: ${RESULT_LABELS[result]}</span></div></header><main id="report-content">
<section aria-labelledby="summary-heading"><h2 id="summary-heading">Session summary</h2><div class="summary-cards"><div class="summary-card"><span>Session status</span><strong>${escapeHtml(summary.status)}</strong></div><div class="summary-card"><span>Duration</span><strong>${escapeHtml(formatDuration(summary.durationMs))}</strong></div><div class="summary-card"><span>Started</span><strong>${time(summary.startedAt)}</strong></div><div class="summary-card"><span>Evidence size</span><strong>${escapeHtml(formatBytes(summary.approximateSizeBytes))}</strong></div><div class="summary-card"><span>Video</span><strong>${escapeHtml(VIDEO_STATUS_LABELS[summary.videoStatus])}</strong></div></div></section>
<section aria-labelledby="health-heading" id="capture-health"><h2 id="health-heading">Capture health</h2><div class="health-cards"><div class="health-card"><span>Capture warnings</span><strong>${escapeHtml(summary.warnings.length)}</strong></div><div class="health-card"><span>Memory warning threshold</span><strong>${summary.memoryWarningReached ? 'Reached' : 'Not reached'}</strong></div><div class="health-card"><span>Console errors</span><strong>${escapeHtml(consoleErrors)}</strong></div><div class="health-card"><span>Console warnings</span><strong>${escapeHtml(consoleWarnings)}</strong></div><div class="health-card"><span>Requests succeeded</span><strong>${escapeHtml(successfulRequests)}</strong></div><div class="health-card"><span>Requests failed</span><strong>${escapeHtml(failedRequests)}</strong></div></div><p class="coverage-note"><strong>Coverage note:</strong> Counts describe evidence captured by this session. A zero does not prove an event did not occur when that capture source was disabled, paused, blocked, or unavailable.</p><h3>Capture-health warnings</h3>${renderWarnings(summary)}</section>
<section aria-labelledby="journey-heading" id="tester-journey"><h2 id="journey-heading">Tester journey</h2><p class="lede">This chronology shows observed actions and evidence. It does not infer expected steps or certify that an individual action passed.</p>${renderFilters(filters, explorerItems)}</section>
<section aria-labelledby="endpoints-heading" id="endpoint-review"><h2 id="endpoints-heading">Request and endpoint review</h2><p class="lede">Requests are grouped by method, origin, and path. Query parameters and fragments are omitted from endpoint summaries; open an event to review its sanitized captured URL and available failure detail.</p>${renderEndpoints(endpointGroups)}</section>
<section aria-labelledby="screenshots-heading" id="screenshots"><h2 id="screenshots-heading">Screenshots</h2>${renderScreenshots(evidence, assets, actionAnchors)}</section>
<section aria-labelledby="notes-heading" id="tester-notes"><h2 id="notes-heading">Tester notes</h2>${renderNotes(evidence, actionAnchors)}</section>
<section aria-labelledby="video-heading" id="video-recording"><h2 id="video-heading">Video recording</h2>${renderVideo(evidence.video, assets)}</section>
<section aria-labelledby="metadata-heading" id="metadata"><h2 id="metadata-heading">Metadata</h2>${definitionList(metadataRows(evidence.metadata), 'metadata-list')}</section>
</main><footer class="report-footer">Generated offline by TestWitness ${escapeHtml(evidence.metadata.libraryVersion)}. All displayed evidence values are escaped.</footer></body></html>`;
  }
}
