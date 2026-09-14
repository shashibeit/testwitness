# TestWitness Vue demo

> Every test has a story. Capture the proof.

This runnable Vue 3 + Vite application demonstrates a single app-level TestWitness lifecycle
across a realistic sign-in, dashboard, and access-request flow. Vue is used only by this example;
the SDK core remains framework independent.

## Run it

From this `examples/vue` directory:

```bash
npm install
npm run dev
```

The `dev` script first rebuilds the local `file:../..` SDK dependency, then starts the application at
<http://127.0.0.1:4174/login>.

Use only the synthetic credentials already entered:

```text
Email:    qa.vue@example.test
Password: DemoOnly!123
```

## Test the complete evidence flow

1. Find the Shadow DOM **TestWitness** toolbar in the bottom-right. Drag its header if it covers
   the application. Keyboard users can focus the move handle, use the arrow keys, hold Shift for a
   larger step, and press Home or Escape to reset it.
2. Leave **Capture video** off for a log/screenshot-only run. To test video, switch it on before
   selecting **Start with video**, choose **Browser Tab** in the native chooser, select this Vue demo
   tab, and confirm the toolbar says **Video: recording**.
3. Enable **Simulate rejected login (HTTP 401)** and submit. Capture a screenshot after the error is
   visible and optionally add a note such as `Rejected login handled correctly`.
4. Disable the failure option and sign in. The SPA moves to the dashboard without losing the active
   TestWitness session. Capture the loaded dashboard and select **Create demo warning**.
5. Open **Request access**, complete the policy checkbox, and submit the successful HTTP 201 path.
   Capture the confirmation and add the note `Access request succeeded`.
6. Enable **QA control: return HTTP 503**, submit again, and capture the failure state.
7. Select a result in the toolbar, choose **Stop session**, and wait for **Video: captured** when video
   was enabled. Then select **Download evidence**.
8. Extract the ZIP before opening `report.html`. Review the tester journey, screenshots, console
   warning/error, request filters, endpoint totals, notes, and optional `recording.webm`.

Request and response bodies and normal text-input values are disabled. Successful request metadata
is enabled only to demonstrate `network-requests.json` and the offline report's endpoint analysis.
Passwords, authorization/API-key/CSRF headers, and sensitive query parameters remain redacted.

## Integration pattern

[`src/main.ts`](./src/main.ts) mounts one root
[`TestWitnessProvider.vue`](./src/TestWitnessProvider.vue) around the application. The provider:

- creates one `TestWitness` instance in `onMounted`;
- enables the optional framework-independent Shadow DOM toolbar;
- keeps `video.enabled` false so the tester opts in for each session with the toolbar;
- subscribes to session summaries for a small integration-status indicator; and
- unsubscribes and calls `destroy()` from `onBeforeUnmount`.

The instance therefore survives every History API route change in [`App.vue`](./src/App.vue). Do not
create a separate instance inside each page component in a real Vue application. A full document
reload still clears MVP 1's in-memory evidence, so stop and download before reloading or leaving the
origin.

For runtime feature flags, conditionally mount this provider at the application shell. Turning the
flag off unmounts the provider and calls `destroy()`, which fully removes the toolbar, restores
instrumented browser APIs, stops media tracks, and clears in-memory evidence. Use the toolbar (or an
injected custom facade) to stop and download first when evidence must be retained. Turning the flag
back on mounts and initializes a fresh instance. Use `pauseSession()`/`resumeSession()` instead when
the tester only wants to suspend and continue the same session.

To hide the built-in toolbar and implement your own Vue controls, set `toolbar.enabled` to `false`,
provide the same app-level instance through Vue `provide`/`inject`, and call its public methods from
button handlers. Keep the video decision explicit:

```ts
await witness.startSession(sessionMetadata, { captureVideo: userSelectedVideo });
await witness.captureScreenshot('Access request completed');
witness.addNote('Successful access request verified');
await witness.stopSession('passed');
await witness.downloadEvidence();
```

## Video lifecycle and troubleshooting

The unchecked toolbar option means `startSession` does not request media. When selected, the session
asks for a tab and records it. Pausing the evidence session also pauses `MediaRecorder`; resuming
continues the same recording. Stopping finalizes and saves the WebM. Destroying the provider stops
all media tracks and releases the recording resources.

- Start video from the toolbar click so the browser has a current user gesture.
- Use localhost or HTTPS, allow display capture, and choose a browser tab rather than a window or
  full screen.
- Treat **Video: recording** as confirmation that capture started. The main evidence status can say
  `recording` even when video is off.
- Stop the session and wait for **Video: captured** before downloading so the final media chunk is
  included.
- After changing SDK source, restart `npm run dev` and hard-refresh the tab so Vite cannot serve an
  older local bundle.
- Real permission dialogs and WebM encoding require manual browser testing; unit tests use mocked
  media APIs.

## Validate a production build

```bash
npm run typecheck
npm run build
npm run preview
```

Stop the development server before preview because both commands use port `4174`.
