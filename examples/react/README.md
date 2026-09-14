# TestWitness realistic React demo

> Every test has a story. Capture the proof.

This example is a small live-style React single-page application named **Operations Portal**.
It has login, signup, dashboard, access-request, and profile-settings screens. TestWitness is
initialized once above the application and appears only as the floating Shadow DOM toolbar.

The application uses a local `"file:../.."` dependency, so it exercises the actual SDK build in this
repository. React is an example dependency only; the core package remains framework independent.

## Run the demo

From the `testwitness` repository root:

```bash
npm install
npm run build
cd examples/react
npm install
npm run dev
```

Open <http://127.0.0.1:4173/login>.

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
  triggers are intentionally coalesced), plus the manual screenshot taken after React renders the
  error;
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
3. Confirm the toolbar changes from **Video: requesting permission** to **Video: recording**. If it
   says **Video: unavailable**, inspect the toolbar warning and browser console.
4. Run the demo through HTTPS or localhost and check browser/OS enterprise display-capture policy.
   An embedded app also needs an appropriate `display-capture` Permissions Policy.
5. Select **Stop session** and wait for **Video: captured** before downloading the ZIP. This wait lets
   `MediaRecorder` deliver its final chunk. Verify that `recording.webm` is present and non-empty.

If you changed or pulled SDK source, rebuild the package, restart the example dev server, and
hard-refresh the browser tab:

```bash
# From the testwitness repository root
npm run build

# Then restart from examples/react
npm run dev
```

Vite or npm can otherwise continue serving an older cached local dependency. The automated unit
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

The application root owns the integration, not the individual pages:

```tsx
createRoot(rootElement).render(
  <StrictMode>
    <TestWitnessIntegration>
      <App />
    </TestWitnessIntegration>
  </StrictMode>,
);
```

`TestWitnessIntegration` creates exactly one SDK instance and initializes the floating toolbar:

```tsx
const config: TestWitnessConfig = {
  applicationName: 'Operations Portal',
  environment: 'QA',
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
};

useEffect(() => {
  const witness = new TestWitness(config);
  const initialization = witness.initialize();

  return () => {
    void initialization
      .catch(() => undefined)
      .then(async () => await witness.destroy())
      .catch(() => undefined);
  };
}, []);
```

See the complete Strict Mode-safe implementation in
[`TestWitnessExample.tsx`](./TestWitnessExample.tsx) and the application composition in
[`src/main.tsx`](./src/main.tsx).

## Apply the same pattern to a real React application

1. Install `@testwitness/core` in the real application.
2. Add one integration component at the application root or provider boundary.
3. Call `initialize()` once and `destroy()` during application cleanup.
4. Enable the toolbar, or expose that same instance through your own React context for custom
   controls. Never create a separate instance for every page.
5. Add `[data-private]` or your chosen mask selectors to customer, payment, account, and employee
   data containers.
6. Keep successful-request metadata, text-input values, and request/response bodies disabled unless
   an approved test objective requires them. Successful metadata is enabled in this synthetic demo
   to exercise the report's request and endpoint views.
7. Start the session from the tab containing the application, and choose that same tab for video.
8. Use normal SPA navigation so the instance remains mounted throughout the workflow.
9. Stop and download before any hard refresh, cross-origin navigation, or full-page logout redirect.

MVP 1 stores evidence only in memory. Client-side route changes are safe, but a full document reload
destroys the session and its evidence.

For custom controls instead of the supplied toolbar, make the video choice explicit per session:

```ts
await witness.startSession(sessionMetadata, { captureVideo: userSelectedVideo });
```

`captureVideo: false` never requests display permission. When omitted, the value of
`video.enabled` is used as the programmatic default.

## Local API behavior

The example Vite configuration supplies small in-process mock endpoints for `200`, `201`, `204`,
`401`, `500`, and `503` responses. They exist only to demonstrate realistic application calls,
successful-request metadata, and network-error evidence. They are not part of the SDK and no
TestWitness backend is required.

## Validate the example

```bash
npm run typecheck
npm run build
npm run preview
```

Stop the development server before starting preview because both use port `4173`.
