import { createAccessRequest, createAccount, signIn, updateProfile } from './demo-api.js';
import { pageTitle, renderApplication, updateIntegrationIndicators } from './templates.js';

const KNOWN_ROUTES = new Set(['/login', '/signup', '/dashboard', '/access-request', '/profile']);
const PROTECTED_ROUTES = new Set(['/dashboard', '/access-request', '/profile']);

const root = document.getElementById('root');
if (!(root instanceof HTMLElement)) {
  throw new Error('The vanilla demo root element was not found.');
}

function defaultExpiryDate() {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
}

function createLoginForm() {
  return {
    email: 'qa.tester@example.test',
    password: 'DemoOnly!123',
    simulateFailure: false,
  };
}

function createSignupForm() {
  return {
    name: 'Jordan Lee',
    email: 'jordan.lee@example.test',
    department: 'Quality Engineering',
    password: 'DemoOnly!123',
    confirmation: 'DemoOnly!123',
    termsAccepted: false,
  };
}

function createAccessForm() {
  return {
    application: 'Payments Console',
    accessLevel: 'Read only',
    expiresOn: defaultExpiryDate(),
    justification: 'Validate the release candidate and confirm the regression suite.',
    customerReference: 'CUSTOMER-002845',
    policyConfirmed: false,
    simulateFailure: false,
  };
}

function createProfileForm(displayName = 'Alex Morgan') {
  return {
    displayName,
    phone: '312-555-0142',
    timeZone: 'America/Chicago',
    notificationsEnabled: true,
    simulateFailure: false,
  };
}

const state = {
  user: undefined,
  dashboardRange: '7-days',
  signupCreatedUser: undefined,
  integration: {
    ready: false,
    status: 'idle',
    summary: undefined,
    error: undefined,
  },
  messages: {
    login: undefined,
    signup: undefined,
    access: undefined,
    profile: undefined,
  },
  forms: {
    login: createLoginForm(),
    signup: createSignupForm(),
    access: createAccessForm(),
    profile: createProfileForm(),
  },
};

let witness;
let removeSummaryListener = () => undefined;
let requestGeneration = 0;
let teardownStarted = false;
let activeRoute;

function routeFromLocation() {
  return KNOWN_ROUTES.has(window.location.pathname) ? window.location.pathname : '/login';
}

function replaceLocation(route) {
  window.history.replaceState({ route }, '', route);
}

function resetRouteState(route) {
  if (route === '/login') {
    state.forms.login = createLoginForm();
    state.messages.login = undefined;
  } else if (route === '/signup') {
    state.forms.signup = createSignupForm();
    state.messages.signup = undefined;
    state.signupCreatedUser = undefined;
  } else if (route === '/dashboard') {
    state.dashboardRange = '7-days';
  } else if (route === '/access-request') {
    state.forms.access = createAccessForm();
    state.messages.access = undefined;
  } else if (route === '/profile') {
    state.forms.profile = createProfileForm(state.user?.name);
    state.messages.profile = undefined;
  }
}

function focusAfterRender(selector) {
  window.requestAnimationFrame(() => {
    const target = root.querySelector(selector);
    if (!(target instanceof HTMLElement)) return;
    if (!target.matches('a, button, input, select, textarea, [tabindex]')) target.tabIndex = -1;
    target.focus({ preventScroll: true });
  });
}

function renderRoute({ focus = false, focusSelector } = {}) {
  requestGeneration += 1;
  let route = routeFromLocation();

  if (window.location.pathname !== route) replaceLocation(route);
  if (PROTECTED_ROUTES.has(route) && !state.user) {
    route = '/login';
    replaceLocation(route);
  }

  if (activeRoute && activeRoute !== route) resetRouteState(activeRoute);
  activeRoute = route;

  document.title = `${pageTitle(route)} · Operations Portal`;
  root.innerHTML = renderApplication(route, state);
  updateIntegrationIndicators(root, state.integration);

  if (focusSelector) focusAfterRender(focusSelector);
  else if (focus) focusAfterRender('#application-content');
}

