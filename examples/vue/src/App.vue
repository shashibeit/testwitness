<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

type View = 'login' | 'dashboard' | 'request';

interface DemoResponse {
  message: string;
  openRequests?: number;
  approvedToday?: number;
}

const paths: Record<View, string> = {
  login: '/login',
  dashboard: '/dashboard',
  request: '/access-request',
};

const titles: Record<View, string> = {
  login: 'Sign in',
  dashboard: 'Service overview',
  request: 'Request access',
};

function viewFromPath(pathname: string): View {
  if (pathname === paths.dashboard) return 'dashboard';
  if (pathname === paths.request) return 'request';
  return 'login';
}

const view = ref<View>(viewFromPath(window.location.pathname));
const authenticated = ref(view.value !== 'login');
const email = ref('qa.vue@example.test');
const password = ref('DemoOnly!123');
const failLogin = ref(false);
const loginBusy = ref(false);
const loginMessage = ref('');

const overviewBusy = ref(false);
const overview = ref({ openRequests: 4, approvedToday: 12 });
const overviewMessage = ref('Ready to load current service activity.');

const application = ref('Analytics Workspace');
const accessLevel = ref('Read only');
const expiresOn = ref('2026-10-31');
const justification = ref('Regression testing for the quarterly access review.');
const policyAccepted = ref(false);
const failRequest = ref(false);
const requestBusy = ref(false);
const requestMessage = ref('');
const requestSucceeded = ref(false);

function navigate(next: View, replace = false): void {
  if (next !== 'login' && !authenticated.value) next = 'login';
  const path = paths[next];
  if (replace) window.history.replaceState({ view: next }, '', path);
  else window.history.pushState({ view: next }, '', path);
  view.value = next;
}

function handlePopState(): void {
  const next = viewFromPath(window.location.pathname);
  view.value = next !== 'login' && !authenticated.value ? 'login' : next;
}

async function parseResponse(response: Response): Promise<DemoResponse> {
  const data = (await response.json()) as DemoResponse;
  if (!response.ok) throw new Error(data.message || `Request failed with HTTP ${response.status}.`);
  return data;
}

async function submitLogin(): Promise<void> {
  loginBusy.value = true;
  loginMessage.value = '';
  try {
    const response = await fetch(`/api/vue/login?fail=${String(failLogin.value)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer demo-login-token',
      },
      body: JSON.stringify({ email: email.value, password: password.value }),
    });
    const data = await parseResponse(response);
    authenticated.value = true;
    loginMessage.value = data.message;
    navigate('dashboard');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    loginMessage.value = message;
    console.error('Vue demo sign-in failed', { message, email: email.value });
  } finally {
    loginBusy.value = false;
  }
}

async function loadOverview(): Promise<void> {
  if (!authenticated.value || overviewBusy.value) return;
  overviewBusy.value = true;
  try {
    const response = await fetch('/api/vue/overview?access_token=demo-dashboard-token', {
      headers: { 'X-API-Key': 'demo-dashboard-key' },
    });
    const data = await parseResponse(response);
    overview.value = {
      openRequests: data.openRequests ?? 0,
      approvedToday: data.approvedToday ?? 0,
    };
    overviewMessage.value = data.message;
  } catch (error) {
    overviewMessage.value = error instanceof Error ? error.message : String(error);
    console.error('Vue demo overview failed', error);
  } finally {
    overviewBusy.value = false;
  }
}

async function submitAccessRequest(): Promise<void> {
  requestBusy.value = true;
  requestSucceeded.value = false;
  requestMessage.value = '';
  try {
    const response = await fetch(
      `/api/vue/access-requests?fail=${String(failRequest.value)}&csrf_token=demo-csrf-token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer demo-access-token',
          'X-CSRF-Token': 'demo-csrf-token',
        },
        body: JSON.stringify({
          application: application.value,
          accessLevel: accessLevel.value,
          expiresOn: expiresOn.value,
          justification: justification.value,
          policyAccepted: policyAccepted.value,
        }),
      },
    );
    const data = await parseResponse(response);
    requestSucceeded.value = true;
    requestMessage.value = data.message;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    requestMessage.value = message;
    console.error('Vue demo access request failed', { message, application: application.value });
  } finally {
    requestBusy.value = false;
  }
}

