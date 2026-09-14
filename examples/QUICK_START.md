# Framework quick-start guide

> TestWitness — Every test has a story. Capture the proof.

These examples show the same recommended integration pattern in React, Angular, Vue, and plain
JavaScript: create one `TestWitness` instance at the application root, initialize it once, keep it
alive while the tester moves between application screens, and destroy it during application
teardown.

The demos use the package in this repository through `"@testwitness/core": "file:../.."`. In an
application that consumes a published package, replace that local dependency with:

```bash
npm install @testwitness/core
```

## Prerequisites

- Node.js 20.19 or newer
- npm
- Chrome, Microsoft Edge, or Firefox for manual capture testing
- `http://localhost`/`http://127.0.0.1` or HTTPS when browser-tab video is enabled

Build and validate the SDK first:

```bash
cd testwitness
npm ci
npm run validate
```

## What to test in every example

1. Open the example and find its **TestWitness** evidence controls. Examples that enable the
   built-in toolbar show it as a movable floating panel.
2. Leave **Capture video** off for the first session, then select **Start session** or the built-in
   **Start without video** action.
3. Use the sample login, signup, dashboard, and form interactions.
4. Select **Capture screenshot** at an important checkpoint. The screenshot count should increase.
5. Add a note, choose a result, and stop the session.
6. Download and extract the ZIP. Open `report.html` from the extracted directory.
7. Start a second session with **Capture video** on. From the browser chooser, explicitly select the
   tab to record. Stop and confirm that the ZIP contains `recording.webm`.

Video permission and real display recording must be tested manually. Unit tests mock those browser
APIs and cannot approve the browser chooser.

## React quick start

Run the complete React/Vite application:

```bash
cd testwitness/examples/react
npm install
npm run dev
```

Open the URL printed by Vite. The demo's application-root integration is implemented in
[`TestWitnessExample.tsx`](./react/TestWitnessExample.tsx), and
[`src/main.tsx`](./react/src/main.tsx) mounts it above the application routes. This placement keeps
one evidence session alive while the tester moves among login, signup, dashboard, and form views.

To use the same pattern in another React application:

1. Install `@testwitness/core`.
2. Create one integration/provider component at the application root.
3. Construct `TestWitness` inside a root `useEffect` and call `initialize()`.
4. Subscribe with `onSummary()` if application controls need live status.
5. Unsubscribe and call `destroy()` in effect cleanup.
6. Start video only from a direct button click.

Do not create a witness in every screen component. React development Strict Mode remounts effects,
so make initialization cleanup asynchronous-safe as demonstrated by the example.

Validate its production bundle with:

```bash
npm run build
```

See the [React walkthrough](./react/README.md) for the full click-by-click test scenario.

## Angular quick start

Run the complete standalone Angular application:

```bash
cd testwitness/examples/angular
npm install
npm start
```

Open <http://127.0.0.1:4200>. The example wraps the framework-independent SDK in a root-scoped
Angular service. The application component initializes that service once and delegates capture
buttons to it.

To use the same pattern in another Angular application:

1. Install `@testwitness/core`.
2. Create an `@Injectable({ providedIn: 'root' })` service that owns one `TestWitness` instance.
3. Call the service's initialization method from the browser-rendered root component.
4. Expose typed methods for start, pause/resume, screenshot, note, result, stop, and download.
5. Call `destroy()` from the service/application teardown path.
6. Guard access to `window` when the application uses Angular SSR.

Keep the service root-scoped rather than providing it separately on each route. That allows a
single evidence session to follow Angular Router navigation.

Validate it with:

```bash
npm run typecheck
npm run build
```

See the [Angular example README](./angular/README.md) for its source map and test walkthrough.

## Vue quick start

Run the complete Vue 3/Vite application:

```bash
cd testwitness/examples/vue
npm install
npm run dev
```

Open the URL printed by Vite. The demo owns one SDK instance in an application-level provider and
exposes reactive integration status in the application shell.

To use the same pattern in another Vue application:

1. Install `@testwitness/core`.
2. Create one provider/composable at the application shell, outside individual route views.
3. Construct and initialize `TestWitness` from `onMounted()`.
4. Subscribe to `onSummary()` to update Vue refs used by custom controls.
5. Unsubscribe and destroy the witness from `onBeforeUnmount()`.
6. Invoke video-enabled start directly from a tester's click.

Validate it with:

```bash
npm run typecheck
npm run build
```

See the [Vue example README](./vue/README.md) for the complete integration.

## Plain HTML and JavaScript quick start

Build/sync the SDK and run the static example server:

```bash
cd testwitness/examples/vanilla
npm install
npm run dev
```

