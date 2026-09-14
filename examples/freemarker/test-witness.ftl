<#ftl output_format="HTML" auto_esc=true>
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TestWitness — FreeMarker example</title>
    <#-- Deploy these two static files through the application's normal approved asset pipeline. -->
    <script src="/assets/vendor/testwitness.min.js" defer></script>
    <script src="/assets/test-witness-example.js" defer></script>
  </head>
  <body>
    <#--
      Server values are placed only in HTML attributes under FreeMarker HTML auto-escaping.
      They are never interpolated into JavaScript source. Do not add ?no_esc here.
    -->
    <main
      id="test-witness-example"
      data-application-name="${applicationName!'Sample Application'}"
      data-environment="${environment!'unknown'}"
      data-release-version="${releaseVersion!''}"
      data-tester-name="${(tester.name)!''}"
      data-tester-id="${(tester.employeeId)!''}"
      data-test-case-id="${(testCase.id)!''}"
      data-test-case-name="${(testCase.name)!''}"
      data-requirement-id="${requirementId!''}"
    >
      <h1>TestWitness FreeMarker integration</h1>
      <p>Every test has a story. Capture the proof.</p>
      <p>Status: <strong id="witness-status" aria-live="polite">initializing</strong></p>
      <p id="witness-message" role="status" aria-live="polite"></p>

      <button id="witness-start" type="button" disabled>Start session</button>
      <button id="witness-screenshot" type="button" disabled>Capture screenshot</button>
      <label>
        Tester note
        <input id="witness-note" value="Validated the successful login scenario">
      </label>
      <button id="witness-add-note" type="button" disabled>Add note</button>
      <label>
        Result
        <select id="witness-result" disabled>
          <option value="not-set">Not set</option>
          <option value="passed">Passed</option>
          <option value="failed">Failed</option>
          <option value="blocked">Blocked</option>
        </select>
      </label>
      <button id="witness-stop" type="button" disabled>Stop session</button>
      <button id="witness-download" type="button" disabled>Download ZIP</button>

      <section data-private>
        <h2>Server-rendered application content</h2>
        <p>Signed-in tester: ${((tester.name)!'Not supplied')}</p>
        <label>Password <input type="password" autocomplete="current-password"></label>
      </section>
    </main>
  </body>
</html>
