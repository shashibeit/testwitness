<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive } from 'vue';
import {
  TestWitness,
  type SessionStatus,
  type SessionSummary,
  type TestWitnessConfig,
} from '@testwitness/core';

interface IntegrationState {
  ready: boolean;
  status: SessionStatus;
  summary?: SessionSummary;
  error?: string;
}

const config: TestWitnessConfig = {
  applicationName: 'Service Hub',
  environment: 'local-vue-demo',
  releaseVersion: '1.0.0',
  tester: { name: 'Vue demo tester', employeeId: 'DEMO-VUE-001' },
  session: {
    testCaseId: 'VUE-SERVICE-001',
    testCaseName: 'Sign in and submit an access request',
    requirementId: 'REQ-SERVICE-204',
  },
  screenshot: {
    enabled: true,
    captureOnStart: true,
    captureOnNavigation: true,
    captureOnError: true,
    maxAutomaticScreenshots: 30,
  },
  // Video stays opt-in. The tester decides for each session with the toolbar checkbox.
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
};

const state = reactive<IntegrationState>({
  ready: false,
  status: 'idle',
});

let witness: TestWitness | undefined;
let initialization: Promise<void> | undefined;
let unsubscribe: (() => void) | undefined;

onMounted(() => {
  const instance = new TestWitness(config);
  witness = instance;
  unsubscribe = instance.onSummary((summary) => {
    state.ready = true;
    state.status = summary.status;
    state.summary = summary;
    state.error = undefined;
  });

  initialization = instance.initialize();
  void initialization.then(
    () => {
      const summary = instance.getSessionSummary();
      state.ready = true;
      state.status = summary.status;
      state.summary = summary;
    },
    (error: unknown) => {
      state.ready = false;
      state.error = error instanceof Error ? error.message : String(error);
    },
  );
});

onBeforeUnmount(() => {
  const instance = witness;
  witness = undefined;
  unsubscribe?.();
  unsubscribe = undefined;

  if (!instance) return;
  void (initialization ?? Promise.resolve())
    .catch(() => undefined)
    .then(async () => await instance.destroy())
    .catch((error: unknown) => {
      console.error('TestWitness cleanup failed.', error);
    });
});
</script>

<template>
  <slot />
  <aside
    class="integration-status"
    data-evidence-exclude
    aria-live="polite"
    aria-label="TestWitness integration status"
  >
    <span class="integration-dot" :data-active="state.status === 'recording'"></span>
    <span v-if="state.error">TestWitness error: {{ state.error }}</span>
    <span v-else-if="!state.ready">Preparing TestWitness…</span>
    <span v-else>
      TestWitness: {{ state.status }} · {{ state.summary?.evidence.screenshots ?? 0 }} screenshots
    </span>
  </aside>
</template>
