(() => {
  'use strict';

  const root = document.querySelector('#test-witness-example');
  const api = window.TestWitness;
  if (!root || !api || typeof api.TestWitness !== 'function') return;

  // dataset contains values decoded from HTML attributes. FreeMarker safely encoded them in the
  // HTML context, so values such as quotes or </script> never become executable source.
  const server = root.dataset;
  const witness = new api.TestWitness({
    applicationName: server.applicationName,
    environment: server.environment,
    releaseVersion: server.releaseVersion || undefined,
    tester: {
      name: server.testerName || undefined,
      employeeId: server.testerId || undefined,
    },
    session: {
      testCaseId: server.testCaseId || undefined,
      testCaseName: server.testCaseName || undefined,
      requirementId: server.requirementId || undefined,
    },
    screenshot: { enabled: true, format: 'png' },
    video: { enabled: true, includeAudio: false, maxDurationMinutes: 10 },
    privacy: { maskSelectors: ['[data-private]'] },
    toolbar: { enabled: false },
  });

  const elements = {
    status: document.querySelector('#witness-status'),
    message: document.querySelector('#witness-message'),
    start: document.querySelector('#witness-start'),
    screenshot: document.querySelector('#witness-screenshot'),
    note: document.querySelector('#witness-note'),
    addNote: document.querySelector('#witness-add-note'),
    result: document.querySelector('#witness-result'),
    stop: document.querySelector('#witness-stop'),
    download: document.querySelector('#witness-download'),
  };
  let busy = true;

  function refresh() {
    const status = witness.getSessionStatus();
    const active = status === 'recording' || status === 'paused';
    elements.status.textContent = status;
    elements.start.disabled = busy || active;
    elements.screenshot.disabled = busy || status !== 'recording';
    elements.addNote.disabled = busy || !active;
    elements.result.disabled = busy || !active;
    elements.stop.disabled = busy || !active;
    elements.download.disabled = busy || status !== 'stopped';
  }

  async function run(operation) {
    busy = true;
    elements.message.textContent = '';
    refresh();
    try {
      await operation();
    } catch (error) {
      elements.message.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false;
      refresh();
    }
  }

  elements.start.addEventListener('click', () => {
    void run(async () => {
      await witness.startSession({
        testCaseId: server.testCaseId || undefined,
        testCaseName: server.testCaseName || undefined,
        requirementId: server.requirementId || undefined,
        testerName: server.testerName || undefined,
        testerEmployeeId: server.testerId || undefined,
      });
      elements.message.textContent = 'Session started. Approve tab sharing if prompted.';
    });
  });
  elements.screenshot.addEventListener('click', () => {
    void run(async () => {
      await witness.captureScreenshot('Login completed');
      elements.message.textContent = 'Screenshot captured.';
    });
  });
  elements.addNote.addEventListener('click', () => {
    void run(() => {
      witness.addNote(elements.note.value || 'Validated the successful login scenario');
      elements.note.value = '';
      elements.message.textContent = 'Note added.';
    });
  });
  elements.result.addEventListener('change', () => {
    if (witness.getSessionStatus() === 'recording' || witness.getSessionStatus() === 'paused') {
      witness.setSessionResult(elements.result.value);
    }
  });
  elements.stop.addEventListener('click', () => {
    void run(async () => {
      witness.setSessionResult(elements.result.value);
      await witness.stopSession();
      elements.message.textContent = 'Session stopped.';
    });
  });
  elements.download.addEventListener('click', () => {
    void run(async () => {
      await witness.downloadEvidence();
      elements.message.textContent = 'Evidence download started.';
    });
  });

  window.addEventListener(
    'pagehide',
    () => {
      void witness.destroy();
    },
    { once: true },
  );

  void run(async () => {
    await witness.initialize();
    elements.message.textContent = 'Ready.';
  });
})();
