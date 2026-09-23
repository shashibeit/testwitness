# TestWitness realistic vanilla JavaScript demo

> Every test has a story. Capture the proof.

This example is the framework-free twin of the React Operations Portal demo. It deliberately uses
the same login, signup, dashboard, access-request, profile-settings, responsive layout, synthetic
API scenarios, privacy hooks, and floating Shadow DOM toolbar so teams can compare the integration
approaches without comparing two different applications.

The application is built with browser-native DOM, History, Fetch, and XMLHttpRequest APIs. It loads
`testwitness.min.js` through a classic script tag and calls `window.TestWitness.TestWitness`; it does
not import React, Vue, Angular, or the SDK as an ES module. Vite is used only as the local static
server, production bundler, and deterministic mock-API host.

## Run the demo

From the `testwitness` repository root:

```bash
npm install
cd examples/vanilla
npm install
npm run dev
```

Open <http://127.0.0.1:4174/login>.

`npm run dev` builds the current SDK, copies `dist/testwitness.min.js` into this application's
ignored `public/vendor/` directory, verifies stylesheet parity with React, and starts the local mock
API server. This prevents the script-tag demo from silently using a stale global package.

The demo credentials are synthetic:

```text
Email:    qa.tester@example.test
Password: DemoOnly!123
```

Never enter real credentials or customer data into this demo.

## First end-to-end evidence session

### 1. Start from the application login page

Use the floating **TestWitness** toolbar in the bottom-right corner. If it covers the part of the
application you need, drag its **Move TestWitness toolbar** header with a mouse or touch. Keyboard
users can focus that handle, move with the arrow keys, hold Shift for a larger step, and press Home
or Escape to return it to the configured corner.

1. Leave **Capture video** unchecked for a screenshot/log-only session, or select it when video is
   required. It is off by default.
2. Select **Start with video** when checked, or **Start without video** when unchecked.
3. If video was selected, choose the current Operations Portal tab in the browser permission
   dialog. An unchecked video option never opens that dialog.
4. For video, confirm the persistent label says **Video: recording**. The separate evidence-session
   status becomes `recording` in both video and no-video sessions. Its live screenshot counter should
   change to `1 shot` after the automatic start checkpoint completes.

TestWitness is running inside this application tab. If video is enabled, selecting another tab would
change only the video source; screenshots, actions, console messages, and network failures would
still come from this portal tab.

This demo captures screenshots automatically at session start, after client-side navigation, after
recorded errors, and every 15 seconds. Automatic triggers are coalesced and limited to 40 per
session. **Capture screenshot** remains available for an immediate tester-selected checkpoint; the
toolbar confirms the filename and updates its screenshot count.

### 2. Capture a failed login

1. Enable **Simulate an invalid login (HTTP 401)**.
2. Select **Sign in**.
3. Confirm that the page displays the unsuccessful-login message.
4. Select **Capture screenshot** after the error is visible so the UI state has a deterministic
   checkpoint.
5. Optionally add the toolbar note `Invalid login correctly rejected`.

Expected evidence:

- click, checkbox-change, and form-submit actions;
- one failed Fetch request with status `401`;
- privacy-minimized request activity for the endpoint analysis;
- a sanitized `console.error` entry;
- an automatic error checkpoint unless another automatic capture is already pending (closely timed
  triggers are intentionally coalesced), plus the manual screenshot taken after vanilla JavaScript
  renders the error;
- no password, Authorization header value, API-key value, token value, or request body.

### 3. Complete a successful login and inspect the dashboard

1. Disable the simulated failure option.
2. Select **Sign in** again.
3. The app moves to `/dashboard` without reloading the document.
4. Change the **7 days / 30 days** dashboard filter.
5. Select **Capture screenshot** in the toolbar.
6. Add the note `Login successful and dashboard loaded`.

The account metric and sidebar user card are marked `data-private`, so they are masked in the
screenshot. The TestWitness toolbar and tester-only hints are absent from screenshots.

### 4. Submit an access request

1. Open **Access requests** from the application navigation.
2. Change the application, access level, expiration date, justification, and policy checkbox.
3. Submit the successful path.
4. Capture a screenshot and add the note `Access request submitted successfully`.
5. Enable the QA option and submit again to generate a controlled Fetch `503` failure.

The action timeline records which controls changed, but normal text values remain disabled. The
customer-reference field is masked in screenshots. Request and response bodies are not collected.