Open the URL printed by the server. This example loads the IIFE bundle with a `<script>` tag and
uses `window.TestWitness.TestWitness`; the host application does not need a bundler.

For an existing static or server-rendered application:

1. Copy `dist/testwitness.min.js` to an application-controlled static asset directory.
2. Load it after the page content with `<script src="/assets/testwitness.min.js"></script>`.
3. Construct one witness and call `initialize()` after the DOM is available.
4. Wire session methods to native click handlers.
5. Keep the same page loaded during an in-memory session.
6. Stop and download before navigation unloads the document.
7. Call `destroy()` from `pagehide` or when a feature flag disables the integration.

The same browser-bundle approach works with JSP, Thymeleaf, FreeMarker/FTL, and AngularJS. See the
[AngularJS](./angularjs/README.md) and [FreeMarker](./freemarker/README.md) examples for safe wrapper
patterns.

## Enable and disable capture while the application is running

“Enabled” can mean different things. Choose the smallest lifecycle action that matches the tester's
intent:

| Tester or application intent                    | API action                                     |
| ----------------------------------------------- | ---------------------------------------------- |
| Make the tool available                         | Construct one instance and call `initialize()` |
| Begin a new evidence session                    | `startSession(metadata, { captureVideo })`     |
| Temporarily suspend an active session           | `pauseSession()`                               |
| Continue that same session                      | `resumeSession()`                              |
| Finish capture but keep evidence for exporting  | `stopSession(result)`                          |
| Export the completed evidence                   | `downloadEvidence()`                           |
| Fully remove/disable the tool and restore hooks | `destroy()`                                    |

Use a singleton controller behind a feature flag:

```ts
import { TestWitness, type TestWitnessConfig } from '@testwitness/core';

const config: TestWitnessConfig = {
  applicationName: 'Customer Portal',
  environment: 'QA',
  toolbar: { enabled: true },
  video: { enabled: false },
};

let witness: TestWitness | undefined;

export async function enableEvidenceCapture(): Promise<void> {
  if (witness) return;
  const next = new TestWitness(config);
  try {
    await next.initialize();
    witness = next;
  } catch (error) {
    await next.destroy();
    throw error;
  }
}

export async function disableEvidenceCapture(saveFirst = true): Promise<void> {
  const current = witness;
  if (!current) return;

  try {
    const status = current.getSessionStatus();
    if (status === 'recording' || status === 'paused') {
      await current.stopSession();
    }
    if (saveFirst && current.getSessionStatus() === 'stopped') {
      await current.downloadEvidence();
    }
  } finally {
    await current.destroy();
    if (witness === current) witness = undefined;
  }
}
```

Call these functions from the framework's root integration:

- React: mount or unmount the root provider when the feature flag changes.
- Angular: call them through a root-provided service.
- Vue: call them through the application provider/composable.
- Vanilla JavaScript: call them directly from a feature-toggle button or configuration listener.

`destroy()` clears evidence held only in memory. Stop and download first if it must be retained.
Avoid rapid feature-flag toggling by disabling the flag control until the asynchronous operation
finishes.

### Video can be selected per session

Keep video disabled by default in configuration and pass the current UI choice when starting:

```ts
await witness.startSession(sessionMetadata, {
  captureVideo: captureVideoCheckbox.checked,
});
```

The start call must run directly in the tester's click handler when `captureVideo` is `true`. Video
cannot be turned on halfway through a session because the browser requires a new user-mediated
display-sharing request. Stop the current session and start another one to change that choice.

If the tester rejects permission or manually ends sharing, the session continues without video;
screenshots, actions, notes, console entries, and network evidence remain available.

### Screenshot capture can be manual and automatic

Manual capture is always explicit:

```ts
await witness.captureScreenshot('Checkout completed');
```

Automatic capture is configured before initialization:

```ts
const witness = new TestWitness({
  applicationName: 'Customer Portal',
  environment: 'QA',
  screenshot: {
    enabled: true,
    captureOnNavigation: true,
    captureOnError: true,
    autoCaptureIntervalSeconds: 0,
  },
});
```

Use automatic screenshots sparingly because evidence is held in memory. Keep sensitive selectors
masked, and remember that screenshot masks do not redact the separately recorded browser-tab video.

## Before publishing the repository

1. Run `npm run validate` at the SDK root.
2. Run `npm run examples:install` and `npm run examples:build` at the SDK root.
3. Manually verify screenshot, browser permission, recording playback, and ZIP download in each
   managed browser your organization supports.
4. Confirm CSP and `display-capture` Permissions Policy requirements with the host application team.
5. Keep credentials and real customer data out of examples and generated evidence.
6. Review the repository's MIT license and third-party notice requirements before distribution.
