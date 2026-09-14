# TestWitness realistic vanilla JavaScript demo

> Every test has a story. Capture the proof.

This is a runnable, framework-free application that shows how an existing browser application can
own TestWitness controls. The demo includes login, signup, dashboard, and access-request flows,
plus successful and failed Fetch requests, console errors, form changes, client-side navigation,
masked content, tester notes, screenshots, optional tab video, and ZIP export.

The application loads the SDK through a normal script tag and uses
`window.TestWitness.TestWitness`. Vite is only the local static server and mock-API host; the
application code itself has no framework and does not import the SDK as a module.

> Use synthetic information only. Do not enter production credentials, security tokens, customer
> data, or other regulated information into this demo.

## Prerequisites

- Node.js 20.19 or newer
- npm
- A current Chrome, Edge, or Firefox browser

Display capture must run in a secure context. `http://127.0.0.1` and `http://localhost` are treated
as trustworthy for local development by supported browsers.

## Install and run

From this directory:

```bash
cd testwitness/examples/vanilla
npm install
npm run dev
```

Open <http://127.0.0.1:4174/#/login>.

`npm run dev` deliberately does three things:

1. Builds the current SDK source from `../..`.
2. Copies `../../dist/testwitness.min.js` to the application's own
   `public/vendor/testwitness.min.js` path.
3. Starts Vite with local mock endpoints used by the test scenarios.

This prevents the example from silently using an old globally installed package. The copied vendor
file is generated and ignored by Git.

## First evidence session

### 1. Start and choose video per session

The evidence panel is on the right on desktop and above the app on smaller screens.

1. Leave **Capture browser-tab video** unchecked for screenshots, actions, notes, console logs, and
   network evidence only. This is the default and no permission dialog opens.
2. Check it when this particular session needs video.
3. Select **Start session**.
4. If video is enabled, the browser opens its native permission chooser. Select **Browser Tab**,
   select the Member Services tab, and approve **Share**. Selecting a window or entire screen is
   rejected because this demo intentionally records browser tabs only.
5. Check the two separate status values: session should say `recording`, and video should say
   `recording` when sharing was approved. A session can keep recording other evidence when video is
   `off` or `unavailable`.

Video is a runtime choice:

```js
await witness.startSession(sessionMetadata, {
  captureVideo: document.querySelector('#capture-video').checked,
});
```

The base configuration keeps video disabled, so every new session requires an explicit choice:

```js
video: {
  enabled: false,
  includeAudio: false,
  maxDurationMinutes: 10,
}
```

The library never bypasses or pre-approves the browser chooser. Unit tests can mock media APIs, but
real permission, enterprise policy, operating-system sharing controls, and WebM encoding require a
manual browser test.

### 2. Exercise login and navigation

The prefilled values are synthetic.

1. On **Login**, select **Sign in** for a successful request and navigation to the dashboard.
2. Return to Login, enable **QA: return HTTP 401**, and sign in again to record a failed Fetch
   request and a `console.error` entry.
3. Visit **Sign up**, change fields, accept the policy, and submit.
4. On **Dashboard**, switch between 7 and 30 days.

Passwords are always excluded from captured values. Request and response bodies are disabled. The
demo sends synthetic Authorization, API-key, and token values so the resulting evidence can be
checked for redaction.

### 3. Submit a realistic form

1. Open **Access request**.
2. Choose an application and access level, change the date and justification, and confirm manager
   approval.
3. Submit once for HTTP 201.
4. Enable **QA: return HTTP 503** and submit again for a controlled failure.

The customer-reference area is marked `data-private` and is masked in screenshots. Hidden CSRF
fields and complete free-text input values are not captured.

### 4. Capture screenshots and notes

While the session status is `recording`:

1. Put the application into the state that matters.
2. Enter a meaningful **Screenshot label**.
3. Select **Capture screenshot** and wait for the filename confirmation.
4. Enter a tester observation and select **Add note**.

The demo also enables automatic screenshots at session start, after same-document navigation, after
captured console/network errors, and every 20 seconds. Automatic captures are capped at 30. Manual
capture stays available until the session is paused or stopped.

The whole evidence panel and QA-only failure controls use `privacy.excludeSelectors`, so they are
temporarily excluded from generated screenshots. Private account values use
`privacy.maskSelectors` and appear masked rather than readable.

### 5. Pause and resume

1. Select **Pause**. Action, console, network, screenshot, and active video capture pause together.
2. Notice that manual screenshot capture is disabled while paused.
3. Select **Resume**, then continue the scenario.

The same button calls the synchronous session methods:

```js
if (witness.getSessionStatus() === 'paused') {
  witness.resumeSession();
} else {
  witness.pauseSession();
}
```

### 6. Stop and download

