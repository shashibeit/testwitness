# AngularJS quick start

> TestWitness — Every test has a story. Capture the proof.

This example demonstrates the browser IIFE bundle in an AngularJS 1.8 application. It intentionally
keeps AngularJS out of the SDK package.

## Run it

From the repository root:

```bash
npm install
npm run build
npx http-server . -p 8080 -c-1
```

Open <http://127.0.0.1:8080/examples/angularjs/>. The page loads AngularJS from Google's CDN for
demo convenience; self-host an approved AngularJS asset in an enterprise application.

## Test an evidence session

1. Optionally select **Capture browser-tab video**. It is off by default.
2. Select **Start session**. For video, choose **Browser Tab**, select this tab, and approve sharing.
3. Confirm the session is `recording` and, when requested, video is `recording`.
4. Interact with the demo form, capture a screenshot, and add a note.
5. Pause and resume to verify temporary capture control.
6. Choose a result, stop the session, and download the ZIP.
7. Extract it and open `report.html`.

The wrapper lives in `test-witness.service.js`. It owns one `TestWitness` instance, adapts native
promises through `$q`, and destroys the instance with its AngularJS scope. The direct click path to
`startSession(..., { captureVideo })` is important because browsers require a user gesture for the
display-sharing chooser.