function signOut(): void {
  authenticated.value = false;
  password.value = '';
  navigate('login');
}

function createDemoWarning(): void {
  console.warn('Synthetic policy warning for TestWitness evidence', {
    policy: 'least-privilege',
    token: 'demo-warning-token',
  });
  overviewMessage.value = 'A synthetic console warning was emitted for the evidence report.';
}

watch(view, (current) => {
  document.title = `${titles[current]} · Service Hub`;
  if (current === 'dashboard') void loadOverview();
});

onMounted(() => {
  window.addEventListener('popstate', handlePopState);
  navigate(view.value, true);
  document.title = `${titles[view.value]} · Service Hub`;
  if (view.value === 'dashboard') void loadOverview();
});

onBeforeUnmount(() => window.removeEventListener('popstate', handlePopState));
</script>

<template>
  <div class="app-frame">
    <header class="site-header">
      <a class="brand" href="/dashboard" @click.prevent="navigate('dashboard')">
        <span class="brand-mark" aria-hidden="true">TW</span>
        <span>
          <strong>Service Hub</strong>
          <small>Vue integration demo</small>
        </span>
      </a>

      <nav v-if="authenticated" aria-label="Primary navigation">
        <button
          :aria-current="view === 'dashboard' ? 'page' : undefined"
          @click="navigate('dashboard')"
        >
          Overview
        </button>
        <button
          :aria-current="view === 'request' ? 'page' : undefined"
          @click="navigate('request')"
        >
          Request access
        </button>
        <button @click="signOut">Sign out</button>
      </nav>
    </header>

    <main>
      <section v-if="view === 'login'" class="auth-layout" aria-labelledby="login-title">
        <div class="welcome-panel">
          <p class="eyebrow">QA-ready workspace</p>
          <h1>Test a realistic Vue workflow</h1>
          <p>
            Start TestWitness, validate both a rejected and accepted login, then submit an access
            request. Evidence stays in this tab until you stop and download it.
          </p>
          <ul>
            <li>Automatic and one-click screenshots</li>
            <li>Action, console, and request evidence</li>
            <li>Optional browser-tab video</li>
          </ul>
        </div>

        <form class="card auth-card" @submit.prevent="submitLogin">
          <p class="eyebrow">Employee access</p>
          <h2 id="login-title">Sign in</h2>
          <p class="muted">Use only the synthetic credentials already entered.</p>

          <label>
            Work email
            <input v-model="email" name="email" type="email" autocomplete="username" required />
          </label>
          <label>
            Password
            <input
              v-model="password"
              name="password"
              type="password"
              autocomplete="current-password"
              required
            />
          </label>
          <label class="check-row">
            <input v-model="failLogin" type="checkbox" name="simulateLoginFailure" />
            Simulate rejected login (HTTP 401)
          </label>
          <button class="primary" type="submit" :disabled="loginBusy">
            {{ loginBusy ? 'Signing in…' : 'Sign in' }}
          </button>
          <p v-if="loginMessage" class="message" :data-error="failLogin">{{ loginMessage }}</p>
        </form>
      </section>

      <template v-else>
        <section class="page-heading">
          <div>
            <p class="eyebrow">Operations workspace</p>
            <h1>{{ titles[view] }}</h1>
          </div>
          <div class="user-chip" data-private>
            <span class="avatar" aria-hidden="true">QT</span>
            <span><strong>Quinn Tester</strong><small>Employee 10428</small></span>
          </div>
        </section>

        <section v-if="view === 'dashboard'" aria-labelledby="overview-title">
          <div class="section-heading">
            <div>
              <h2 id="overview-title">Service overview</h2>
              <p>{{ overviewMessage }}</p>
            </div>
            <button class="secondary" :disabled="overviewBusy" @click="loadOverview">
              {{ overviewBusy ? 'Refreshing…' : 'Refresh overview' }}
            </button>
          </div>

          <div class="metrics">
            <article class="metric-card">
              <span>Open requests</span><strong>{{ overview.openRequests }}</strong>
            </article>
            <article class="metric-card">
              <span>Approved today</span><strong>{{ overview.approvedToday }}</strong>
            </article>
            <article class="metric-card" data-private>
              <span>My access score</span><strong>92%</strong>
            </article>
          </div>

          <div class="content-grid">
            <article class="card">
              <p class="eyebrow">Suggested test path</p>
              <h2>Capture a complete service request</h2>
              <ol class="steps">
                <li>Capture this successful dashboard state.</li>
                <li>Open the request form and submit the successful path.</li>
                <li>Repeat with the controlled HTTP 503 option.</li>
                <li>Add a tester note, choose a result, stop, and download.</li>
              </ol>
              <button class="primary" @click="navigate('request')">Open access request</button>
            </article>
            <aside class="card subtle-card">
              <p class="eyebrow">Evidence exercise</p>
              <h2>Console capture</h2>
              <p>Emit a safe synthetic warning and confirm it appears in the report.</p>
              <button class="secondary" @click="createDemoWarning">Create demo warning</button>
            </aside>
          </div>
        </section>

        <section v-else class="request-layout" aria-labelledby="request-title">
          <form class="card request-card" @submit.prevent="submitAccessRequest">
            <div class="section-heading">
              <div>
                <p class="eyebrow">Controlled application access</p>
                <h2 id="request-title">New access request</h2>
              </div>
              <span class="required-note">All fields required</span>
            </div>

            <div class="form-grid">
              <label>
                Application
                <select v-model="application" name="application">
                  <option>Analytics Workspace</option>
                  <option>Claims Console</option>
                  <option>Finance Reporting</option>
                </select>
              </label>
              <label>
                Access level
                <select v-model="accessLevel" name="accessLevel">
                  <option>Read only</option>
                  <option>Contributor</option>
                  <option>Approver</option>
                </select>
              </label>
              <label>
                Expiration date
                <input v-model="expiresOn" name="expiresOn" type="date" required />
              </label>
              <label class="full-width">
                Business justification
                <textarea v-model="justification" name="justification" rows="4" required></textarea>
              </label>
            </div>

            <label class="check-row">
              <input v-model="policyAccepted" name="policyAccepted" type="checkbox" required />
              I confirm this request follows least-privilege policy.
            </label>
            <label class="check-row qa-option" data-evidence-exclude>
              <input v-model="failRequest" name="simulateRequestFailure" type="checkbox" />
              QA control: return HTTP 503
            </label>

            <div class="button-row">
              <button class="secondary" type="button" @click="navigate('dashboard')">Cancel</button>
              <button class="primary" type="submit" :disabled="requestBusy || !policyAccepted">
                {{ requestBusy ? 'Submitting…' : 'Submit request' }}
              </button>
            </div>

            <p
              v-if="requestMessage"
              class="message"
              :data-success="requestSucceeded"
              :data-error="!requestSucceeded"
            >
              {{ requestMessage }}
            </p>
          </form>

          <aside class="card guidance-card">
            <p class="eyebrow">Before you finish</p>
            <h2>Build useful evidence</h2>
            <p>
              Use the floating toolbar to capture the visible outcome and add a short tester note.
            </p>
            <dl>
              <div>
                <dt>Successful API</dt>
                <dd>HTTP 201</dd>
              </div>
              <div>
                <dt>Controlled failure</dt>
                <dd>HTTP 503</dd>
              </div>
              <div>
                <dt>Request bodies</dt>
                <dd>Disabled</dd>
              </div>
              <div>
                <dt>Video</dt>
                <dd>Tester opt-in</dd>
              </div>
            </dl>
          </aside>
        </section>
      </template>
    </main>

    <footer>
      <span>Service Hub · Synthetic QA data only</span>
      <span data-evidence-exclude>TestWitness controls are excluded from DOM screenshots.</span>
    </footer>
  </div>
</template>
