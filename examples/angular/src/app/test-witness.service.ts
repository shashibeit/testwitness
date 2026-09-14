import { Injectable, OnDestroy, signal } from '@angular/core';
import {
  TestWitness,
  type DownloadEvidenceResult,
  type NoteRecord,
  type ScreenshotRecord,
  type SessionResultStatus,
  type SessionStartMetadata,
  type SessionSummary,
  type TestSessionResult,
  type TestWitnessConfig,
} from '@testwitness/core';

const TEST_WITNESS_CONFIG: TestWitnessConfig = {
  applicationName: 'Angular Access Review Demo',
  environment: 'local-demo',
  releaseVersion: '1.0.0',
  tester: { name: 'Angular QA tester', employeeId: 'DEMO-1042' },
  session: {
    testCaseId: 'ANG-ACCESS-001',
    testCaseName: 'Submit a temporary access request',
    requirementId: 'ACCESS-REQ-17',
  },
  screenshot: {
    enabled: true,
    format: 'png',
    captureOnError: true,
  },
  video: {
    enabled: false,
    includeAudio: false,
    maxDurationMinutes: 5,
  },
  actions: {
    enabled: true,
    captureTextInputValues: false,
  },
  console: {
    enabled: true,
    levels: ['warn', 'error'],
  },
  network: {
    enabled: true,
    captureSuccessfulRequests: true,
    captureRequestBody: false,
    captureResponseBody: false,
  },
  privacy: {
    maskSelectors: ['[data-private]'],
    excludeSelectors: ['[data-witness-controls]'],
    sensitiveFieldNames: ['approvalPin'],
  },
  toolbar: {
    enabled: true,
    position: 'bottom-right',
  },
};

/** Root-scoped Angular facade that owns exactly one TestWitness instance. */
@Injectable({ providedIn: 'root' })
export class TestWitnessService implements OnDestroy {
  readonly #witness = new TestWitness(TEST_WITNESS_CONFIG);
  readonly #summaryState = signal<SessionSummary>(this.#witness.getSessionSummary());
  readonly #initializedState = signal(false);
  readonly #unsubscribeSummary = this.#witness.onSummary((summary) => {
    this.#summaryState.set(summary);
  });
  #initialization?: Promise<void>;
  #destroyPromise?: Promise<void>;

  public readonly summary = this.#summaryState.asReadonly();
  public readonly initialized = this.#initializedState.asReadonly();

  public initialize(): Promise<void> {
    if (this.#destroyPromise) {
      return Promise.reject(new Error('TestWitness has already been destroyed.'));
    }
    if (!this.#initialization) {
      this.#initialization = this.#witness
        .initialize()
        .then(() => {
          this.#initializedState.set(true);
        })
        .catch((error: unknown) => {
          this.#initialization = undefined;
          throw error;
        });
    }
    return this.#initialization;
  }

  /** Call directly from a click handler so display-capture permission retains user activation. */
  public startSession(
    metadata: SessionStartMetadata,
    captureVideo: boolean,
  ): Promise<SessionSummary> {
    this.requireInitialized();
    return this.#witness.startSession(metadata, { captureVideo });
  }

  public pauseSession(): SessionSummary {
    return this.#witness.pauseSession();
  }

  public resumeSession(): SessionSummary {
    return this.#witness.resumeSession();
  }

  public captureScreenshot(label: string): Promise<ScreenshotRecord> {
    return this.#witness.captureScreenshot(label);
  }

  public addNote(text: string): NoteRecord {
    return this.#witness.addNote(text);
  }

  public setResult(result: SessionResultStatus): SessionSummary {
    return this.#witness.setSessionResult(result);
  }

  public stopSession(): Promise<TestSessionResult> {
    return this.#witness.stopSession();
  }

  public downloadEvidence(): Promise<DownloadEvidenceResult> {
    return this.#witness.downloadEvidence();
  }

  public destroy(): Promise<void> {
    if (!this.#destroyPromise) {
      this.#unsubscribeSummary();
      this.#destroyPromise = this.#witness.destroy().finally(() => {
        this.#initializedState.set(false);
        this.#summaryState.set(this.#witness.getSessionSummary());
      });
    }
    return this.#destroyPromise;
  }

  public ngOnDestroy(): void {
    void this.destroy();
  }

  private requireInitialized(): void {
    if (!this.#initializedState()) {
      throw new Error('Initialize TestWitness before starting a session.');
    }
  }
}
