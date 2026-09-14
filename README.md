# TestWitness

> **Every test has a story. Capture the proof.**

TestWitness is a framework-independent browser library for collecting evidence during manual QA sessions. It records tester actions, selected console output, failed `fetch` and `XMLHttpRequest` calls, optional privacy-minimized successful request metadata, notes, DOM-rendered screenshots, optional browser-tab video, and browser/session metadata. When testing is complete, it creates a client-side ZIP with structured JSON evidence and a self-contained offline HTML report.

MVP 1 runs entirely in the browser. It does not upload evidence and does not require a backend.

> **Privacy warning:** Do not capture production customer data, credentials, regulated data, or other sensitive information without explicit organizational approval. Default redaction reduces risk but cannot prove that arbitrary application content is safe. In particular, screenshot masks do not alter the separately captured browser-tab video.

## Highlights

- Works with React, Angular, AngularJS, Vue, plain JavaScript/HTML, FreeMarker/FTL, JSP, Thymeleaf, and other browser-rendered applications.
- Has no React, Angular, Vue, or UI-framework dependency.
- Uses native DOM APIs, `getDisplayMedia`, and `MediaRecorder`.
- Provides an optional accessible, movable Web Component toolbar isolated with Shadow DOM.
- Preserves and restores patched console, History, `fetch`, and XHR methods.
- Keeps evidence in memory and builds the ZIP locally with JSZip.
- Exports ES module, CommonJS, browser IIFE, and TypeScript declaration builds.
- Applies mandatory header, URL, form-field, console, and body sanitization.

## Supported application types

The core API is plain TypeScript compiled to browser JavaScript. A framework adapter is not required. Use an npm import in applications with a bundler, or load the IIFE bundle with a normal `<script>` tag in server-rendered pages.

