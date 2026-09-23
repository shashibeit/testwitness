const PAGE_DETAILS = {
  '/dashboard': {
    title: 'Overview',
    description: 'Monitor requests, policy coverage, and recent workspace activity.',
  },
  '/access-request': {
    title: 'Access requests',
    description: 'Request time-limited access to protected business applications.',
  },
  '/profile': {
    title: 'Profile settings',
    description: 'Maintain your contact information and workspace preferences.',
  },
};

const NAVIGATION = [
  { route: '/dashboard', label: 'Overview', shortLabel: 'OV' },
  { route: '/access-request', label: 'Access requests', shortLabel: 'AR' },
  { route: '/profile', label: 'Profile settings', shortLabel: 'PS' },
];

const ACTIVITY = [
  {
    id: 'AR-2026-1038',
    action: 'Access request approved',
    time: 'Today, 09:42',
    status: 'Complete',
  },
  {
    id: 'PR-2026-0771',
    action: 'Profile preference changed',
    time: 'Yesterday, 16:18',
    status: 'Complete',
  },
  {
    id: 'AR-2026-1024',
    action: 'Elevated access review',
    time: 'Sep 9, 11:05',
    status: 'Pending',
  },
];

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function selected(currentValue, optionValue) {
  return currentValue === optionValue ? ' selected' : '';
}

function checked(value) {
  return value ? ' checked' : '';
}

function initials(name) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2);
}

function readableVideoStatus(status) {
  return String(status ?? 'off').replaceAll('-', ' ');
}

function integrationCopy(context, integration) {
  const { error, ready, status, summary } = integration;
  if (context === 'auth') {
    const value = error ? 'unavailable' : ready ? status : 'loading';
    const video = summary ? ` · Video ${readableVideoStatus(summary.videoStatus)}` : '';
    return `Evidence ${value}${video}`;
  }

  const value = error ? 'unavailable' : status;
  if (!summary) return `Evidence: ${value}`;
  const screenshots = summary.evidence.screenshots;
  return `Evidence: ${value} · Video ${readableVideoStatus(summary.videoStatus)} · ${screenshots} ${
    screenshots === 1 ? 'shot' : 'shots'
  }`;
}

function integrationMarkup(context, integration) {
  return `<span
    class="integration-state${integration.ready && !integration.error ? ' ready' : ''}"
    data-integration-state="${context}"
    aria-live="polite"
  ><span aria-hidden="true"></span>${escapeHtml(integrationCopy(context, integration))}</span>`;
}

export function updateIntegrationIndicators(container, integration) {
  for (const indicator of container.querySelectorAll('[data-integration-state]')) {
    if (!(indicator instanceof HTMLElement)) continue;
    const context = indicator.dataset.integrationState === 'auth' ? 'auth' : 'portal';
    const dot = document.createElement('span');
    dot.setAttribute('aria-hidden', 'true');
    indicator.replaceChildren(dot, document.createTextNode(integrationCopy(context, integration)));
    indicator.classList.toggle('ready', integration.ready && !integration.error);
  }
}

function instrumentationAlert(integration, className = '') {
  if (!integration.error) return '';
  return `<div class="alert error${className ? ` ${className}` : ''}" role="alert">
    TestWitness could not initialize: ${escapeHtml(integration.error)}
  </div>`;
}

function routeLink(route, content, options = {}) {
  const className = options.className ? ` class="${escapeHtml(options.className)}"` : '';
  const testId = options.testId ? ` data-testid="${escapeHtml(options.testId)}"` : '';
  const ariaCurrent = options.current ? ' aria-current="page"' : '';
  return `<a href="${route}" data-route="${route}"${className}${testId}${ariaCurrent}>${content}</a>`;
}

function brandMarkup(subtitle, className = '', route = '/dashboard') {
  return routeLink(
    route,
    `<span class="brand-mark" aria-hidden="true">TW</span>
     <span><strong>Operations Portal</strong><small>${escapeHtml(subtitle)}</small></span>`,
    { className: `brand-lockup${className ? ` ${className}` : ''}` },
  );
}

