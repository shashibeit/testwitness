import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  TestWitness,
  type SessionStatus,
  type SessionSummary,
  type TestWitnessConfig,
} from '@testwitness/core';

interface TestWitnessIntegrationState {
  ready: boolean;
  status: SessionStatus;
  summary?: SessionSummary;
  error?: string;
}

const TestWitnessContext = createContext<TestWitnessIntegrationState>({
  ready: false,
  status: 'idle',
});

const TEST_WITNESS_CONFIG: TestWitnessConfig = {
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
  // The toolbar's unchecked "Capture video" choice keeps recording opt-in per session.
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

interface TestWitnessIntegrationProps {
  children: ReactNode;
}

/**
 * Initializes one framework-independent TestWitness instance above every application route.
 * The instance and its in-memory evidence survive normal SPA navigation.
 */
export function TestWitnessIntegration({ children }: TestWitnessIntegrationProps) {
  const [state, setState] = useState<TestWitnessIntegrationState>({
    ready: false,
    status: 'idle',
  });

  useEffect(() => {
    const witness = new TestWitness(TEST_WITNESS_CONFIG);
    let mounted = true;
    const unsubscribe = witness.onSummary((summary) => {
      if (mounted) setState({ ready: true, status: summary.status, summary });
    });
    const initialization = witness.initialize();

    void initialization.then(
      () => {
        if (!mounted) return;
        const summary = witness.getSessionSummary();
        setState({ ready: true, status: summary.status, summary });
      },
      (error: unknown) => {
        if (!mounted) return;
        setState({
          ready: false,
          status: 'idle',
          error: error instanceof Error ? error.message : String(error),
        });
      },
    );

    return () => {
      mounted = false;
      unsubscribe();
      // Waiting for initialize() avoids a development Strict Mode cleanup race.
      void initialization
        .catch(() => undefined)
        .then(async () => await witness.destroy())
        .catch(() => undefined);
    };
  }, []);

  const contextValue = useMemo(() => state, [state]);
  return <TestWitnessContext.Provider value={contextValue}>{children}</TestWitnessContext.Provider>;
}

export function useTestWitnessIntegration(): TestWitnessIntegrationState {
  return useContext(TestWitnessContext);
}