The package targets current enterprise-supported Chrome, Microsoft Edge, and Firefox releases. Capabilities are feature-detected at runtime. See [Browser support and limitations](#browser-support-and-limitations) before enabling video or relying on DOM screenshots.

## Community

TestWitness is open source, and contributions are welcome. See
[`CONTRIBUTING.md`](./CONTRIBUTING.md) for setup, privacy rules, engineering expectations, and the
pull-request checklist. Report security or privacy concerns through the private process in
[`SECURITY.md`](./SECURITY.md), not a public issue.

If the project helps your QA or development team, please share it with others and star the GitHub
repository. Issues and focused pull requests are welcome; never attach customer data, credentials,
tokens, or unreviewed evidence archives to a public report.

## Installation

```bash
npm install @testwitness/core
```

The package entry points are:

| Consumer          | File/export                                              |
| ----------------- | -------------------------------------------------------- |
| ES module         | `dist/index.js`                                          |
| CommonJS          | `dist/index.cjs`                                         |
| Browser IIFE      | `dist/testwitness.min.js` or `@testwitness/core/browser` |
| Type declarations | `dist/index.d.ts`                                        |

The IIFE exposes a namespace at `window.TestWitness`. The constructor is therefore `window.TestWitness.TestWitness`.

## Quick start

```ts
import { TestWitness, type TestSessionResult, type TestWitnessConfig } from '@testwitness/core';

const config: TestWitnessConfig = {
  applicationName: 'Customer Portal',
  environment: 'QA',
  releaseVersion: '2026.09.0',
  session: {
    testCaseId: 'TC-1042',
    testCaseName: 'Successful login',
  },
  toolbar: { enabled: true, position: 'bottom-right' },
  video: { enabled: false },
};

const witness = new TestWitness(config);

await witness.initialize();
await witness.startSession({}, { captureVideo: false });
await witness.captureScreenshot('Login completed');
witness.addNote('Validated the successful login scenario');
witness.pauseSession();
witness.resumeSession();
witness.setSessionResult('passed');

const result: TestSessionResult = await witness.stopSession();
console.log(result.summary);
await witness.downloadEvidence();

// Call during application teardown, after the evidence has been downloaded.
await witness.destroy();
```

Pass `{ captureVideo: true }` from a direct user gesture when video is required. Browsers generally
require transient user activation before showing the display-sharing chooser. The supplied toolbar
exposes this as an unchecked **Capture video** option.

For runnable, framework-specific setup steps, see the
[React, Angular, Vue, and vanilla quick-start guide](./examples/QUICK_START.md).

### Enable, pause, and disable at runtime

The constructor configuration is intentionally stable for the lifetime of an instance. Runtime
control happens at three levels:

- `initialize()` enables the SDK integration and optional toolbar without starting capture.
- `startSession()` and `stopSession()` delimit one evidence session. Choose video independently for
  each session with `{ captureVideo: boolean }`.
- `pauseSession()` and `resumeSession()` temporarily suspend and resume the active recorders.
- `destroy()` fully disables the instance, restores patched browser APIs, removes the toolbar, stops
  media tracks, and clears its in-memory evidence.

Use an application feature flag to create or destroy one instance:

```ts
let witness: TestWitness | undefined;

export async function enableTestWitness(): Promise<TestWitness> {
  if (witness) return witness;

  const next = new TestWitness(config);
  try {
    await next.initialize();
    witness = next;
  } catch (error) {
    await next.destroy();
    throw error;
  }
  return next;
}

export async function disableTestWitness(downloadBeforeDisable = false): Promise<void> {
  const current = witness;
  if (!current) return;

  try {
    const status = current.getSessionStatus();
    if (status === 'recording' || status === 'paused') {
      await current.stopSession();
    }
    if (downloadBeforeDisable && current.getSessionStatus() === 'stopped') {
      await current.downloadEvidence();
    }
  } finally {
    await current.destroy();
    if (witness === current) witness = undefined;
  }
}
```

`destroy()` is not the same as pause: it permanently discards evidence still held only in memory.
Stop and download first when that evidence must be retained. Video cannot be switched on halfway
through a session because the browser permission request must start from a user gesture; stop and
start a new session with `captureVideo: true` instead. To apply a different recorder configuration,
disable the old instance and enable a newly constructed one.

## Public API

### `TestWitness`

```ts
class TestWitness {
  constructor(config: TestWitnessConfig);

  initialize(): Promise<void>;
  destroy(): Promise<void>;
  startSession(
    metadata?: SessionStartMetadata,
    options?: SessionStartOptions,
  ): Promise<SessionSummary>;
  pauseSession(): SessionSummary;
  resumeSession(): SessionSummary;
  stopSession(result?: SessionResultStatus): Promise<TestSessionResult>;
  captureScreenshot(label?: string): Promise<ScreenshotRecord>;
  addNote(text: string): NoteRecord;
  setSessionResult(result: SessionResultStatus): SessionSummary;
  downloadEvidence(): Promise<DownloadEvidenceResult>;
  getSessionStatus(): SessionStatus;
  getSessionSummary(): SessionSummary;
  onSummary(listener: (summary: SessionSummary) => void): () => void;
  onWarning(listener: (warning: SessionWarning) => void): () => void;
}
```

`initialize()` prepares the optional toolbar. It does not install browser instrumentation or request recording permission. Call it once before using session methods.

`startSession(metadata?, options?)` starts the recorders, resets the in-memory evidence store, and
collects metadata. `options.captureVideo` explicitly controls display capture for that session; when
omitted, `video.enabled` is the programmatic default. Values supplied in `metadata` override matching
tester/test-case defaults from the constructor configuration.

`pauseSession()` pauses evidence capture and the video recorder. Browser wrappers remain installed so they can resume safely. Notes may still be added while paused; screenshots require `recording` status.

`resumeSession()` resumes configured capture.

`setSessionResult()` accepts `passed`, `failed`, `blocked`, or `not-set` while the session is recording or paused. Alternatively, pass the result to `stopSession(result)`.

`stopSession()` restores instrumentation, waits for pending network observations and video finalization, completes metadata, and returns the final result. Evidence remains in memory for download.

`downloadEvidence()` is valid only after a successful stop. It generates the archive, starts a browser download, and returns `{ fileName, blob, sizeBytes }` so an application can also store or process the ZIP itself.

`destroy()` stops active recording, restores browser APIs and listeners, removes the toolbar, releases media tracks, and clears in-memory evidence. Download evidence before calling it. A destroyed instance may be initialized again.

`onSummary()` and `onWarning()` return unsubscribe functions:

```ts
const unsubscribeSummary = witness.onSummary((summary) => {
  console.log(summary.status, summary.durationMs, summary.evidence);
});

const unsubscribeWarning = witness.onWarning((warning) => {
  console.warn(warning.code, warning.message);
});

// Later:
unsubscribeSummary();
unsubscribeWarning();
```

Recoverable warning codes are `VIDEO_UNAVAILABLE`, `CAPTURE_FAILED`,
`SCREENSHOT_LIMIT_REACHED`, `MEMORY_THRESHOLD_REACHED`, and `RECORDER_ERROR`. For example,
rejecting the browser sharing prompt leaves the evidence session running without video and adds a
`VIDEO_UNAVAILABLE` warning instead of discarding other evidence.

Only one active TestWitness session is allowed on a page, even when separate `TestWitness` instances exist. A stopped instance can start another session; doing so resets its previously held evidence.

### Session metadata

Per-session overrides and custom metadata are accepted as follows:

```ts
await witness.startSession({
  testCaseId: 'TC-1042',
  testCaseName: 'Successful login',
  requirementId: 'REQ-210',
  testerName: 'QA Tester',
  testerEmployeeId: 'E12345',
  custom: {
    suite: 'smoke',
    buildNumber: 418,
    featureFlagEnabled: true,
  },
});
```

Custom values must be strings, finite or non-finite numbers, booleans, or `null` according to the TypeScript contract. Keys recognized as sensitive are stored as `[REDACTED]`; strings are sanitized. Do not put secrets in custom metadata.

Every completed session includes:

- Session ID, application, environment, and release version
- Tester, test-case, and requirement identifiers when supplied
- UTC start/end timestamps and duration
- Sanitized current URL and page title
- Detected browser and operating system
- Viewport and screen dimensions
- TestWitness library version
- Custom metadata and selected session result

The current URL, title, viewport, and screen dimensions are refreshed when the session stops so SPA navigation and resizing are reflected in final metadata.

### Typed errors

Expected failures use `TestWitnessError`, with a stable `code` and optional `cause`:

```ts
import { TestWitnessError } from '@testwitness/core';

try {
  await witness.captureScreenshot('Checkout complete');
} catch (error) {
  if (error instanceof TestWitnessError) {
    console.error(error.code, error.message, error.cause);
  }
}
```

Available codes are:

| Code                      | Meaning                                                              |
| ------------------------- | -------------------------------------------------------------------- |
| `INVALID_CONFIG`          | Configuration, session metadata, or note input is invalid.           |
| `NOT_INITIALIZED`         | A session method was called before `initialize()`.                   |
| `ALREADY_INITIALIZED`     | `initialize()` was called twice without `destroy()`.                 |
| `SESSION_ALREADY_ACTIVE`  | This instance or another instance already owns an active session.    |
| `NO_ACTIVE_SESSION`       | A lifecycle operation needs a recording or paused session.           |
| `INVALID_SESSION_STATE`   | The method is not allowed in the current state or result is invalid. |
| `SCREENSHOT_DISABLED`     | Screenshot capture was explicitly disabled.                          |
| `SCREENSHOT_FAILED`       | The DOM screenshot could not be created safely.                      |
| `VIDEO_UNSUPPORTED`       | Required display-capture/MediaRecorder or WebM support is absent.    |
| `VIDEO_PERMISSION_DENIED` | The tester/browser denied display capture.                           |
| `VIDEO_START_FAILED`      | A display stream or recorder could not start.                        |
| `VIDEO_RECORDING_FAILED`  | An active recorder could not pause or resume.                        |
| `INSTRUMENTATION_FAILED`  | Browser listeners, wrappers, or toolbar setup failed.                |
| `EXPORT_UNAVAILABLE`      | Required Blob-reading, document, or object-URL APIs are unavailable. |
| `EXPORT_FAILED`           | Report/ZIP creation or browser download failed.                      |

Video startup errors are normally converted by `TestWitness.startSession()` into a recoverable `VIDEO_UNAVAILABLE` session warning. This preserves screenshots, actions, console/network evidence, and notes.

## Configuration reference

Only `applicationName` and `environment` are required. Required strings must be non-blank. Optional strings are trimmed; blank optional strings become undefined.

```ts
interface TestWitnessConfig {
  applicationName: string;
  environment: string;
  releaseVersion?: string;
  tester?: { name?: string; employeeId?: string };
  session?: { testCaseId?: string; testCaseName?: string; requirementId?: string };
  screenshot?: {
    enabled?: boolean;
    format?: 'png' | 'jpeg';
    quality?: number;
    captureOnError?: boolean;
    captureOnStart?: boolean;
    captureOnNavigation?: boolean;
    autoCaptureIntervalSeconds?: number;
    maxAutomaticScreenshots?: number;
  };
  video?: {
    enabled?: boolean;
    mimeType?: string;
    maxDurationMinutes?: number;
    includeAudio?: boolean;
  };
  actions?: {
    enabled?: boolean;
    captureClicks?: boolean;
    captureFormSubmissions?: boolean;
    captureInputChanges?: boolean;
    captureNavigation?: boolean;
    captureTextInputValues?: boolean;
  };
  console?: {
    enabled?: boolean;
    levels?: Array<'warn' | 'error'>;
  };
  network?: {
    enabled?: boolean;
    captureSuccessfulRequests?: boolean;
    captureFailedFetch?: boolean;
    captureFailedXhr?: boolean;
    captureRequestBody?: boolean;
    captureResponseBody?: boolean;
  };
  privacy?: {
    maskSelectors?: string[];
    excludeSelectors?: string[];
    sensitiveFieldNames?: string[];
    sensitiveQueryParameters?: string[];
    redactHeaders?: string[];
  };
  toolbar?: {
    enabled?: boolean;
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  };
  export?: {
    fileNamePattern?: string;
    includeHtmlReport?: boolean;
    includeJsonReport?: boolean;
  };
  memory?: {
    warningThresholdMb?: number;
  };
}
```

### Defaults

| Setting                                 | Default                                    | Validation/notes                                                                                              |
| --------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `screenshot.enabled`                    | `true`                                     | Enables both configured automatic checkpoints and manual capture.                                             |
| `screenshot.format`                     | `png`                                      | `png` or `jpeg`. JPEG files use `.jpg`.                                                                       |
| `screenshot.quality`                    | `0.92`                                     | Finite number from `0` through `1`. Primarily affects JPEG encoding.                                          |
| `screenshot.captureOnError`             | `false`                                    | When enabled, schedules a screenshot after console errors or recorded network failures.                       |
| `screenshot.captureOnStart`             | `false`                                    | Opt in to an initial checkpoint shortly after the session starts.                                             |
| `screenshot.captureOnNavigation`        | `false`                                    | Opt in to captures after recorded same-document navigation; requires action navigation capture.               |
| `screenshot.autoCaptureIntervalSeconds` | `0`                                        | Periodic capture interval from `0` through `3600`; `0` disables periodic screenshots.                         |
| `screenshot.maxAutomaticScreenshots`    | `50`                                       | Integer from `1` through `1000`; limits automatic attempts, not manual tester checkpoints.                    |
| `video.enabled`                         | `false`                                    | Explicit opt-in because it prompts the tester and consumes substantial memory.                                |
| `video.mimeType`                        | `video/webm`                               | Must be a syntactically valid `video/*` MIME type; MVP 1 recording requires a supported `video/webm` variant. |
| `video.maxDurationMinutes`              | `30`                                       | Greater than `0`, maximum `120`; paused time is excluded from the recorder's duration budget.                 |
| `video.includeAudio`                    | `false`                                    | Audio availability and the exact shared source remain browser controlled.                                     |
| `actions.enabled`                       | `true`                                     | Master action-capture switch.                                                                                 |
| `actions.captureClicks`                 | `true`                                     | Captures click targets and short sanitized non-form text.                                                     |
| `actions.captureFormSubmissions`        | `true`                                     | Captures form submit targets.                                                                                 |
| `actions.captureInputChanges`           | `true`                                     | Records that a form control changed.                                                                          |
| `actions.captureNavigation`             | `true`                                     | Captures History API calls, `popstate`, `hashchange`, and `pagehide`.                                         |
| `actions.captureTextInputValues`        | `false`                                    | High-risk opt-in; sensitive/password/hidden/file values remain excluded.                                      |
| `console.enabled`                       | `true`                                     | Patches only selected methods during an active session.                                                       |
| `console.levels`                        | `['warn', 'error']`                        | Entries must be `warn` or `error`; duplicates are removed.                                                    |
| `network.enabled`                       | `true`                                     | Master page-level Fetch/XHR instrumentation switch.                                                           |
| `network.captureSuccessfulRequests`     | `false`                                    | Opt in to privacy-minimized successful endpoint metadata for request counts and report analysis.              |
| `network.captureFailedFetch`            | `true`                                     | Records rejected requests and HTTP 400–599 responses.                                                         |
| `network.captureFailedXhr`              | `true`                                     | Records error, timeout, abort, and HTTP 400–599 outcomes.                                                     |
| `network.captureRequestBody`            | `false`                                    | High-risk opt-in; body evidence is bounded and sanitized.                                                     |
| `network.captureResponseBody`           | `false`                                    | High-risk opt-in; body evidence is bounded and sanitized.                                                     |
| `toolbar.enabled`                       | `false`                                    | Mounts a Shadow DOM Web Component when enabled.                                                               |
| `toolbar.position`                      | `bottom-right`                             | One of the four viewport corners.                                                                             |
| `export.fileNamePattern`                | `TestWitness-{testCaseId}-{timestamp}.zip` | Must be non-blank. See [ZIP export](#zip-export).                                                             |
| `export.includeHtmlReport`              | `true`                                     | Adds `report.html`.                                                                                           |
| `export.includeJsonReport`              | `true`                                     | Adds action, console, network, and note JSON files. `metadata.json` is always included.                       |
| `memory.warningThresholdMb`             | `250`                                      | Greater than `0`, maximum `4096`; warns but does not stop capture.                                            |

All boolean options require actual boolean values; truthy strings such as `"true"` are rejected. Selector/name arrays require non-blank strings and are copied defensively. Mandatory sensitive names are always added and cannot be removed by configuration.

### Example privacy-first configuration

```ts
const witness = new TestWitness({
  applicationName: 'Payments Portal',
  environment: 'UAT',
  screenshot: {
    captureOnError: true,
  },
  video: {
    enabled: false,
    maxDurationMinutes: 15,
  },
  actions: {
    captureTextInputValues: false,
  },
  network: {
    captureSuccessfulRequests: false,
    captureRequestBody: false,
    captureResponseBody: false,
  },
  privacy: {
    maskSelectors: ['.customer-account-number', '[data-private]'],
    excludeSelectors: ['.third-party-widget'],
    sensitiveFieldNames: ['customerPin', 'taxId'],
    sensitiveQueryParameters: ['signature', 'oneTimeCode'],
    redactHeaders: ['x-customer-secret'],
  },
  memory: {
    warningThresholdMb: 150,
  },
});
```

## Capture behavior

### Screenshots

`captureScreenshot()` produces a full-document DOM render using `html-to-image`, then encodes it through the browser's canvas API. Native DOM APIs do not provide a portable, permission-free page screenshot facility, so this small dedicated dependency is used for MVP 1. It is bundled into the browser build; consumers do not call it directly.

Immediately around a capture, TestWitness:

1. Finds configured exclude/mask elements, sensitive form controls, and the toolbar, including elements reachable through open Shadow Roots.
2. Omits excluded and sensitive nodes from the cloned DOM.
3. Places opaque dark overlays over configured mask regions.
4. Hides the TestWitness toolbar.
5. Renders and encodes the image while suppressing the library's own renderer requests from network evidence.
6. Removes overlays and restores toolbar styles in a `finally` cleanup.

Screenshots are serialized so simultaneous requests cannot overlap privacy masking. Filenames are numbered and label-derived, for example `001-login-completed.png`. Each record stores its ID, timestamp, sanitized label and URL, the latest action sequence, Blob, and filename.

Automatic screenshots are privacy-sensitive opt-ins. Use `captureOnStart` for an initial checkpoint,
`captureOnNavigation` for recorded same-document route changes, and `autoCaptureIntervalSeconds` for
periodic checkpoints. Console-error and failed-request screenshots remain controlled by
`captureOnError`. Closely timed triggers are coalesced, UI-triggered captures wait briefly for the
page to render, and the automatic-attempt limit prevents repeated renderer failures from creating
unbounded work. The public `captureScreenshot()` method and toolbar button always remain available
for explicit one-click checkpoints while the session is recording. Manual failures are persisted as
`CAPTURE_FAILED` session warnings, while successful toolbar captures show the image filename and
updated screenshot count.

The renderer limits each document dimension to 16,384 CSS pixels, caps the render budget at approximately 32 million pixels, and caps requested device pixel ratio at 2. DOM rendering is not a pixel-perfect browser screenshot. Cross-origin images without usable CORS responses, cross-origin iframes, closed Shadow Roots, tainted canvases, active video, complex SVG/CSS, web fonts, and very large pages may render differently or fail. A failure is reported as `SCREENSHOT_FAILED`; it is not silently replaced with empty evidence.

### Browser-tab video

Video is opt-in. The toolbar checkbox defaults to unchecked. Programmatic integrations can pass
`{ captureVideo: true }` as the second `startSession()` argument; otherwise `video.enabled` supplies
the programmatic default. When selected, TestWitness requests display media immediately from
that user gesture. It uses a browser-tab `displaySurface` hint only when the browser reports support
for that constraint and falls back to the broadly compatible `video: true` constraint otherwise.
Conceptually, the request is:

```ts
navigator.mediaDevices.getDisplayMedia({
  audio: config.video.includeAudio,
  video: browserSupportsDisplaySurface ? { displaySurface: 'browser' } : true,
});
```

The browser always owns the permission prompt and source chooser. The library never attempts to bypass or remember that decision. It asks for a browser tab and rejects a non-tab source when the browser exposes a conflicting `displaySurface` setting. Some browsers treat the requested surface as a hint and retain final control over the choices shown.

The recorder:

- Checks for both `getDisplayMedia` and `MediaRecorder`.
- Negotiates the configured WebM type, then tries VP9, VP8, and generic WebM variants.
- Emits media data at one-second intervals into in-memory chunks.
- Pauses/resumes with the session and excludes paused time from recorded duration.
- Stops automatically at `maxDurationMinutes`.
- Stops when the tester ends browser sharing.
- Stops all stream tracks and removes media listeners after finalization or destruction.
- Waits for the browser's final media chunk before releasing tracks, with a five-second cleanup
  watchdog for browsers that fail to emit the final `stop` event.
- Stores one `recording.webm` Blob with its active duration and stop reason.

An empty Blob is treated as a recording failure and is not advertised or exported as video evidence.
`SessionSummary.videoStatus` reports `off`, `requesting-permission`, `recording`, `paused`,
`finalizing`, `captured`, or `unavailable` independently of the main evidence-session status.

The possible stop reasons are `session-stopped`, `duration-limit`, `user-ended-sharing`, `recorder-error`, and `destroyed`.

If permission is denied, the APIs are unsupported, a non-tab source is detected, or recording cannot start, the main evidence session continues and exposes a `VIDEO_UNAVAILABLE` warning. Audio is disabled by default. When enabled, the browser and operating system decide whether tab/system audio is available.

> Screenshot masks do not redact the video stream. Testers must avoid displaying secrets and customer data anywhere in the shared tab while video capture is active.

### Tester actions and navigation

The action recorder can capture clicks, form submissions, form-control changes, `history.pushState`, `history.replaceState`, `popstate`, `hashchange`, and `pagehide`. It ignores events originating inside the TestWitness toolbar.

Action sequence numbers increase only after a record is accepted. URLs and element text are sanitized. Safe identifiers are selected in this order:

1. `data-testid`
2. `id`
3. `name`
4. `aria-label`
5. A CSS path of at most five ancestor segments

Click text is whitespace-normalized and limited to 160 characters. Form-control text is omitted by default. Checkbox and radio changes record only `checked` or `unchecked`. Password, hidden, and file input values are never recorded. Even with `captureTextInputValues: true`, values are omitted for fields whose name, ID, autocomplete value, or test ID is sensitive.

History wrappers call the application's original method and return its original value. Listener/wrapper errors are reported as recoverable recorder warnings and do not intentionally alter the host action.

### Console warnings and errors

Only configured `console.warn` and `console.error` calls are intercepted. The original console method runs first with its original receiver and arguments; capture then receives sanitized copies. Objects, arrays, errors, circular structures, DOM nodes, Blobs, and other values are converted into bounded, serializable evidence.

A shared internal hub avoids stacking duplicate wrappers on the same console target. The original property descriptor is restored when the last subscriber stops, provided another library has not replaced the TestWitness wrapper in the meantime.

### Network requests and failures

TestWitness instruments page-level `window.fetch` and `XMLHttpRequest` only while a session is active. Failed-request capture is enabled by default. Set `network.captureSuccessfulRequests: true` when a reviewed test environment also needs request totals, successful outcomes, and an endpoint summary in the report. Successful-request capture stores only privacy-minimized metadata: transport, method, sanitized URL, status, duration, timestamp, and outcome. It does not enable request or response bodies.

The recorder can collect:

- `fetch` and XHR responses with status 400 through 599
- Rejected `fetch` requests, categorized as abort, timeout, or network error
- XHR `error`, `timeout`, and `abort` events
- Successful Fetch/XHR outcomes when `captureSuccessfulRequests` is explicitly enabled
- Method, sanitized URL, status when available, duration, failure type, and sanitized visible headers

The wrapper returns the original `fetch` promise and preserves XHR method return values. It does not convert failures into successful responses or consume the application's response body. When body capture is explicitly enabled, it reads a clone where possible and limits text reads to 64 KiB before sanitization.

Every captured failed request is also represented in the privacy-minimized request-activity data so
report totals agree with the error details. Failure capture still follows the corresponding
`captureFailedFetch` or `captureFailedXhr` setting. Successful requests are omitted unless explicitly
enabled. Endpoint summaries group by method, origin, and sanitized path; query strings are not used
as grouping keys.

The recorder does not cover WebSocket, EventSource, `navigator.sendBeacon`, requests made before the session, worker-internal requests, or calls made in another JavaScript realm such as a cross-origin iframe. Browser CORS/header rules can prevent response headers or bodies from being visible. Screenshot renderer requests are suppressed from TestWitness network evidence.

## Privacy and security

Privacy controls are centralized in `DataSanitizer` and `ElementMasker`. Configured names are additive: callers cannot remove the built-in protected names.

The following header names are always redacted, using case- and punctuation-insensitive matching:

```text
authorization, proxy-authorization, cookie, set-cookie, x-api-key,
api-key, x-auth-token, access-token, x-access-token, refresh-token,
x-refresh-token, x-csrf-token, x-xsrf-token, csrf-token, xsrf-token,
password, x-password, session-id, x-session-id, jsessionid
```

Built-in sensitive query/form names include common access-token, refresh-token, API-key, CSRF/XSRF, password, authorization, session ID, SID, and JSESSIONID spellings. URL user names/passwords, `;jsessionid=...` path parameters, sensitive normal query parameters, and query-like hash fragments are redacted. Bearer/Basic credentials, JWT-shaped strings, and embedded `key=value` or `key: value` secrets are sanitized from general text.

The default screenshot masks are:

```css
input[type='password']
input[type='file']
input[autocomplete='current-password']
input[autocomplete='new-password']
```

Sensitive form controls found by configured/built-in field names are also excluded from the rendered clone. `maskSelectors` create opaque redaction regions; `excludeSelectors` omit elements entirely. Invalid selectors cause a clear screenshot error and the page is restored.

Sanitization is defense in depth, not a data-loss-prevention guarantee. Application-specific identifiers, text, canvas pixels, images, or video may still contain sensitive information. Teams should:

- Use dedicated test environments and synthetic accounts.
- Keep periodic screenshots disabled or use a reviewed interval until application-specific mask
  selectors have been verified; automatic images can capture transient visible page content.
- Keep successful-request metadata, request/response body, and text-input capture disabled unless
  approved and required for the test objective.
- Add selectors and names for application-specific sensitive data.
- Review exported evidence before attaching it to tickets or sharing it.
- Apply normal retention, access-control, encryption-at-rest, and deletion policies to ZIP files.
- Avoid capturing production customer data without documented approval.

## In-memory evidence and cleanup

MVP 1 has no IndexedDB persistence and no backend upload. Evidence remains in the current page's JavaScript memory until another session starts or `destroy()` is called.

The store counts Blob bytes plus approximate UTF-8 JSON size. Crossing `memory.warningThresholdMb` emits one `MEMORY_THRESHOLD_REACHED` warning per session and sets `summary.memoryWarningReached`; it does not stop capture. Video has a hard configured duration limit, but the memory warning is not a hard archive-size cap.

Important consequences:

- Download the ZIP before starting another session or destroying the instance.
- Reloading or fully navigating away loses in-memory evidence.
- Traditional server-rendered navigation replaces the page and therefore cannot preserve an active MVP 1 session. Use it within a page or SPA flow, or stop/download before a full navigation.
- Large pages, many screenshots, and long/high-resolution video can exhaust browser memory before the warning threshold is reached.

Snapshots returned internally by the store are detached and recursively frozen except for immutable Blob references. Media tracks and transient download object URLs are released during cleanup.

## ZIP export

With default settings, a completed archive looks like:

```text
TestWitness-TC-1042-2026-09-08T15-42-10-123Z.zip
├── report.html
├── metadata.json
├── actions.json
├── console-logs.json
├── network-requests.json
├── network-errors.json
├── notes.json
├── recording.webm              # only when video was captured
└── screenshots/
    ├── 001-login-completed.png
    └── 002-form-submitted.png
```

`metadata.json` is always present. `includeHtmlReport: false` omits `report.html`;
`includeJsonReport: false` omits the five event/note JSON files. `network-requests.json` contains the
privacy-minimized request activity used for totals and endpoint analysis. It includes failures when
the corresponding Fetch/XHR failure option was enabled; successful outcomes appear only when
`network.captureSuccessfulRequests` was enabled.
Screenshot and video assets are included whenever evidence exists, independently of those report
flags.

The offline report is organized for both a quick QA decision and deeper diagnosis:

- **Session summary** and **Capture health** present the result, duration, recorded evidence counts,
  warnings, and video availability without making the tester scan raw events.
- Keyboard-accessible, CSS-only filter cards switch the chronological explorer among **All
  evidence**, **Tester journey**, **Screenshots**, **Successful requests**, **Errors**, **Warnings**,
  **Requests**, and **Notes**.
- The explorer combines actions, notes, screenshots, console problems, and network outcomes. Each
  event can be expanded for its timestamp and available sanitized details.
- **Request and endpoint review** groups privacy-minimized requests by HTTP method, origin, and path
  with recorded total/succeeded/failed counts, average/maximum duration, status/outcome breakdowns,
  and links back to matching explorer events. Query strings and fragments are omitted from grouping.
- Dedicated screenshot and video areas make visual evidence easy to review, while metadata,
  warnings, and capture-health information remain available without dominating the first view.

“Tester journey” means the captured sequence of tester activity; it does not claim that the product
knows the expected happy path. Request totals describe what TestWitness recorded; because successful
capture is opt-in, a zero count does not prove the browser made no successful requests. All inserted
values are HTML-escaped. Asset paths are validated, and
the report includes a restrictive CSP that permits only ZIP-local images/media and inline report
styling, with scripts disabled. It is responsive and includes print-friendly styles.

Extract the ZIP before opening `report.html`; browsers generally cannot resolve sibling assets while viewing an HTML file directly inside an archive.

Supported filename tokens are:

- `{applicationName}`
- `{environment}`
- `{result}`
- `{sessionId}`
- `{testCaseId}`
- `{timestamp}`

Unknown tokens are removed. Unsafe filename characters and path separators are replaced, the archive basename is bounded, and exactly one `.zip` suffix is added. A missing test-case ID becomes `no-test-case`. Screenshot asset names are sanitized and deduplicated case-insensitively.

## Floating toolbar

Enable the optional toolbar with `toolbar.enabled`. It is a custom element named
`test-witness-toolbar` with an open Shadow Root and isolated CSS. It provides an unchecked
**Capture video** choice, explicit **Start with video**/**Start without video** action, pause/resume,
one-click screenshot, note, result, stop, and download controls plus status, duration, live screenshot
count, capture confirmation, and persistent textual video state.

The toolbar uses native buttons, labels, visible keyboard-focus styles, live status/error regions,
and Enter-to-add-note behavior. Its host uses the browser's highest practical z-index and starts in
the corner selected by `toolbar.position`. Drag the **Move TestWitness toolbar** header with a mouse
or touch to place it anywhere within the visible viewport. Keyboard users can focus that same
handle, use the arrow keys to move it, hold Shift for a larger step, and press Home or Escape to
return it to its configured corner. Movement is clamped to the viewport and adjusted after a window
resize. Session buttons do not initiate dragging. The toolbar hides automatically during
screenshots.

## Integration examples

### Plain HTML and JavaScript

A runnable version is in [`examples/vanilla`](./examples/vanilla/).

Copy `dist/testwitness.min.js` to an application-controlled static asset path, or load the equivalent file from the installed package:

```html
<button id="tw-start" type="button">Start evidence</button>
<button id="tw-shot" type="button">Screenshot</button>
<button id="tw-note" type="button">Add note</button>
<button id="tw-stop" type="button">Stop and download</button>
<label><input id="tw-video" type="checkbox" /> Capture browser-tab video</label>

<script src="/assets/testwitness.min.js"></script>
<script>
  const witness = new window.TestWitness.TestWitness({
    applicationName: 'Customer Portal',
    environment: 'QA',
    video: { enabled: false },
  });

  witness.initialize().catch(console.error);

  document.querySelector('#tw-start').addEventListener('click', async () => {
    await witness.startSession(
      {
        testCaseId: 'TC-1042',
        testCaseName: 'Successful login',
      },
      { captureVideo: document.querySelector('#tw-video').checked },
    );
  });

  document.querySelector('#tw-shot').addEventListener('click', async () => {
    await witness.captureScreenshot('Login completed');
  });

  document.querySelector('#tw-note').addEventListener('click', () => {
    witness.addNote('Validated the successful login scenario');
  });

  document.querySelector('#tw-stop').addEventListener('click', async () => {
    await witness.stopSession('passed');
    await witness.downloadEvidence();
  });

  window.addEventListener('pagehide', () => {
    void witness.destroy();
  });
</script>
```

When the checkbox is selected, the Start button's direct click is important: it supplies the browser
user gesture required by `getDisplayMedia`. The unchecked default starts a normal evidence session
without asking for display permission.

### React

The [`examples/react`](./examples/react/) directory is a complete runnable Vite application. Its
[React example README](./examples/react/README.md) includes a click-by-click evidence and privacy
test pass across login, signup, dashboard, access-request, and profile screens. Its root-level,
Strict Mode-safe integration is in
[`examples/react/TestWitnessExample.tsx`](./examples/react/TestWitnessExample.tsx).

The runnable example enables the built-in floating toolbar. The following is an alternative custom
React control surface using the same framework-independent API:

```tsx
import { useEffect, useRef, useState } from 'react';
import { TestWitness, type SessionStatus } from '@testwitness/core';

export function TestEvidenceControls() {
  const witnessRef = useRef<TestWitness | null>(null);
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const witness = new TestWitness({
      applicationName: 'React Customer Portal',
      environment: 'QA',
      video: { enabled: false },
      toolbar: { enabled: false },
    });
    witnessRef.current = witness;
    let mounted = true;
    const unsubscribe = witness.onSummary((summary) => setStatus(summary.status));
    const initialization = witness.initialize();
    void initialization.then(() => {
      if (mounted) setReady(true);
    });

    return () => {
      mounted = false;
      unsubscribe();
      witnessRef.current = null;
      void initialization.catch(() => undefined).then(async () => await witness.destroy());
    };
  }, []);

  return (
    <div>
      <p>Evidence status: {status}</p>
      <button
        type="button"
        disabled={!ready}
        onClick={() =>
          void witnessRef.current?.startSession(
            {
              testCaseId: 'TC-1042',
              testCaseName: 'Successful login',
            },
            { captureVideo: false },
          )
        }
      >
        Start
      </button>
      <button
        type="button"
        onClick={() => void witnessRef.current?.captureScreenshot('Login completed')}
      >
        Screenshot
      </button>
      <button
        type="button"
        onClick={() => witnessRef.current?.addNote('Validated the successful login scenario')}
      >
        Add note
      </button>
      <button
        type="button"
        onClick={async () => {
          const witness = witnessRef.current;
          if (!witness) return;
          await witness.stopSession('passed');
          await witness.downloadEvidence();
        }}
      >
        Stop and download
      </button>
    </div>
  );
}
```

Keep one instance at an application/provider boundary. React development Strict Mode deliberately exercises effect cleanup; ensure UI actions wait until initialization has completed in production code and handle rejected promises in the application's normal error UI.

### Angular

The [`examples/angular`](./examples/angular/) directory is a complete runnable standalone Angular
application. See [`examples/angular-instructions`](./examples/angular-instructions/) for smaller
SSR-aware service and component snippets.

Wrap the framework-independent instance in an injectable service and clean it up when the service/application is destroyed:

```ts
import { Injectable, OnDestroy } from '@angular/core';
import {
  TestWitness,
  type SessionResultStatus,
  type SessionStartMetadata,
} from '@testwitness/core';

@Injectable({ providedIn: 'root' })
export class TestWitnessService implements OnDestroy {
  private readonly witness = new TestWitness({
    applicationName: 'Angular Customer Portal',
    environment: 'QA',
    video: { enabled: false },
    toolbar: { enabled: true },
  });

  initialize() {
    return this.witness.initialize();
  }

  start(metadata: SessionStartMetadata = {}, captureVideo = false) {
    return this.witness.startSession(metadata, { captureVideo });
  }

  screenshot(label: string) {
    return this.witness.captureScreenshot(label);
  }

  note(text: string) {
    return this.witness.addNote(text);
  }

  async stopAndDownload(result: SessionResultStatus) {
    await this.witness.stopSession(result);
    return await this.witness.downloadEvidence();
  }

  ngOnDestroy() {
    void this.witness.destroy();
  }
}
```

Call `initialize()` once from the root component (for example, in `ngOnInit`). Call `start()` from a
button handler with the current video-checkbox value. TestWitness does not depend on Zone.js and
does not require an Angular module.

### AngularJS

See the script-tag service wrapper in [`examples/angularjs`](./examples/angularjs/).

The browser bundle can be wrapped in an AngularJS service without adding it to the core library:

```js
angular.module('qaTools').factory('testWitness', [
  '$window',
  function ($window) {
    const witness = new $window.TestWitness.TestWitness({
      applicationName: 'Legacy Customer Portal',
      environment: 'QA',
      video: { enabled: false },
    });

    return {
      initialize: () => witness.initialize(),
      start: (metadata, captureVideo = false) => witness.startSession(metadata, { captureVideo }),
      pause: () => witness.pauseSession(),
      resume: () => witness.resumeSession(),
      screenshot: (label) => witness.captureScreenshot(label),
      note: (text) => witness.addNote(text),
      result: (value) => witness.setSessionResult(value),
      stop: (value) => witness.stopSession(value),
      download: () => witness.downloadEvidence(),
      destroy: () => witness.destroy(),
    };
  },
]);

angular.module('qaTools').controller('QaController', [
  'testWitness',
  function (testWitness) {
    this.initialize = () => testWitness.initialize();
    this.start = () =>
      testWitness.start({
        testCaseId: 'TC-1042',
        testCaseName: 'Successful login',
      });
    this.screenshot = () => testWitness.screenshot('Login completed');
    this.note = () => testWitness.note('Validated the successful login scenario');
    this.stopAndDownload = async () => {
      await testWitness.stop('passed');
      await testWitness.download();
    };
  },
]);
```

Load AngularJS, the TestWitness browser bundle, the module/service file, and then the application bootstrap in that order.

### FreeMarker/FTL

See the template and external bootstrap script in [`examples/freemarker`](./examples/freemarker/).

Serve the browser bundle as a normal static asset. Prefer passing server values through HTML-escaped data attributes instead of concatenating untrusted values into executable JavaScript:

```ftl
<div
  id="test-witness-config"
  data-application-name="${(applicationName!'Application')?html}"
  data-environment="${(environmentName!'QA')?html}"
  data-release-version="${(releaseVersion!'')?html}"
  data-test-case-id="${(testCaseId!'')?html}"
  data-test-case-name="${(testCaseName!'')?html}"
></div>

<button id="start-evidence" type="button">Start evidence</button>
<button id="capture-evidence" type="button">Capture screenshot</button>
<button id="stop-evidence" type="button">Stop and download</button>

<script src="/static/testwitness.min.js"></script>
<script nonce="${cspNonce?html}">
  const values = document.getElementById('test-witness-config').dataset;
  const witness = new window.TestWitness.TestWitness({
    applicationName: values.applicationName,
    environment: values.environment,
    releaseVersion: values.releaseVersion || undefined,
    video: { enabled: false },
  });

  witness.initialize().catch(console.error);
  document.getElementById('start-evidence').addEventListener('click', () =>
    witness.startSession({
      testCaseId: values.testCaseId || undefined,
      testCaseName: values.testCaseName || undefined,
    }),
  );
  document.getElementById('capture-evidence').addEventListener('click', () => {
    witness.addNote('Validated the successful login scenario');
    return witness.captureScreenshot('Login completed');
  });
  document.getElementById('stop-evidence').addEventListener('click', async () => {
    await witness.stopSession('passed');
    await witness.downloadEvidence();
  });
</script>
```

Use the escaping directives and CSP nonce conventions approved for your FreeMarker version and application. The same data-attribute pattern works in JSP (for example with JSTL escaping) and Thymeleaf (with `th:data-*` attributes).

### Vue and other frameworks

The [`examples/vue`](./examples/vue/) directory is a complete runnable Vue 3/Vite application. It
owns one `TestWitness` instance in an application-level provider, initializes it on mount, exposes
reactive integration status, and destroys it during unmount. The same ownership pattern works with
a plugin, composable, service, or application shell; no framework-specific adapter is needed.

## Browser permissions

Browser-tab video requires a secure context, normally HTTPS or localhost. The tester must initiate recording, see the browser's native chooser, select a browser tab, and approve sharing. The prompt appears for each new recording; TestWitness cannot pre-authorize it. Enterprise browser policies may disable display capture or downloads.

When embedded in an iframe, the top-level application may also need an appropriate Permissions Policy and iframe allowance, subject to browser support and organizational policy:

```http
Permissions-Policy: display-capture=(self)
```

```html
<iframe src="/qa-page" allow="display-capture"></iframe>
```

Do not interpret a successful screen-share grant as consent to collect sensitive data. Establish the testing/data-handling approval separately.

## Browser support and limitations

| Browser                           | MVP 1 expectation                                                                                                                                                                                                           |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current enterprise Chrome         | Primary target. DOM evidence, WebM tab recording, and download are expected when permitted.                                                                                                                                 |
| Current enterprise Microsoft Edge | Primary target. Chromium behavior is generally similar to Chrome; enterprise policies can differ.                                                                                                                           |
| Current enterprise Firefox        | Supported through feature detection. Chooser options, MIME support, display-surface metadata, and DOM rendering may differ.                                                                                                 |
| Safari                            | Not an MVP 1 target. Display capture, MediaRecorder MIME choices, WebM recording/playback, and DOM-to-canvas behavior vary by Safari/macOS version. Non-video evidence may work, but validate in the exact managed version. |

Feature detection—not the reported user-agent name—controls video availability. User-agent/client-hint parsing is used only for report metadata and can return `Unknown`.

Important platform limitations alter what evidence can survive or be observed:

- A full page reload/navigation destroys the in-memory session. SPA History API transitions remain in the same session.
- Cross-origin frames and separate windows have separate JavaScript realms and are not instrumented by the parent instance.
- Page scripts cannot see every browser request, response header, redirect detail, or service-worker-internal operation.
- DOM screenshots are reconstructions, not privileged browser pixels.
- Browser extensions, download policy, storage pressure, memory pressure, and page CSP can block features.
- Video is WebM-only in MVP 1 and may not play in all native operating-system media players. The extracted report uses browser playback and also provides a file link.

## Content Security Policy

The exact policy must be reviewed with the host application's security team. Typical considerations are:

- Permit the hosted IIFE in `script-src`, preferably from the application's own origin. Give inline bootstrap code a nonce or move it into an approved external script.
- The Shadow DOM toolbar injects a `<style>` block, and screenshot masking uses temporary inline styles. A strict `style-src` may require `'unsafe-inline'` for these features because MVP 1 does not expose a CSP nonce for generated style nodes.
- DOM screenshot rendering may need `img-src 'self' data: blob:`, the origins of displayed images, and compatible CORS responses.
- Inlined/fetched fonts or images may require corresponding `font-src`, `img-src`, and `connect-src` origins.
- Browser-tab capture may be governed by the `display-capture` Permissions Policy independently of CSP.
- ZIP download uses a `blob:` object URL; browser/download policy must allow the anchor-triggered download.

A representative starting point—not a policy to copy without review—is:

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-{per-request-nonce}';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https:;
  font-src 'self' data: https:;
  connect-src 'self' https:;
  media-src 'self' blob:;
  object-src 'none';
  base-uri 'self';
```

The generated offline report carries its own restrictive policy: scripts, connections, frames, forms, and objects are disabled; only ZIP-local image/video assets and its inline CSS are allowed.

## Troubleshooting

### `NOT_INITIALIZED`

Await `witness.initialize()` before starting or operating a session. Do not initialize the same instance twice without a corresponding `destroy()`.

### Recording permission is denied or no video appears

- Select **Capture video** before starting, or pass `{ captureVideo: true }`, and run
  `startSession()` directly from a user click or key activation.
- In the chooser, select **Browser Tab**, choose the application tab, and select **Share**. Choosing
  an entire screen or application window is rejected by this tab-only MVP.
- Confirm that the toolbar changes from **Video: requesting permission** to **Video: recording**
  after approval. The separate evidence status can say `recording` even when video is off, so it is
  not proof of video capture.
- Use HTTPS or localhost.
- Confirm that `navigator.mediaDevices.getDisplayMedia`, `MediaRecorder`, and a WebM MIME type are available.
- Check browser/OS enterprise policy and iframe Permissions Policy.
- Subscribe to `onWarning()` or inspect `getSessionSummary().warnings`. The rest of the session intentionally continues without video.
- Select **Stop session** and wait until finalization completes. Confirm **Video: captured** before
  downloading, then check that `recording.webm` exists and is non-empty in the extracted ZIP.
- When testing a local package build, run `npm run build` in this repository, restart the consuming
  development server, and hard-refresh the application tab. A Vite/npm consumer can otherwise keep
  an older cached SDK bundle that predates the recorder fix.

The unit suite verifies recorder state, final media-chunk handling, cleanup, and ZIP inclusion with
mocked browser media APIs. It cannot automate or prove a real browser permission chooser, tab
selection, enterprise policy, or actual WebM encoding; complete this flow manually in each supported
managed browser.

### A screenshot fails or looks different from the page

- Check the `SCREENSHOT_FAILED` message for an invalid selector, canvas limit, or resource-loading failure.
- Confirm that the toolbar screenshot counter increases and shows a captured filename. A failed
  manual capture is also retained in `getSessionSummary().warnings` and the report.
- Ensure cross-origin images/fonts return suitable CORS headers.
- Add unreliable third-party widgets to `privacy.excludeSelectors`.
- Remember that closed Shadow Roots, frames, canvas/video pixels, filters, and advanced CSS may not reproduce exactly.
- Review CSP console messages for blocked inline styles, data/blob images, fonts, or fetches.

### Failed network calls are missing

- Confirm capture was enabled and the session was recording—not paused—when the request started and completed.
- Only page-level `fetch` and XHR are covered.
- A successful status outside 400–599 is not an error record.
- Requests completed after recorder teardown are deliberately ignored.
- Cross-origin response details remain subject to browser CORS restrictions.

Successful requests are intentionally absent unless `network.captureSuccessfulRequests: true` is
configured. Enabling it adds privacy-minimized activity to `network-requests.json` and the report's
request/endpoint views; it does not add successful requests to `network-errors.json` or enable
bodies.

### The ZIP does not download

Call `stopSession()` first. Download requires an active document body plus `URL.createObjectURL`. Check download policies and the application's sandbox/CSP. `downloadEvidence()` returns the ZIP Blob when generation and the browser-triggered download succeed.

### The offline report has broken images or video

Extract the entire ZIP while preserving its directory structure, then open `report.html`. Opening the HTML inside an archive or moving it away from `screenshots/` and `recording.webm` breaks relative links.

### A second instance cannot start

Only one recording or paused session is allowed per loaded library module. Stop or destroy the current owner before starting another instance. Avoid bundling multiple copies of the package because they could compete for global browser wrappers.

## Development

Requirements:

- Node.js 20.19 or newer
- npm (the repository includes `package-lock.json`)

Install and start Vite:

```bash
npm ci
npm run dev
```

Available commands:

| Command                    | Purpose                                                           |
| -------------------------- | ----------------------------------------------------------------- |
| `npm run dev`              | Start Vite in development mode.                                   |
| `npm test`                 | Run all Vitest unit tests once in jsdom.                          |
| `npm run test:watch`       | Run Vitest in watch mode.                                         |
| `npm run typecheck`        | Run strict TypeScript checking without emit.                      |
| `npm run lint`             | Lint source, tests, and build configuration.                      |
| `npm run format`           | Format the workspace with Prettier.                               |
| `npm run format:check`     | Verify formatting without edits.                                  |
| `npm run clean`            | Remove `dist` and `coverage`.                                     |
| `npm run build`            | Clean, type-check, and build all package formats/declarations.    |
| `npm run validate`         | Test, type-check, lint, format-check, and run a production build. |
| `npm run examples:install` | Install locked dependencies for all four runnable examples.       |
| `npm run examples:build`   | Production-build React, Angular, Vue, and vanilla examples.       |

### Build

```bash
npm run build
```

Vite library mode creates:

```text
dist/
├── index.js
├── index.cjs
├── testwitness.min.js
├── index.d.ts
└── ...module declarations and source maps
```

The IIFE includes runtime dependencies so a script-tag consumer does not need an import map or application build change.

### Testing

```bash
npm test
npm run typecheck
npm run lint
npm run format:check
```

The unit suite covers configuration/validation, lifecycle transitions, metadata, sanitization/redaction, action/console/network interception and restoration, screenshot privacy behavior, video state and cleanup with mocked browser media APIs, in-memory evidence, HTML escaping/report generation, ZIP contents, toolbar behavior, and public orchestration.

Real browser display capture and permission UI are **not** covered by unit tests. Validate tab selection, WebM output/playback, audio policy, DOM screenshot fidelity, CSP, and programmatic downloads manually in every supported managed browser before deployment.

Install and production-build every runnable framework example with:

```bash
npm run examples:install
npm run examples:build
```

Each example's README contains its manual evidence workflow. Start with the
[framework quick-start guide](./examples/QUICK_START.md).

## Additional exports

The main package exports stable evidence/session/configuration types plus these advanced utilities:

- `resolveTestWitnessConfig`
- `TestWitnessError` and `TestWitnessErrorCode`
- `InMemoryEvidenceStore`, `EvidenceStore`, `EvidenceSnapshot`, and related store types
- `EvidenceExporter` and `generateEvidenceFileName`
- `HtmlReportGenerator`, `ReportAssetManifest`, and `escapeHtml`

These utilities support testing and future adapters. The `TestWitness` coordinator is the recommended application entry point.

## Known MVP 1 limitations

- Evidence is memory-only, has no crash/reload recovery, and cannot span full document navigation.
- There is no backend upload, remote storage, authentication, encryption, or retention workflow.
- Screenshot capture depends on DOM cloning and browser canvas behavior rather than a privileged screenshot API.
- Screenshot masks cannot redact the separately captured tab video.
- The toolbar is movable within the current viewport, but its manually chosen position is not
  persisted across page reloads.
- Video recording is WebM-only and browser permission cannot be automated.
- Page-level Fetch/XHR failures are captured by default; successful request metadata is opt-in.
  Other transports and browser-level traffic are outside scope.
- Request/response body capture is best-effort, bounded, and deliberately disabled by default.
- Approximate memory size is a warning mechanism, not an enforced total evidence limit.
- Safari is not a supported MVP 1 target.

## Roadmap

Potential post-MVP work includes:

- IndexedDB-backed evidence storage and reload recovery
- Optional authenticated backend upload and resumable transfer
- Encryption, integrity manifests, signing, and retention controls
- Cross-navigation/session handoff for server-rendered applications
- Configurable evidence-size enforcement and streaming ZIP creation
- Additional media containers and broader Safari compatibility after managed-browser validation
- Optional framework adapter packages and richer toolbar customization
- End-to-end browser coverage for permission, screenshot, recording, and download flows

## License

TestWitness is available under the [MIT License](./LICENSE). Copyright © 2026 TestWitness
contributors.
