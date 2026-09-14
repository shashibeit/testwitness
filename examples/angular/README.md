# TestWitness Angular example

> Every test has a story. Capture the proof.

This is a runnable standalone Angular application that consumes `@testwitness/core` through the
local `file:../..` package. It presents a small temporary-access workflow plus two ways to operate
the same SDK instance:

- the built-in, movable Shadow DOM toolbar in the bottom-right corner; and
- Angular controls backed by a root-scoped `TestWitnessService`.

The example has no application backend. A successful request reads
`public/demo-api/success.json`; the failure option requests a deliberately absent JSON asset so the
development server returns an HTTP failure for network evidence.

## Run it

From this directory:

```bash
npm install
npm start
```

Open <http://127.0.0.1:4200>. The start script builds the SDK at the repository root before starting
Angular's development server, so imports resolve from the local package's real `dist` artifacts.

Other useful commands:

```bash
npm run typecheck
npm run build
```

The production application is emitted under `dist/testwitness-angular-example/`.

## Suggested QA flow

1. Leave **Ask to record this browser tab** unchecked for a screenshot-only session, or check it to
   opt in to video.
2. Select **Start session**. If video was selected, approve the browser's required display-capture
   prompt and choose this tab. The library never bypasses that prompt.
3. Change the system, access level, or justification and submit the request. The successful path
   records request metadata because this example explicitly enables `captureSuccessfulRequests`.
4. Enable the synthetic-failure option and submit again to create an HTTP/network record and a
   sanitized `console.error`. Error-triggered screenshot capture is enabled for the demo.
5. Select **Capture screenshot** and add a tester note. The employee card is masked, the custom
   evidence panel is excluded, and the floating TestWitness toolbar hides during DOM screenshot
   rendering.
6. Choose Passed, Failed, Blocked, or Not set; stop the session; then download the ZIP.
7. Open `report.html` inside the ZIP to review the offline report and captured evidence.

You can perform the same lifecycle with the floating toolbar. Its **Capture video** checkbox is also
off by default. Both interfaces control the one root-scoped SDK instance, so never start a session
from both at the same time.

Video selection is per session. This example keeps `video.enabled: false` as the configuration
fallback and passes the visible checkbox explicitly as `{ captureVideo }` on every custom start:

- `captureVideo: false` starts immediately and never opens the display-capture prompt;
- `captureVideo: true` requests permission for that session only; and
- omitting the option would fall back to `video.enabled`.

Pausing a session pauses the active `MediaRecorder` as well as action, console, and network capture.
Stopping finalizes buffered WebM data and stops every display-media track before the ZIP becomes
downloadable. Download before calling `destroy()`: destruction is terminal for this service instance
and deliberately clears its in-memory evidence as it removes the toolbar and restores all patched
browser APIs.

## Integration design

[`src/app/test-witness.service.ts`](src/app/test-witness.service.ts) uses
`@Injectable({ providedIn: 'root' })` and creates exactly one `TestWitness`. It:

- initializes the SDK once and exposes Angular read-only signals for status updates;
- calls `startSession(metadata, { captureVideo })` directly from the component's click path so the
  browser retains user activation for `getDisplayMedia`;
- exposes screenshot, note, pause/resume, result, stop, and download operations; and
- calls `destroy()` from `ngOnDestroy`, restoring patched console/fetch/XHR methods, listeners, media
  tracks, object URLs, and the toolbar.

[`src/app/app.component.ts`](src/app/app.component.ts) initializes the service in `ngOnInit` and also
destroys it when the root component is torn down (for example during hot replacement). The service's
cleanup is idempotent, so Angular injector teardown is safe as well.

This runnable project is browser-only. If the same service is copied into an Angular SSR or hydration
application, inject `PLATFORM_ID`, guard construction with `isPlatformBrowser(platformId)`, and make
browser-only methods reject clearly when no SDK instance exists. Do not construct `TestWitness` or
mount its toolbar during server rendering. Keep that guarded service root-scoped so routed components
share one recorder and one session-state source.

The relevant privacy-first configuration is:

```ts
const config: TestWitnessConfig = {
  applicationName: 'Angular Access Review Demo',
  environment: 'local-demo',
  video: { enabled: false, includeAudio: false, maxDurationMinutes: 5 },
  network: {
    enabled: true,
    captureSuccessfulRequests: true,
    captureRequestBody: false,
    captureResponseBody: false,
  },
  privacy: {
    maskSelectors: ['[data-private]'],
    excludeSelectors: ['[data-witness-controls]'],
    sensitiveFieldNames: ['approvalPin'],
  },
  toolbar: { enabled: true, position: 'bottom-right' },
};
```

Request and response bodies stay disabled. The PIN uses `type="password"` and a configured sensitive
name, so its value is never recorded. The values in this example are synthetic; do not capture real
production or customer data without your organization's approval.

## Browser notes

- Run from `localhost` or HTTPS. Display capture generally requires a secure context, a focused page,
  and a user click.
- Screenshot masking applies to the DOM screenshot renderer only. Browser-tab video records whatever
  the tester shares, including the toolbar and visible sensitive content. Prepare the tab before
  approving video capture.
- Evidence is memory-only in MVP 1. A full reload or document navigation discards an active session,
  so stop and download before leaving the page.
- The missing-asset failure is intended for `ng serve`. A custom production server may rewrite that
  URL to the application shell instead of returning 404; use an approved test endpoint when adapting
  this example to a real application.
