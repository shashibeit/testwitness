# Angular integration

> TestWitness — Every test has a story. Capture the proof.

Install the package in the Angular application:

```bash
npm install @testwitness/core
```

Copy or adapt `test-witness.service.ts` and provide `TEST_WITNESS_CONFIG` at the component or feature
boundary. `test-witness-demo.component.ts` shows a standalone component with a component-scoped
service. Angular destroys that service when the component is removed, so its `ngOnDestroy()` calls
`TestWitness.destroy()` and restores listeners, patched APIs, object URLs, and media tracks.

The service uses `isPlatformBrowser` and does not construct TestWitness during server-side rendering.
Call `initialize()` in `ngOnInit`, but call `startSession()` directly from a click handler: browsers
only allow `getDisplayMedia` to show its tab-selection prompt during a user activation. The sample
keeps video disabled by default and passes the checkbox value as the per-session choice. It also
pauses/resumes, captures a screenshot and note, sets a result before stopping, and downloads the
completed ZIP.

For an application-wide singleton, provide the service at the root instead. In that arrangement, call
`destroy()` from the application shell's teardown rather than from every routed component. Only one
session can be active across TestWitness instances.

For a complete runnable standalone Angular application, use [`../angular`](../angular/). To disable
the tool at runtime, first stop and download any evidence that must be retained, then call the
service's `destroy()` method. Create and initialize a new root-scoped service instance when the
feature is enabled again.