1. Select `Passed`, `Failed`, `Blocked`, or `Not set`.
2. Select **Stop session** and wait for finalization. When video was enabled, this wait allows the
   browser to deliver its final MediaRecorder data before the ZIP becomes available.
3. Confirm that video says `captured` and the message says video was included. If video was not
   selected or permission failed, the rest of the evidence is still valid.
4. Select **Download ZIP**.

Extract the ZIP and open `report.html` directly. Expected files include:

```text
report.html
metadata.json
actions.json
console-logs.json
network-requests.json
network-errors.json
notes.json
recording.webm             # only when video was selected and captured
screenshots/
```

Verify that the report works offline, screenshot thumbnails load, the timeline reflects the demo
journey, failed requests appear, and sensitive headers/query parameters are redacted.

## Integration pattern

The SDK is loaded before `app.js`:

```html
<script src="/vendor/testwitness.min.js" defer></script>
<script src="/app.js" defer></script>
```

The application creates and initializes one instance:

```js
const { TestWitness } = window.TestWitness;

const witness = new TestWitness({
  applicationName: 'Member Services Vanilla Demo',
  environment: 'local-qa',
  screenshot: {
    enabled: true,
    captureOnStart: true,
    captureOnNavigation: true,
    captureOnError: true,
  },
  video: { enabled: false, includeAudio: false },
  privacy: {
    maskSelectors: ['[data-private]'],
    excludeSelectors: ['[data-test-witness-control-panel]', '[data-demo-helper]'],
  },
  toolbar: { enabled: false },
});

await witness.initialize();
```

`onSummary` drives button availability and live counts, while `onWarning` makes recoverable video,
screenshot, recorder, and memory issues visible to the tester.

The page performs safe teardown once:

```js
const removeSummaryListener = witness.onSummary(renderSummary);
const removeWarningListener = witness.onWarning(renderWarning);

window.addEventListener(
  'pagehide',
  () => {
    removeSummaryListener();
    removeWarningListener();
    void witness.destroy();
  },
  { once: true },
);
```

`destroy()` stops active media tracks, restores Fetch/XHR/console/browser-history instrumentation,
removes listeners, and clears in-memory evidence. A destroyed instance must be initialized again
before reuse. In most applications, create a new instance when the application shell remounts; if
reusing the same instance, call `await witness.initialize()` again before `startSession()`.

Calling **Start new session** after a normal stop does not require `destroy()` or another
`initialize()`, but it replaces the previous in-memory evidence. Download the completed ZIP first.

## Commands

Run commands from `examples/vanilla`:

```bash
npm run dev          # build/sync the SDK, then start the demo
npm run build        # build/sync the SDK, then create this example's dist/
npm run preview      # serve the already-built example with mock API endpoints
npm run sdk:build    # build only the root SDK
npm run sdk:sync     # copy an existing root browser bundle into public/vendor
npm run check        # syntax-check demo JS and run the production build
```

After editing SDK source while the dev server is running, stop it and run `npm run dev` again. The
SDK is a classic copied script rather than a hot-reloaded source import.

## Production/server-rendered adaptation

In a real plain HTML, JSP, FTL, or Thymeleaf application, copy the published IIFE artifact into the
application's normal static-asset pipeline and reference that application-owned URL. Do not point a
production page into this repository's `dist` directory.

Your Content Security Policy must allow the bundle from its chosen `script-src` origin, downloaded
Blob URLs where required by your policy, and screen capture under the applicable Permissions Policy.
When embedded in an iframe, the top-level application must explicitly allow `display-capture`.

## Troubleshooting

### The bundle did not load

- Run `npm install` in this directory.
- Run `npm run dev`, not a generic file server.
- Confirm `public/vendor/testwitness.min.js` was generated.
- Hard-refresh after rebuilding the SDK.

### Video is unavailable or missing from the ZIP

- Enable the checkbox before starting; it cannot be turned on halfway through a session.
- Choose **Browser Tab**, select this tab, and approve Share.
- Keep the tab-sharing indicator active until selecting **Stop session**.
- Wait for `Video: captured` before downloading.
- Use localhost/HTTPS and check enterprise browser policy and OS screen-recording permissions.
- Firefox may present a different chooser, but the selected source must still be this browser tab.

### A screenshot is missing

- Confirm the session is `recording`, not paused or stopped.
- Wait for the success message and filename before changing routes or stopping.
- Inspect capture warnings. Browser security can prevent serialization of some cross-origin images,
  fonts, canvases, or protected content.
- The evidence panel is intentionally absent because it is configured as an excluded selector.

### The mock requests return HTML

Run the demo through `npm run dev` or `npm run preview`; those commands load the example Vite config
that supplies `/api/demo/*`. A generic static server does not include the local mock endpoints.