function authLayout({ eyebrow, title, introduction, body, integration }) {
  return `<main class="auth-page" id="application-content" tabindex="-1">
    <section class="auth-story" aria-label="Operations Portal">
      <div>
        ${brandMarkup('Secure workforce access', '', '/login')}
        <div class="story-copy">
          <p class="eyebrow">Local demonstration</p>
          <h2>A realistic application journey—not a recorder control page.</h2>
          <p>
            Use the portal normally while the floating TestWitness toolbar captures evidence
            across each client-side route.
          </p>
        </div>
      </div>

      <div class="story-footer">
        ${integrationMarkup('auth', integration)}
        <p>Use only the synthetic credentials shown in this demo.</p>
      </div>
    </section>

    <section class="auth-panel" aria-labelledby="auth-heading">
      <div class="auth-card">
        <p class="section-kicker">${escapeHtml(eyebrow)}</p>
        <h1 id="auth-heading">${escapeHtml(title)}</h1>
        <p class="auth-introduction">${escapeHtml(introduction)}</p>
        ${instrumentationAlert(integration)}
        ${body}
      </div>
    </section>
  </main>`;
}

function loginPage(state) {
  const form = state.forms.login;
  const message = state.messages.login;
  return authLayout({
    eyebrow: 'Welcome back',
    title: 'Sign in to your workspace',
    introduction: 'Use the synthetic account below to continue to the operations dashboard.',
    integration: state.integration,
    body: `<div class="demo-credentials" data-evidence-exclude>
        <strong>Demo credentials</strong>
        <span>qa.tester@example.test / DemoOnly!123</span>
      </div>

      ${
        message
          ? `<div class="alert error" role="alert">
               <strong>Sign-in unsuccessful</strong>
               <span>${escapeHtml(message)}</span>
             </div>`
          : ''
      }

      <form class="form-stack" data-testid="login-form" id="login-form">
        <label for="login-email">
          Work email
          <input
            id="login-email"
            data-testid="login-email"
            name="email"
            type="email"
            value="${escapeHtml(form.email)}"
            autocomplete="username"
            required
          />
        </label>

        <label for="login-password">
          Password
          <input
            id="login-password"
            data-testid="login-password"
            name="password"
            type="password"
            value="${escapeHtml(form.password)}"
            autocomplete="current-password"
            required
          />
          <span class="field-hint">Password values are never recorded by TestWitness.</span>
        </label>

        <label class="checkbox-row" data-evidence-exclude>
          <input
            data-testid="simulate-login-failure"
            name="simulateFailure"
            type="checkbox"${checked(form.simulateFailure)}
          />
          Simulate an invalid login (HTTP 401)
        </label>

        <button class="primary-button full-width" data-testid="sign-in" type="submit">
          Sign in
        </button>
      </form>

      <p class="auth-switch">
        Need a demo account? ${routeLink('/signup', 'Create one')}
      </p>`,
  });
}

function signupPage(state) {
  const form = state.forms.signup;
  const createdUser = state.signupCreatedUser;
  const message = state.messages.signup;
  const content = createdUser
    ? `<div class="completion-state" role="status">
        <span class="completion-icon" aria-hidden="true">✓</span>
        <h2>Account created</h2>
        <p>
          The demo profile for <strong>${escapeHtml(createdUser.name)}</strong> is ready. Capture
          this state from the floating toolbar before continuing.
        </p>
        <button
          class="primary-button full-width"
          data-testid="continue-to-dashboard"
          id="continue-to-dashboard"
          type="button"
        >
          Continue to dashboard
        </button>
      </div>`
    : `${message ? `<div class="alert error" role="alert">${escapeHtml(message)}</div>` : ''}

      <form class="form-stack" data-testid="signup-form" id="signup-form">
        <div class="two-column-fields">
          <label for="signup-name">
            Full name
            <input
              id="signup-name"
              data-testid="signup-name"
              name="displayName"
              value="${escapeHtml(form.name)}"
              autocomplete="name"
              required
            />
          </label>
          <label for="signup-department">
            Department
            <select
              id="signup-department"
              data-testid="signup-department"
              name="department"
            >
              <option${selected(form.department, 'Quality Engineering')}>Quality Engineering</option>
              <option${selected(form.department, 'Operations')}>Operations</option>
              <option${selected(form.department, 'Risk and Compliance')}>Risk and Compliance</option>
            </select>
          </label>
        </div>

        <label for="signup-email">
          Work email
          <input
            id="signup-email"
            data-testid="signup-email"
            name="email"
            type="email"
            value="${escapeHtml(form.email)}"
            autocomplete="email"
            required
          />
        </label>

        <div class="two-column-fields">
          <label for="signup-password">
            Password
            <input
              id="signup-password"
              data-testid="signup-password"
              name="password"
              type="password"
              value="${escapeHtml(form.password)}"
              autocomplete="new-password"
              required
            />
          </label>
          <label for="signup-confirmation">
            Confirm password
            <input
              id="signup-confirmation"
              data-testid="signup-confirmation"
              name="confirmPassword"
              type="password"
              value="${escapeHtml(form.confirmation)}"
              autocomplete="new-password"
              required
            />
          </label>
        </div>

        <label class="checkbox-row">
          <input
            data-testid="signup-terms"
            name="termsAccepted"
            type="checkbox"${checked(form.termsAccepted)}
            required
          />
          I accept the demo workspace policy.
        </label>

        <button class="primary-button full-width" data-testid="create-account" type="submit">
          Create account
        </button>
      </form>

      <p class="auth-switch">
        Already have an account? ${routeLink('/login', 'Sign in')}
      </p>`;

  return authLayout({
    eyebrow: 'New workspace account',
    title: 'Create your profile',
    introduction:
      'This local signup flow gives the recorder another realistic form and route transition.',
    integration: state.integration,
    body: content,
  });
}