function navigate(route, replace = false) {
  if (!KNOWN_ROUTES.has(route)) return;
  if (replace) window.history.replaceState({ route }, '', route);
  else window.history.pushState({ route }, '', route);
  renderRoute({ focus: true });
}

function beginRequest() {
  requestGeneration += 1;
  return requestGeneration;
}

function requestIsCurrent(generation) {
  return generation === requestGeneration;
}

function formValue(formData, name) {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

function setFormBusy(form, testId, busy, busyLabel, idleLabel) {
  form.toggleAttribute('aria-busy', busy);
  const button = form.querySelector(`[data-testid="${testId}"]`);
  if (button instanceof HTMLButtonElement) {
    button.disabled = busy;
    button.textContent = busy ? busyLabel : idleLabel;
  }
}

async function handleLogin(form) {
  const formData = new FormData(form);
  state.forms.login = {
    email: formValue(formData, 'email'),
    password: formValue(formData, 'password'),
    simulateFailure: formData.has('simulateFailure'),
  };
  state.messages.login = undefined;
  setFormBusy(form, 'sign-in', true, 'Signing in…', 'Sign in');
  const generation = beginRequest();

  try {
    const result = await signIn(state.forms.login);
    if (!requestIsCurrent(generation)) return;
    if (!result.ok) {
      state.messages.login = result.message;
      console.error('Portal sign-in failed', {
        status: result.status,
        authorization: 'Bearer synthetic-console-token',
        password: 'synthetic-console-password',
      });
      renderRoute({ focusSelector: '[data-testid="sign-in"]' });
      return;
    }

    state.user = result.data;
    state.forms.profile.displayName = result.data.name;
    state.messages.login = undefined;
    navigate('/dashboard');
  } catch (error) {
    if (!requestIsCurrent(generation)) return;
    const message = error instanceof Error ? error.message : String(error);
    state.messages.login = message;
    console.error('Portal sign-in request failed', { message });
    renderRoute({ focusSelector: '[data-testid="sign-in"]' });
  } finally {
    if (requestIsCurrent(generation) && form.isConnected) {
      setFormBusy(form, 'sign-in', false, 'Signing in…', 'Sign in');
    }
  }
}

async function handleSignup(form) {
  const formData = new FormData(form);
  state.forms.signup = {
    name: formValue(formData, 'displayName'),
    email: formValue(formData, 'email'),
    department: formValue(formData, 'department'),
    password: formValue(formData, 'password'),
    confirmation: formValue(formData, 'confirmPassword'),
    termsAccepted: formData.has('termsAccepted'),
  };
  state.messages.signup = undefined;

  if (state.forms.signup.password !== state.forms.signup.confirmation) {
    state.messages.signup = 'The two password values must match.';
    renderRoute({ focusSelector: '[data-testid="create-account"]' });
    return;
  }

  setFormBusy(form, 'create-account', true, 'Creating account…', 'Create account');
  const generation = beginRequest();
  try {
    const result = await createAccount({
      name: state.forms.signup.name,
      email: state.forms.signup.email,
      department: state.forms.signup.department,
      password: state.forms.signup.password,
    });
    if (!requestIsCurrent(generation)) return;
    if (!result.ok) {
      state.messages.signup = result.message;
      renderRoute({ focusSelector: '[data-testid="create-account"]' });
      return;
    }
    state.forms.signup.password = '';
    state.forms.signup.confirmation = '';
    state.signupCreatedUser = result.data;
    renderRoute({ focusSelector: '[data-testid="continue-to-dashboard"]' });
  } catch (error) {
    if (!requestIsCurrent(generation)) return;
    state.messages.signup = error instanceof Error ? error.message : String(error);
    renderRoute({ focusSelector: '[data-testid="create-account"]' });
  } finally {
    if (requestIsCurrent(generation) && form.isConnected) {
      setFormBusy(form, 'create-account', false, 'Creating account…', 'Create account');
    }
  }
}

async function handleAccessRequest(form) {
  const formData = new FormData(form);
  state.forms.access = {
    application: formValue(formData, 'application'),
    accessLevel: formValue(formData, 'accessLevel'),
    expiresOn: formValue(formData, 'expiresOn'),
    justification: formValue(formData, 'justification'),
    customerReference: formValue(formData, 'customerReference'),
    policyConfirmed: formData.has('policyConfirmed'),
    simulateFailure: formData.has('simulateFailure'),
  };
  state.messages.access = undefined;
  setFormBusy(form, 'submit-access-request', true, 'Submitting…', 'Submit request');
  const generation = beginRequest();

  try {
    const result = await createAccessRequest(
      {
        application: state.forms.access.application,
        accessLevel: state.forms.access.accessLevel,
        expiresOn: state.forms.access.expiresOn,
        justification: state.forms.access.justification,
        customerReference: state.forms.access.customerReference,
      },
      state.forms.access.simulateFailure,
    );
    if (!requestIsCurrent(generation)) return;
    if (!result.ok) {
      state.messages.access = { tone: 'error', text: result.message };
      console.error('Access request submission failed', {
        status: result.status,
        authorization: 'Bearer synthetic-access-console-token',
        access_token: 'synthetic-access-token',
      });
      renderRoute({ focusSelector: '[data-testid="submit-access-request"]' });
      return;
    }
    state.messages.access = {
      tone: 'success',
      text: `Request ${result.data.requestId} was submitted for review.`,
    };
    renderRoute({ focusSelector: '[data-testid="submit-access-request"]' });
  } catch (error) {
    if (!requestIsCurrent(generation)) return;
    const message = error instanceof Error ? error.message : String(error);
    state.messages.access = { tone: 'error', text: message };
    console.error('Access request could not be submitted', { message });
    renderRoute({ focusSelector: '[data-testid="submit-access-request"]' });
  } finally {
    if (requestIsCurrent(generation) && form.isConnected) {
      setFormBusy(form, 'submit-access-request', false, 'Submitting…', 'Submit request');
    }
  }
}

async function handleProfile(form) {
  const formData = new FormData(form);
  state.forms.profile = {
    displayName: formValue(formData, 'displayName'),
    phone: formValue(formData, 'phone'),
    timeZone: formValue(formData, 'timeZone'),
    notificationsEnabled: formData.has('notificationsEnabled'),
    simulateFailure: formData.has('simulateFailure'),
  };
  state.messages.profile = undefined;
  setFormBusy(form, 'save-profile', true, 'Saving…', 'Save profile');
  const generation = beginRequest();

  try {
    const result = await updateProfile(
      {
        displayName: state.forms.profile.displayName,
        phone: state.forms.profile.phone,
        timeZone: state.forms.profile.timeZone,
        notificationsEnabled: state.forms.profile.notificationsEnabled,
      },
      state.forms.profile.simulateFailure,
    );
    if (!requestIsCurrent(generation)) return;
    if (!result.ok) {
      state.messages.profile = { tone: 'error', text: result.message };
      console.warn('Profile update was rejected', {
        status: result.status,
        'x-csrf-token': 'synthetic-profile-console-token',
      });
      renderRoute({ focusSelector: '[data-testid="save-profile"]' });
      return;
    }

    state.user = { ...state.user, name: state.forms.profile.displayName };
    state.messages.profile = {
      tone: 'success',
      text: 'Your profile settings were saved.',
    };
    renderRoute({ focusSelector: '[data-testid="save-profile"]' });
  } catch (error) {
    if (!requestIsCurrent(generation)) return;
    state.messages.profile = {
      tone: 'error',
      text: error instanceof Error ? error.message : String(error),
    };
    renderRoute({ focusSelector: '[data-testid="save-profile"]' });
  } finally {
    if (requestIsCurrent(generation) && form.isConnected) {
      setFormBusy(form, 'save-profile', false, 'Saving…', 'Save profile');
    }
  }
}

root.addEventListener('submit', (event) => {
  if (!(event.target instanceof HTMLFormElement)) return;
  event.preventDefault();
  if (event.target.id === 'login-form') void handleLogin(event.target);
  if (event.target.id === 'signup-form') void handleSignup(event.target);
  if (event.target.id === 'access-request-form') void handleAccessRequest(event.target);
  if (event.target.id === 'profile-form') void handleProfile(event.target);
});

root.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;

  const link = event.target.closest('a[data-route]');
  if (
    link instanceof HTMLAnchorElement &&
    event instanceof MouseEvent &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  ) {
    event.preventDefault();
    navigate(link.dataset.route ?? '/login');
    return;
  }

  const button = event.target.closest('button');
  if (!(button instanceof HTMLButtonElement)) return;

  if (button.dataset.range === '7-days' || button.dataset.range === '30-days') {
    state.dashboardRange = button.dataset.range;
    renderRoute({ focusSelector: `[data-range="${button.dataset.range}"]` });
    return;
  }

  if (button.id === 'continue-to-dashboard' && state.signupCreatedUser) {
    state.user = state.signupCreatedUser;
    state.forms.profile.displayName = state.signupCreatedUser.name;
    state.signupCreatedUser = undefined;
    navigate('/dashboard');
    return;
  }

  if (button.id === 'sign-out') {
    state.user = undefined;
    state.messages.login = undefined;
    navigate('/login');
  }
});

