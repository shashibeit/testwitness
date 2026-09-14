(() => {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const ui = {
    application: byId('application'),
    start: byId('start-session'),
    captureVideo: byId('capture-video'),
    pause: byId('pause-session'),
    screenshot: byId('capture-screenshot'),
    screenshotLabel: byId('screenshot-label'),
    note: byId('tester-note'),
    addNote: byId('add-note'),
    result: byId('session-result'),
    stop: byId('stop-session'),
    download: byId('download-evidence'),
    status: byId('session-status'),
    duration: byId('duration'),
    videoStatus: byId('video-status'),
    screenshotCount: byId('screenshot-count'),
    actionCount: byId('action-count'),
    message: byId('operation-message'),
    warnings: byId('warning-list'),
  };

  const requiredElements = Object.entries(ui).filter(
    ([, element]) => !(element instanceof Element),
  );
  if (requiredElements.length > 0) {
    throw new Error(`Demo markup is missing: ${requiredElements.map(([name]) => name).join(', ')}`);
  }

  const state = {
    ready: false,
    busy: false,
    dashboardRange: '30 days',
    signedIn: false,
    flash: undefined,
  };

  let witness;
  let latestSummary;
  let removeSummaryListener = () => undefined;
  let removeWarningListener = () => undefined;
  let durationTimer;
  let teardownStarted = false;

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function currentRoute() {
    const route = window.location.hash.replace(/^#\/?/, '');
    return ['login', 'signup', 'dashboard', 'access-request'].includes(route) ? route : 'login';
  }

  function navigate(route) {
    const nextHash = `#/${route}`;
    if (window.location.hash === nextHash) renderRoute();
    else window.location.hash = nextHash;
  }

  function setFlash(kind, message) {
    state.flash = { kind, message };
  }

  function flashMarkup() {
    if (!state.flash) return '';
    const flash = state.flash;
    state.flash = undefined;
    return `<div class="app-alert ${escapeHtml(flash.kind)}" role="status">${escapeHtml(
      flash.message,
    )}</div>`;
  }

  function loginPage() {
    return `
      <section class="auth-layout" aria-labelledby="login-title">
        <div class="auth-copy">
          <p class="eyebrow">Secure member access</p>
          <h2 id="login-title">Welcome back</h2>
          <p>Review benefits, recent claims, and access requests in one place.</p>
          <ul class="feature-list">
            <li>View account activity</li>
            <li>Request application access</li>
            <li>Manage notification preferences</li>
          </ul>
        </div>
        <form id="login-form" class="form-card">
          <div>
            <p class="eyebrow">Demo scenario</p>
            <h3>Sign in to your account</h3>
          </div>
          ${flashMarkup()}
          <label for="login-email">Work email</label>
          <input
            id="login-email"
            name="email"
            type="email"
            data-testid="login-email"
            autocomplete="username"
            value="qa.tester@example.test"
            required
          />
          <label for="login-password">Password</label>
          <input
            id="login-password"
            name="password"
            type="password"
            data-testid="login-password"
            autocomplete="current-password"
            value="DemoOnly!123"
            required
          />
          <label class="check-row compact" for="remember-me">
            <input id="remember-me" name="remember" type="checkbox" />
            <span>Remember this browser</span>
          </label>
          <label class="check-row helper-option" for="fail-login" data-demo-helper>
            <input id="fail-login" name="failLogin" type="checkbox" />
            <span>
              <strong>QA: return HTTP 401</strong>
              <small>Creates a failed Fetch request and console error for the evidence report.</small>
            </span>
          </label>
          <button class="button primary wide" type="submit">Sign in</button>
          <p class="form-footer">New here? <a href="#/signup">Create an account</a>.</p>
        </form>
      </section>`;
  }

  function signupPage() {
    return `
      <section class="content-page narrow" aria-labelledby="signup-title">
        <div class="page-heading">
          <div>
            <p class="eyebrow">New member</p>
            <h2 id="signup-title">Create your account</h2>
            <p>All values in this local demo must be synthetic.</p>
          </div>
          <a class="text-link" href="#/login">Back to login</a>
        </div>
        ${flashMarkup()}
        <form id="signup-form" class="form-card two-column-form">
          <div class="field-span">
            <h3>Account information</h3>
          </div>
          <div>
            <label for="signup-first-name">First name</label>
            <input id="signup-first-name" name="firstName" value="Taylor" required />
          </div>
          <div>
            <label for="signup-last-name">Last name</label>
            <input id="signup-last-name" name="lastName" value="Tester" required />
          </div>
          <div class="field-span">
            <label for="signup-email">Email</label>
            <input
              id="signup-email"
              name="email"
              type="email"
              autocomplete="username"
              value="taylor.tester@example.test"
              required
            />
          </div>
          <div>
            <label for="signup-password">Password</label>
            <input
              id="signup-password"
              name="password"
              type="password"
              autocomplete="new-password"
              value="Synthetic!456"
              required
            />
          </div>
          <div>
            <label for="signup-confirm-password">Confirm password</label>
            <input
              id="signup-confirm-password"
              name="confirmPassword"
              type="password"
              autocomplete="new-password"
              value="Synthetic!456"
              required
            />
          </div>
          <label class="check-row compact field-span" for="accept-policy">
            <input id="accept-policy" name="acceptPolicy" type="checkbox" required />
            <span>I accept the synthetic demo policy.</span>
          </label>
          <button class="button primary field-span" type="submit">Create account</button>
        </form>
      </section>`;
  }

  function dashboardPage() {
    const range = escapeHtml(state.dashboardRange);
    return `
      <section class="content-page" aria-labelledby="dashboard-title">
        <div class="page-heading">
          <div>
            <p class="eyebrow">Member overview</p>
            <h2 id="dashboard-title">Good morning, Taylor</h2>
            <p>Here is the synthetic account activity for the last ${range}.</p>
          </div>
          <button id="sign-out" class="button ghost" type="button">Sign out</button>
        </div>
        ${flashMarkup()}
        <div class="filter-row" role="group" aria-label="Dashboard date range">
          <span>Show activity for</span>
          <button class="filter-button" type="button" data-range="7 days" aria-pressed="${
            state.dashboardRange === '7 days'
          }">7 days</button>
          <button class="filter-button" type="button" data-range="30 days" aria-pressed="${
            state.dashboardRange === '30 days'
          }">30 days</button>
        </div>
        <div class="metric-grid">
          <article class="metric-card">
            <span>Open requests</span>
            <strong>2</strong>
            <small>One awaiting approval</small>
          </article>
          <article class="metric-card" data-private>
            <span>Member reimbursement</span>
            <strong>$1,284.50</strong>
            <small>Private value masked in screenshots</small>
          </article>
          <article class="metric-card">
            <span>Tasks due</span>
            <strong>3</strong>
            <small>Next due tomorrow</small>
          </article>
        </div>
        <div class="dashboard-grid">
          <article class="data-card">
            <div class="card-heading">
              <div>
                <p class="eyebrow">Recent activity</p>
                <h3>Requests and approvals</h3>
              </div>
              <a href="#/access-request">New request</a>
            </div>
            <ul class="activity-list">
              <li><span class="activity-icon success">✓</span><span><strong>Analytics access approved</strong><small>Today at 9:14 AM</small></span></li>
              <li><span class="activity-icon pending">…</span><span><strong>Claims workspace pending</strong><small>Yesterday at 3:42 PM</small></span></li>
              <li><span class="activity-icon neutral">i</span><span><strong>Profile preferences updated</strong><small>August 28 at 11:05 AM</small></span></li>
            </ul>
          </article>
          <article class="data-card qa-card" data-demo-helper>
            <p class="eyebrow">QA-only control</p>
            <h3>Generate observable failures</h3>
            <p>Record a sanitized HTTP 503 and console error without leaving the demo.</p>
            <button id="run-health-check" class="button secondary" type="button">
              Run failing health check
            </button>
          </article>
        </div>
      </section>`;
  }

  function accessRequestPage() {
    return `
      <section class="content-page narrow" aria-labelledby="request-title">
        <div class="page-heading">
          <div>
            <p class="eyebrow">Access management</p>
            <h2 id="request-title">Request application access</h2>
            <p>Submit a realistic form and capture its confirmation or failure state.</p>
          </div>
          <a class="text-link" href="#/dashboard">Back to dashboard</a>
        </div>
        ${flashMarkup()}
        <form id="access-request-form" class="form-card two-column-form">
          <input type="hidden" name="csrf_token" value="never-capture-this-token" />
          <div class="field-span">
            <label for="application-name">Application</label>
            <select id="application-name" name="application" required>
              <option value="">Choose an application</option>
              <option value="claims">Claims Workspace</option>
              <option value="analytics">Analytics Hub</option>
              <option value="documents">Document Center</option>
            </select>
          </div>
          <div>
            <label for="access-level">Access level</label>
            <select id="access-level" name="accessLevel" required>
              <option value="viewer">Viewer</option>
              <option value="contributor">Contributor</option>
              <option value="administrator">Administrator</option>
            </select>
          </div>
          <div>
            <label for="expiration-date">Expiration date</label>
            <input id="expiration-date" name="expirationDate" type="date" value="2026-12-31" />
          </div>
          <div class="field-span" data-private>
            <label for="customer-reference">Synthetic customer reference</label>
            <input
              id="customer-reference"
              name="customerReference"
              value="DEMO-CUSTOMER-9081"
            />
            <small>This field is masked in screenshots via <code>privacy.maskSelectors</code>.</small>
          </div>
          <div class="field-span">
            <label for="justification">Business justification</label>
            <textarea
              id="justification"
              name="justification"
              rows="4"
              placeholder="Use synthetic information only"
              required
            >Validate the quarterly reporting workflow.</textarea>
            <small>TestWitness records that this value changed, not the complete free text.</small>
          </div>
          <label class="check-row compact field-span" for="manager-approved">
            <input id="manager-approved" name="managerApproved" type="checkbox" required />
            <span>I confirm manager approval was received.</span>
          </label>
          <label class="check-row helper-option field-span" for="fail-request" data-demo-helper>
            <input id="fail-request" name="failRequest" type="checkbox" />
            <span>
              <strong>QA: return HTTP 503</strong>
              <small>Exercises failed-request capture while preserving normal Fetch behavior.</small>
            </span>
          </label>
          <button class="button primary field-span" type="submit">Submit access request</button>
        </form>
      </section>`;
  }

  function renderRoute() {
    const route = currentRoute();
    const pageFactories = {
      login: loginPage,
      signup: signupPage,
      dashboard: dashboardPage,
      'access-request': accessRequestPage,
    };
    document.title = `${route.replace('-', ' ')} — Member Services`;
    ui.application.innerHTML = pageFactories[route]();
    ui.application.removeAttribute('aria-busy');
    for (const link of document.querySelectorAll('[data-route]')) {
      if (link instanceof HTMLElement) {
        const active = link.dataset.route === route;
        link.classList.toggle('active', active);
        if (active) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      }
    }
  }

  function setApplicationBusy(isBusy) {
    ui.application.toggleAttribute('aria-busy', isBusy);
    for (const control of ui.application.querySelectorAll('button, input, select, textarea')) {
      if (
        control instanceof HTMLButtonElement ||
        control instanceof HTMLInputElement ||
        control instanceof HTMLSelectElement ||
        control instanceof HTMLTextAreaElement
      ) {
        control.disabled = isBusy;
      }
    }
  }

  async function requestDemoApi(path, options = {}) {
    const response = await window.fetch(path, {
      ...options,
      headers: {
        authorization: 'Bearer synthetic-demo-access-token',
        'content-type': 'application/json',
        'x-api-key': 'synthetic-demo-api-key',
        ...options.headers,
      },
    });
    const payload = await response.json();
    if (!response.ok) {
      const error = new Error(payload.message || `Request failed with HTTP ${response.status}.`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function formDataObject(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  async function handleLogin(form) {
    setApplicationBusy(true);
    const values = formDataObject(form);
    const fail = values.failLogin === 'on';
    try {
      await requestDemoApi(`/api/demo/login?fail=${fail ? '1' : '0'}&session_id=demo-secret`, {
        method: 'POST',
        body: JSON.stringify(values),
      });
      state.signedIn = true;
      setFlash('success', 'Signed in successfully. The dashboard is ready for validation.');
      navigate('dashboard');
    } catch (error) {
      console.error('Demo login request failed.', error);
      setFlash('error', `Sign-in rejected: ${error.message}`);
      renderRoute();
    }
  }

  function handleSignup() {
    state.signedIn = true;
    setFlash('success', 'Synthetic account created. Password fields were not captured.');
    navigate('dashboard');
  }

  async function handleAccessRequest(form) {
    setApplicationBusy(true);
    const values = formDataObject(form);
    const fail = values.failRequest === 'on';
    try {
      await requestDemoApi(
        `/api/demo/access-requests?fail=${fail ? '1' : '0'}&access_token=demo-secret`,
        {
          method: 'POST',
          headers: { 'x-csrf-token': 'synthetic-demo-csrf-token' },
          body: JSON.stringify(values),
        },
      );
      setFlash('success', 'Access request AR-1042 was submitted for approval.');
    } catch (error) {
      console.error('Demo access request failed.', error);
      setFlash('error', `Access request was not submitted: ${error.message}`);
    }
    renderRoute();
  }

  async function runFailingHealthCheck() {
    setApplicationBusy(true);
    try {
      await requestDemoApi('/api/demo/health?fail=1&token=demo-secret');
    } catch (error) {
      console.error('Synthetic dependency health check failed.', error);
      setFlash('error', `Expected health-check failure captured: ${error.message}`);
    }
    renderRoute();
  }

  ui.application.addEventListener('submit', (event) => {
    if (!(event.target instanceof HTMLFormElement)) return;
    event.preventDefault();
    state.flash = undefined;
    if (event.target.id === 'login-form') void handleLogin(event.target);
    if (event.target.id === 'signup-form') handleSignup();
    if (event.target.id === 'access-request-form') void handleAccessRequest(event.target);
  });

  ui.application.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('button') : undefined;
    if (!(target instanceof HTMLButtonElement)) return;
    if (target.dataset.range) {
      state.dashboardRange = target.dataset.range;
      setFlash('success', `Dashboard changed to ${target.dataset.range}.`);
      renderRoute();
    }
    if (target.id === 'run-health-check') void runFailingHealthCheck();
    if (target.id === 'sign-out') {
      state.signedIn = false;
      setFlash(
        'success',
        'Signed out. The active TestWitness session continues across this route.',
      );
      navigate('login');
    }
  });

  window.addEventListener('hashchange', renderRoute);

  function formatDuration(durationMs) {
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds]
      .filter((_, index) => hours > 0 || index > 0)
      .map((part) => String(part).padStart(2, '0'))
      .join(':');
  }

  function setOperationMessage(message, kind = 'info') {
    ui.message.textContent = message;
    ui.message.dataset.kind = kind;
  }

  function updateControls(summary = latestSummary) {
    if (!summary) {
      ui.start.disabled = !state.ready || state.busy;
      return;
    }
    latestSummary = summary;
    const active = summary.status === 'recording' || summary.status === 'paused';
    const recording = summary.status === 'recording';
    ui.status.textContent = summary.status;
    ui.status.dataset.status = summary.status;
    ui.duration.textContent = formatDuration(summary.durationMs);
    ui.videoStatus.textContent = summary.videoStatus;
    ui.videoStatus.dataset.videoStatus = summary.videoStatus;
    ui.screenshotCount.textContent = String(summary.evidence.screenshots);
    ui.actionCount.textContent = String(summary.evidence.actions);
    ui.start.disabled = !state.ready || state.busy || active;
    ui.start.textContent = summary.status === 'stopped' ? 'Start new session' : 'Start session';
    ui.captureVideo.disabled = state.busy || active;
    ui.pause.disabled = state.busy || !active;
    ui.pause.textContent = summary.status === 'paused' ? 'Resume' : 'Pause';
    ui.screenshot.disabled = state.busy || !recording;
    ui.screenshotLabel.disabled = state.busy || !recording;
    ui.note.disabled = state.busy || !active;
    ui.addNote.disabled = state.busy || !active;
    ui.result.disabled = state.busy || !active;
    ui.stop.disabled = state.busy || !active;
    ui.download.disabled = state.busy || summary.status !== 'stopped';
  }

  async function run(operation) {
    if (state.busy) return;
    state.busy = true;
    updateControls();
    try {
      await operation();
    } catch (error) {
      console.error('TestWitness demo operation failed.', error);
      setOperationMessage(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      state.busy = false;
      if (witness) updateControls(witness.getSessionSummary());
    }
  }

  function addWarning(warning) {
    const item = document.createElement('li');
    item.textContent = `${warning.code}: ${warning.message}`;
    ui.warnings.prepend(item);
    while (ui.warnings.children.length > 4) ui.warnings.lastElementChild?.remove();
  }

  ui.start.addEventListener('click', () => {
    void run(async () => {
      const captureVideo = ui.captureVideo.checked;
      ui.result.value = 'not-set';
      ui.warnings.replaceChildren();
      setOperationMessage(
        captureVideo
          ? 'Waiting for browser permission. Choose Browser Tab and select this tab.'
          : 'Starting screenshot, action, console, and network capture…',
      );
      const summary = await witness.startSession(
        {
          testerName: 'Vanilla demo tester',
          testCaseId: 'VANILLA-E2E-001',
          testCaseName: 'Member login and access request',
          requirementId: 'REQ-MEMBER-104',
          custom: { startingPage: currentRoute(), demoDataOnly: true },
        },
        { captureVideo },
      );
      if (captureVideo && summary.videoStatus === 'recording') {
        setOperationMessage('Session and browser-tab video are recording.', 'success');
      } else if (captureVideo) {
        setOperationMessage(
          `The evidence session is recording; video is ${summary.videoStatus}. Review the warning below.`,
          'warning',
        );
      } else {
        setOperationMessage(
          'Session started without video. Manual screenshots are ready.',
          'success',
        );
      }
    });
  });

  ui.pause.addEventListener('click', () => {
    void run(() => {
      if (witness.getSessionStatus() === 'paused') {
        witness.resumeSession();
        setOperationMessage('Session resumed.', 'success');
      } else {
        witness.pauseSession();
        setOperationMessage('Session paused. Resume before taking a screenshot.', 'warning');
      }
    });
  });

  ui.screenshot.addEventListener('click', () => {
    void run(async () => {
      const label = ui.screenshotLabel.value.trim() || `Checkpoint on ${currentRoute()}`;
      const record = await witness.captureScreenshot(label);
      setOperationMessage(`Screenshot captured: ${record.fileName}`, 'success');
    });
  });

  ui.addNote.addEventListener('click', () => {
    void run(() => {
      const note = ui.note.value.trim();
      if (!note) throw new Error('Enter a tester note before selecting Add note.');
      witness.addNote(note);
      ui.note.value = '';
      setOperationMessage('Tester note added to the evidence timeline.', 'success');
    });
  });

  ui.result.addEventListener('change', () => {
    if (!witness) return;
    const status = witness.getSessionStatus();
    if (status === 'recording' || status === 'paused') {
      witness.setSessionResult(ui.result.value);
      setOperationMessage(`Session result set to ${ui.result.value}.`, 'success');
    }
  });

  ui.stop.addEventListener('click', () => {
    void run(async () => {
      setOperationMessage('Stopping recorders and finalizing evidence…');
      const result = await witness.stopSession(ui.result.value);
      const videoMessage = result.summary.evidence.hasVideo
        ? ' Video was finalized and included.'
        : ' No video was included.';
      setOperationMessage(
        `Session stopped with ${result.summary.evidence.screenshots} screenshot(s).${videoMessage}`,
        'success',
      );
    });
  });

  ui.download.addEventListener('click', () => {
    void run(async () => {
      const result = await witness.downloadEvidence();
      setOperationMessage(
        `Download started: ${result.fileName} (${Math.ceil(result.sizeBytes / 1024)} KB).`,
        'success',
      );
    });
  });

  async function teardown() {
    if (teardownStarted) return;
    teardownStarted = true;
    if (durationTimer !== undefined) window.clearInterval(durationTimer);
    removeSummaryListener();
    removeWarningListener();
    if (witness) await witness.destroy();
  }

  window.addEventListener('pagehide', () => void teardown(), { once: true });

  async function initialize() {
    renderRoute();
    const api = window.TestWitness;
    if (!api || typeof api.TestWitness !== 'function') {
      setOperationMessage(
        'The browser bundle did not load. Run `npm run dev` from examples/vanilla.',
        'error',
      );
      return;
    }

    witness = new api.TestWitness({
      applicationName: 'Member Services Vanilla Demo',
      environment: 'local-qa',
      releaseVersion: '1.0.0-demo',
      session: {
        testCaseId: 'VANILLA-E2E-001',
        testCaseName: 'Member login and access request',
        requirementId: 'REQ-MEMBER-104',
      },
      screenshot: {
        enabled: true,
        format: 'png',
        captureOnStart: true,
        captureOnNavigation: true,
        captureOnError: true,
        autoCaptureIntervalSeconds: 20,
        maxAutomaticScreenshots: 30,
      },
      video: {
        enabled: false,
        includeAudio: false,
        maxDurationMinutes: 10,
      },
      actions: {
        enabled: true,
        captureClicks: true,
        captureFormSubmissions: true,
        captureInputChanges: true,
        captureNavigation: true,
        captureTextInputValues: false,
      },
      console: { enabled: true, levels: ['warn', 'error'] },
      network: {
        enabled: true,
        captureSuccessfulRequests: true,
        captureFailedFetch: true,
        captureFailedXhr: true,
        captureRequestBody: false,
        captureResponseBody: false,
      },
      privacy: {
        maskSelectors: ['[data-private]'],
        excludeSelectors: ['[data-test-witness-control-panel]', '[data-demo-helper]'],
        sensitiveQueryParameters: ['member_id', 'customer_reference'],
      },
      toolbar: { enabled: false },
      export: { includeHtmlReport: true, includeJsonReport: true },
      memory: { warningThresholdMb: 100 },
    });

    removeSummaryListener = witness.onSummary((summary) => updateControls(summary));
    removeWarningListener = witness.onWarning((warning) => {
      addWarning(warning);
      setOperationMessage(warning.message, 'warning');
    });
    await witness.initialize();
    state.ready = true;
    latestSummary = witness.getSessionSummary();
    updateControls(latestSummary);
    durationTimer = window.setInterval(() => {
      if (witness) updateControls(witness.getSessionSummary());
    }, 1000);
    setOperationMessage(
      'Ready. Start a session, then work through the demo application.',
      'success',
    );
  }

  function beginInitialization() {
    void initialize().catch((error) => {
      console.error('TestWitness failed to initialize.', error);
      setOperationMessage(error instanceof Error ? error.message : String(error), 'error');
    });
  }

  // A module script and a classic deferred vendor script do not share a guaranteed execution
  // order. DOMContentLoaded waits for both, so starting here makes the browser global deterministic.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', beginInitialization, { once: true });
  } else {
    beginInitialization();
  }
})();