function dashboardPage(state) {
  const range = state.dashboardRange;
  const user = state.user;
  const currentDate = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  return `<div class="dashboard-stack">
    <section class="welcome-banner">
      <div>
        <p class="section-kicker">${escapeHtml(currentDate)}</p>
        <h2>Welcome back, ${escapeHtml(user.name.split(' ')[0])}</h2>
        <p>Your workspace has two items that may need attention.</p>
      </div>
      ${routeLink('/access-request', 'New access request', {
        className: 'primary-button button-link',
        testId: 'new-access-request',
      })}
    </section>

    <section class="metric-grid" aria-label="Workspace summary">
      <article class="metric-card">
        <span class="metric-label">Open requests</span>
        <strong>4</strong>
        <small>2 awaiting your response</small>
      </article>
      <article class="metric-card">
        <span class="metric-label">Completed this month</span>
        <strong>18</strong>
        <small class="positive">↑ 12% from August</small>
      </article>
      <article class="metric-card">
        <span class="metric-label">Policy coverage</span>
        <strong>96%</strong>
        <small>All critical controls active</small>
      </article>
      <article class="metric-card private-metric" data-private>
        <span class="metric-label">Assigned account</span>
        <strong>991-42-7281</strong>
        <small>Customer 002845</small>
      </article>
    </section>

    <div class="dashboard-columns">
      <section class="content-card" aria-labelledby="activity-heading">
        <div class="content-card-heading">
          <div>
            <p class="section-kicker">Audit trail</p>
            <h2 id="activity-heading">Recent activity</h2>
          </div>
          <div class="segmented-control" aria-label="Activity date range">
            <button
              class="${range === '7-days' ? 'active' : ''}"
              aria-pressed="${String(range === '7-days')}"
              data-testid="activity-7-days"
              data-range="7-days"
              type="button"
            >7 days</button>
            <button
              class="${range === '30-days' ? 'active' : ''}"
              aria-pressed="${String(range === '30-days')}"
              data-testid="activity-30-days"
              data-range="30-days"
              type="button"
            >30 days</button>
          </div>
        </div>

        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Reference</th>
                <th scope="col">Activity</th>
                <th scope="col">Updated</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              ${ACTIVITY.map(
                (item) => `<tr>
                  <td>${escapeHtml(item.id)}</td>
                  <td>${escapeHtml(item.action)}</td>
                  <td>${escapeHtml(item.time)}</td>
                  <td><span class="status-chip ${
                    item.status === 'Pending' ? 'pending' : 'success'
                  }">${escapeHtml(item.status)}</span></td>
                </tr>`,
              ).join('')}
            </tbody>
          </table>
        </div>
      </section>

      <aside class="content-card quick-actions" aria-labelledby="quick-actions-heading">
        <p class="section-kicker">Common tasks</p>
        <h2 id="quick-actions-heading">Quick actions</h2>
        ${routeLink(
          '/access-request',
          `<span aria-hidden="true">AR</span>
           <span><strong>Request application access</strong><small>Submit a time-limited role request</small></span>`,
        )}
        ${routeLink(
          '/profile',
          `<span aria-hidden="true">PS</span>
           <span><strong>Update profile settings</strong><small>Manage contact and notification details</small></span>`,
        )}
        <div class="qa-callout" data-evidence-exclude>
          <strong>Tester tip</strong>
          <p>Use the floating toolbar to capture this dashboard and add a “Login successful” note.</p>
        </div>
      </aside>
    </div>
  </div>`;
}