window.addEventListener('popstate', () => renderRoute({ focus: true }));

function updateIntegration(summary) {
  state.integration = {
    ready: true,
    status: summary.status,
    summary,
    error: undefined,
  };
  updateIntegrationIndicators(root, state.integration);
}

async function initializeTestWitness() {
  const api = window.TestWitness;
  if (!api || typeof api.TestWitness !== 'function') {
    throw new Error('The browser bundle did not load. Run `npm run dev` from examples/vanilla.');
  }

  witness = new api.TestWitness({
    applicationName: 'Operations Portal',
    environment: 'local-demo',
    releaseVersion: '1.0.0',
    tester: { name: 'Manual QA tester', employeeId: 'DEMO-QA-001' },
    session: {
      testCaseId: 'PORTAL-E2E-001',
      testCaseName: 'Authentication and account-management regression',
      requirementId: 'REQ-PORTAL-1042',
    },
    screenshot: {
      enabled: true,
      format: 'png',
      captureOnError: true,
      captureOnStart: true,
      captureOnNavigation: true,
      autoCaptureIntervalSeconds: 15,
      maxAutomaticScreenshots: 40,
    },
    // Video stays opt-in. The floating toolbar asks the tester before every session.
    video: { enabled: false, includeAudio: false, maxDurationMinutes: 10 },
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
      excludeSelectors: ['[data-evidence-exclude]'],
    },
    toolbar: { enabled: true, position: 'bottom-right' },
    export: { includeHtmlReport: true, includeJsonReport: true },
  });

  removeSummaryListener = witness.onSummary(updateIntegration);
  await witness.initialize();
  updateIntegration(witness.getSessionSummary());
}

async function teardown() {
  if (teardownStarted) return;
  teardownStarted = true;
  removeSummaryListener();
  if (witness) await witness.destroy();
}

window.addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  void teardown().catch((error) => console.error('TestWitness cleanup failed.', error));
});

function begin() {
  renderRoute();
  void initializeTestWitness().catch((error) => {
    console.error('TestWitness failed to initialize.', error);
    state.integration = {
      ready: false,
      status: 'idle',
      summary: undefined,
      error: error instanceof Error ? error.message : String(error),
    };
    renderRoute();
  });
}

// The module and deferred classic bundle both finish before DOMContentLoaded, which gives the IIFE
// a deterministic opportunity to expose window.TestWitness before the app initializes it.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', begin, { once: true });
} else {
  begin();
}