### 5. Update the profile through XMLHttpRequest

1. Open **Profile settings**.
2. Change the display name, phone, time zone, and notification checkbox.
3. Save the successful path and capture a screenshot.
4. Enable the QA option and save again to generate a controlled XHR `500` failure.
5. Add the note `Profile success and failure paths verified`.

The private profile summary card is masked. The failed request should appear in
`network-errors.json` with redacted Authorization, CSRF header, and `access_token` query values. Its
privacy-minimized outcome also appears in `network-requests.json`.

### 6. Exercise signup in the same recording

1. Select **Sign out**. This uses client-side navigation, so TestWitness keeps recording.
2. Select **Create one** on the login page.
3. Complete the signup form and accept the policy.
4. Capture the **Account created** confirmation before continuing to the dashboard.

Both password inputs are always excluded from action values and masked in screenshots.

### 7. Pause, finish, and export

1. Select **Pause** in the toolbar and interact with an application control. Evidence counts should
   not increase and video should pause when it was enabled.
2. Select **Resume** and interact again.
3. Choose `Passed`, `Failed`, `Blocked`, or `Not set` in the toolbar.
4. Select **Stop session**. The browser sharing indicator should end and the toolbar should say
   **Video: captured** when video was enabled.
5. Select **Download evidence**.

## Inspect the ZIP

Extract the archive and open `report.html` directly. A video is present only when tab sharing was
approved and recorded.

### If video is missing

Use the toolbar's persistent video state as the source of truth. The main session can say `recording`
while video is off or unavailable.

1. Before selecting Start, check **Capture video** so the action changes to **Start with video**.
2. In the native chooser, select **Browser Tab**, choose this Operations Portal tab, and select
   **Share**. An entire screen or application window is not accepted by this tab-only demo.
3. Confirm the toolbar changes from **Video: waiting for tab permission** to **Video: recording**.
   If it says **Video: unavailable**, inspect the toolbar warning and browser console.
4. Run the demo through HTTPS or localhost and check browser/OS enterprise display-capture policy.
   An embedded app also needs an appropriate `display-capture` Permissions Policy.
5. Select **Stop session** and wait for **Video: captured** before downloading the ZIP. This wait lets
   `MediaRecorder` deliver its final chunk. Verify that `recording.webm` is present and non-empty.

If you changed or pulled SDK source, rebuild the package, restart the example dev server, and
hard-refresh the browser tab:

```bash
# From the testwitness repository root
npm run build

# Then restart from examples/vanilla
npm run dev
```

Vite can otherwise continue serving an older copied browser bundle. The automated unit
tests mock browser media APIs and verify state/final-chunk/ZIP behavior; they do not exercise a real
permission chooser, tab selection, enterprise browser policy, or WebM encoder. Manually run this
flow in each supported managed browser.

```text
report.html
metadata.json
actions.json
console-logs.json
network-requests.json
network-errors.json
notes.json
recording.webm
screenshots/
```

Verify that:

- the decision summary and result, duration, browser, operating system, viewport, and page metadata
  are correct;
- **Session summary** and **Capture health** show the result, recorded evidence counts, warnings,
  and video availability;
- the **All evidence**, **Tester journey**, **Screenshots**, **Successful requests**, **Errors**,
  **Warnings**, **Requests**, and **Notes** cards filter the chronological explorer, and each event
  expands to show its available sanitized details;
- the tester journey covers login, dashboard navigation, forms, and profile changes;
- **Request and endpoint review** shows recorded total, succeeded, and failed counts plus timing and
  status/outcome breakdowns grouped by method, origin, and sanitized path;
- screenshots show the correct application states but not the toolbar or tester-only hints;
- private cards and password fields are masked;
- Fetch `401`/`503` and XHR `500` failures are present;
- `authorization`, `x-api-key`, and `x-csrf-token` values are `[REDACTED]`; the sanitized URL may
  display its redacted `access_token` query value as the encoded form `%5BREDACTED%5D`;
- password values, hidden values, file values, and request/response bodies are absent;
- notes, screenshot thumbnails, and the optional video work offline.

## How TestWitness is integrated

The browser bundle is copied into the demo's normal static-asset directory and loaded before the
application module:

```html
<script src="/vendor/testwitness.min.js" defer></script>
<script src="/app.js" type="module"></script>
```