function accessRequestPage(state) {
  const form = state.forms.access;
  const message = state.messages.access;
  return `<div class="form-page-grid">
    <section class="content-card form-card" aria-labelledby="access-form-heading">
      <div class="content-card-heading">
        <div>
          <p class="section-kicker">Role provisioning</p>
          <h2 id="access-form-heading">Application access details</h2>
        </div>
        <span class="status-chip pending">Draft</span>
      </div>

      ${
        message
          ? `<div class="alert ${message.tone}" role="${
              message.tone === 'error' ? 'alert' : 'status'
            }">${escapeHtml(message.text)}</div>`
          : ''
      }

      <form class="form-stack" data-testid="access-request-form" id="access-request-form">
        <div class="two-column-fields">
          <label for="request-application">
            Application
            <select
              id="request-application"
              data-testid="request-application"
              name="application"
            >
              <option${selected(form.application, 'Payments Console')}>Payments Console</option>
              <option${selected(form.application, 'Customer Service Hub')}>Customer Service Hub</option>
              <option${selected(form.application, 'Risk Review Workbench')}>Risk Review Workbench</option>
            </select>
          </label>
          <label for="request-access-level">
            Access level
            <select
              id="request-access-level"
              data-testid="request-access-level"
              name="accessLevel"
            >
              <option${selected(form.accessLevel, 'Read only')}>Read only</option>
              <option${selected(form.accessLevel, 'Approver')}>Approver</option>
              <option${selected(form.accessLevel, 'Administrator')}>Administrator</option>
            </select>
          </label>
        </div>

        <div class="two-column-fields">
          <label for="request-expiry">
            Access expires
            <input
              id="request-expiry"
              data-testid="request-expiry"
              name="expiresOn"
              type="date"
              value="${escapeHtml(form.expiresOn)}"
            />
          </label>
          <label data-private for="customer-reference">
            Customer reference
            <input
              id="customer-reference"
              data-testid="customer-reference"
              name="customerReference"
              value="${escapeHtml(form.customerReference)}"
            />
          </label>
        </div>

        <label for="request-justification">
          Business justification
          <textarea
            id="request-justification"
            data-testid="request-justification"
            name="justification"
            rows="5"
          >${escapeHtml(form.justification)}</textarea>
          <span class="field-hint">
            TestWitness records that this field changed, but not the free-text value.
          </span>
        </label>

        <label class="checkbox-row">
          <input
            data-testid="request-policy-confirmed"
            name="policyConfirmed"
            type="checkbox"${checked(form.policyConfirmed)}
            required
          />
          I confirm this request follows the least-privilege policy.
        </label>

        <label class="checkbox-row qa-option" data-evidence-exclude>
          <input
            data-testid="simulate-access-failure"
            name="simulateFailure"
            type="checkbox"${checked(form.simulateFailure)}
          />
          QA option: return a synthetic HTTP 503 response
        </label>

        <div class="form-actions">
          <button class="primary-button" data-testid="submit-access-request" type="submit">
            Submit request
          </button>
        </div>
      </form>
    </section>

    <aside class="content-card guidance-card">
      <p class="section-kicker">Before submitting</p>
      <h2>Request guidance</h2>
      <ul class="check-list">
        <li>Choose only the minimum role required.</li>
        <li>Set an appropriate expiration date.</li>
        <li>Do not enter real customer data in this demo.</li>
      </ul>
      <div class="privacy-box">
        <strong>Privacy behavior</strong>
        <p>
          The customer-reference field is masked in screenshots. Request bodies remain disabled in
          the evidence configuration.
        </p>
      </div>
    </aside>
  </div>`;
}

function profilePage(state) {
  const user = state.user;
  const form = state.forms.profile;
  const message = state.messages.profile;
  return `<div class="form-page-grid profile-grid">
    <section class="content-card profile-summary" data-private>
      <span class="large-avatar" aria-hidden="true">${escapeHtml(initials(user.name))}</span>
      <h2>${escapeHtml(user.name)}</h2>
      <p>${escapeHtml(user.role)}</p>
      <dl>
        <div><dt>Employee ID</dt><dd>${escapeHtml(user.employeeId)}</dd></div>
        <div><dt>Email</dt><dd>${escapeHtml(user.email)}</dd></div>
      </dl>
      <small>This card is marked private and is masked in screenshots.</small>
    </section>

    <section class="content-card form-card" aria-labelledby="profile-form-heading">
      <div class="content-card-heading">
        <div>
          <p class="section-kicker">Personal preferences</p>
          <h2 id="profile-form-heading">Contact and notification settings</h2>
        </div>
      </div>

      ${
        message
          ? `<div class="alert ${message.tone}" role="${
              message.tone === 'error' ? 'alert' : 'status'
            }">${escapeHtml(message.text)}</div>`
          : ''
      }

      <form class="form-stack" data-testid="profile-form" id="profile-form">
        <div class="two-column-fields">
          <label for="profile-display-name">
            Display name
            <input
              id="profile-display-name"
              data-testid="profile-display-name"
              name="displayName"
              value="${escapeHtml(form.displayName)}"
              autocomplete="name"
              required
            />
          </label>
          <label for="profile-phone">
            Phone number
            <input
              id="profile-phone"
              data-testid="profile-phone"
              name="phone"
              type="tel"
              value="${escapeHtml(form.phone)}"
              autocomplete="tel"
            />
          </label>
        </div>

        <label for="profile-time-zone">
          Time zone
          <select
            id="profile-time-zone"
            data-testid="profile-time-zone"
            name="timeZone"
          >
            <option value="America/Chicago"${selected(
              form.timeZone,
              'America/Chicago',
            )}>Central Time (Chicago)</option>
            <option value="America/New_York"${selected(
              form.timeZone,
              'America/New_York',
            )}>Eastern Time (New York)</option>
            <option value="America/Los_Angeles"${selected(
              form.timeZone,
              'America/Los_Angeles',
            )}>Pacific Time (Los Angeles)</option>
          </select>
        </label>

        <label class="checkbox-row">
          <input
            data-testid="profile-notifications"
            name="notificationsEnabled"
            type="checkbox"${checked(form.notificationsEnabled)}
          />
          Send email notifications for request updates.
        </label>

        <label class="checkbox-row qa-option" data-evidence-exclude>
          <input
            data-testid="simulate-profile-failure"
            name="simulateFailure"
            type="checkbox"${checked(form.simulateFailure)}
          />
          QA option: return a synthetic XHR HTTP 500 response
        </label>

        <div class="form-actions">
          <button class="primary-button" data-testid="save-profile" type="submit">
            Save profile
          </button>
        </div>
      </form>
    </section>
  </div>`;
}

function portalShell(route, content, state) {
  const user = state.user;
  const page = PAGE_DETAILS[route];
  return `<div class="portal-layout">
    <aside class="sidebar">
      ${brandMarkup('Enterprise workspace', 'sidebar-brand')}

      <nav aria-label="Primary navigation">
        ${NAVIGATION.map((item) =>
          routeLink(
            item.route,
            `<span aria-hidden="true">${item.shortLabel}</span>${escapeHtml(item.label)}`,
            {
              className: `nav-link${route === item.route ? ' active' : ''}`,
              testId: `nav-${item.route.slice(1)}`,
              current: route === item.route,
            },
          ),
        ).join('')}
      </nav>

      <div class="sidebar-user" data-private>
        <span class="avatar" aria-hidden="true">${escapeHtml(initials(user.name))}</span>
        <span><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(
          user.employeeId,
        )}</small></span>
      </div>
    </aside>

    <div class="portal-main">
      <header class="topbar">
        <div>
          <p class="breadcrumb">Workspace / ${escapeHtml(page.title)}</p>
          <h1>${escapeHtml(page.title)}</h1>
          <p>${escapeHtml(page.description)}</p>
        </div>
        <div class="topbar-actions">
          ${integrationMarkup('portal', state.integration)}
          <button class="text-button" data-testid="sign-out" id="sign-out" type="button">
            Sign out
          </button>
        </div>
      </header>

      ${instrumentationAlert(state.integration, 'instrumentation-alert')}
      <main class="page-content" id="application-content" tabindex="-1">${content}</main>
    </div>
  </div>`;
}

export function pageTitle(route) {
  if (route === '/login') return 'Sign in';
  if (route === '/signup') return 'Create account';
  return PAGE_DETAILS[route].title;
}

export function renderApplication(route, state) {
  if (route === '/login') return loginPage(state);
  if (route === '/signup') return signupPage(state);

  const content =
    route === '/dashboard'
      ? dashboardPage(state)
      : route === '/access-request'
        ? accessRequestPage(state)
        : profilePage(state);
  return portalShell(route, content, state);
}