[`app.js`](./app.js) creates one long-lived SDK instance. Client-side History API navigation
replaces page content but never replaces that instance, so evidence survives all five routes:

```js
const { TestWitness } = window.TestWitness;

const witness = new TestWitness({
  applicationName: 'Operations Portal',
  environment: 'local-demo',
  screenshot: {
    enabled: true,
    captureOnStart: true,
    captureOnNavigation: true,
    captureOnError: true,
    autoCaptureIntervalSeconds: 15,
    maxAutomaticScreenshots: 40,
  },
  video: { enabled: false, includeAudio: false },
  actions: { captureTextInputValues: false },
  network: {
    // Demo-only opt-in for request totals and endpoint analysis; bodies remain disabled.
    captureSuccessfulRequests: true,
    captureFailedFetch: true,
    captureFailedXhr: true,
    captureRequestBody: false,
    captureResponseBody: false,
  },
  privacy: {
    maskSelectors: ['[data-private]'],
    excludeSelectors: ['[data-evidence-exclude]'],
  },
  toolbar: { enabled: true, position: 'bottom-right' },
});

const removeSummaryListener = witness.onSummary((summary) => {
  document.documentElement.dataset.evidenceStatus = summary.status;
});
await witness.initialize();

window.addEventListener('pagehide', (event) => {
  if (!event.persisted) {
    removeSummaryListener();
    void witness.destroy();
  }
});
```

The demo translates the React component hierarchy into small template functions in
[`templates.js`](./templates.js). API calls live in [`demo-api.js`](./demo-api.js), including Fetch
login/signup/access-request flows and an XMLHttpRequest profile flow. This separation is for
readability only; every file remains plain JavaScript.

## Apply the same pattern to a real JavaScript or server-rendered application

1. Build or install `@testwitness/core`, then copy `dist/testwitness.min.js` into the application's
   controlled static-asset pipeline.
2. Load that file through a script tag on the page that owns the QA session.
3. Create one `window.TestWitness.TestWitness` instance in the application shell, call
   `initialize()` once, and call `destroy()` during page cleanup.
4. Enable the supplied toolbar or connect application-owned controls to that same instance. Never
   create a separate instance for every route or partial-page render.
5. Add `[data-private]` or your chosen mask selectors to customer, payment, account, and employee
   data containers.
6. Keep successful-request metadata, text-input values, and request/response bodies disabled unless
   an approved test objective requires them. Successful metadata is enabled in this synthetic demo
   to exercise the report's request and endpoint views.
7. Start the session from the tab containing the application, and choose that same tab for video.
8. Use normal SPA navigation so the instance remains mounted throughout the workflow.
9. Stop and download before any hard refresh, cross-origin navigation, or full-page logout redirect.

This demo uses clean History API paths such as `/login` and `/dashboard`. When deploying the demo
to a static host, configure an SPA fallback that serves `index.html` for those paths; otherwise a
direct visit or refresh on a nested route can return `404`. A traditional multi-page server-rendered
application does not need this fallback, but each full document navigation ends the in-memory MVP 1
session unless TestWitness remains in a persistent shell.

For JSP, FreeMarker, Thymeleaf, or plain HTML, the initialization code can be a classic script
instead of a module. Escape all server-rendered values for JavaScript context before placing them in
configuration; never concatenate untrusted values into executable code.

MVP 1 stores evidence only in memory. Client-side route changes are safe, but a full document reload
destroys the session and its evidence.

For custom controls instead of the supplied toolbar, make the video choice explicit per session:

```js
await witness.startSession(sessionMetadata, { captureVideo: userSelectedVideo });
```

`captureVideo: false` never requests display permission. When omitted, the value of
`video.enabled` is used as the programmatic default.

## Local API behavior

The example Vite configuration supplies small in-process mock endpoints for `200`, `201`, `204`,
`401`, `409`, `500`, and `503` responses. They exist only to demonstrate realistic application
calls, successful-request metadata, and network-error evidence. They are not part of the SDK and no
TestWitness backend is required.

## Validate the example

```bash
npm run check
npm run parity:check
npm run preview
```

`npm run check` syntax-checks every JavaScript module, rebuilds the current root SDK, copies the IIFE
artifact, verifies that the React and vanilla visual styles remain identical, and creates a
production build. `npm run parity:check` runs only the stylesheet guard. Stop the development server
before starting preview because both use port `4174`.
