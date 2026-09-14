import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { SessionResultStatus, SessionStatus } from '@testwitness/core';

import { TestWitnessService } from './test-witness.service';

interface DemoSuccessResponse {
  ticket: string;
  message: string;
}

function isDemoSuccessResponse(value: unknown): value is DemoSuccessResponse {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record['ticket'] === 'string' && typeof record['message'] === 'string';
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit, OnDestroy {
  readonly #testWitness = inject(TestWitnessService);

  public readonly summary = this.#testWitness.summary;
  public readonly initialized = this.#testWitness.initialized;

  public captureVideo = false;
  public note = 'Validated the temporary access request workflow';
  public witnessBusy = false;
  public witnessMessage = 'Initializing the evidence toolbar…';

  public employeeName = 'Jordan Lee';
  public employeeId = 'E-83920';
  public systemName = 'Finance Reporting';
  public accessLevel = 'Read only';
  public businessReason = 'Quarter-end reconciliation support';
  public approvalPin = '4826';
  public simulateFailure = false;
  public submitting = false;
  public requestOutcome: 'idle' | 'success' | 'error' = 'idle';
  public requestMessage = 'No request submitted yet.';
  public ticket = '';

  public ngOnInit(): void {
    void this.initializeWitness();
  }

  public ngOnDestroy(): void {
    void this.#testWitness.destroy();
  }

  public get sessionStatus(): SessionStatus {
    return this.summary().status;
  }

  public get sessionActive(): boolean {
    return this.sessionStatus === 'recording' || this.sessionStatus === 'paused';
  }

  public startSession(): void {
    const withVideo = this.captureVideo;
    void this.runWitnessOperation(async () => {
      await this.#testWitness.startSession(
        {
          testerName: 'Angular QA tester',
          testerEmployeeId: 'DEMO-1042',
          custom: { angularExample: true, workflow: 'temporary-access' },
        },
        withVideo,
      );
      this.witnessMessage = withVideo
        ? 'Session started. Complete the browser tab-sharing prompt.'
        : 'Session started without video.';
    });
  }

  public pauseOrResume(): void {
    void this.runWitnessOperation(() => {
      if (this.sessionStatus === 'paused') {
        this.#testWitness.resumeSession();
        this.witnessMessage = 'Evidence capture resumed.';
      } else {
        this.#testWitness.pauseSession();
        this.witnessMessage = 'Evidence capture paused.';
      }
    });
  }

  public captureScreenshot(): void {
    void this.runWitnessOperation(async () => {
      const screenshot = await this.#testWitness.captureScreenshot('Access request reviewed');
      this.witnessMessage = `Captured ${screenshot.fileName}.`;
    });
  }

  public addNote(): void {
    const text = this.note.trim();
    if (!text) return;
    void this.runWitnessOperation(() => {
      this.#testWitness.addNote(text);
      this.note = '';
      this.witnessMessage = 'Tester note added.';
    });
  }

  public selectResult(result: SessionResultStatus): void {
    if (!this.sessionActive) return;
    try {
      this.#testWitness.setResult(result);
      this.witnessMessage = `Session result set to ${result}.`;
    } catch (error) {
      this.witnessMessage = this.errorMessage(error);
    }
  }

  public stopSession(): void {
    void this.runWitnessOperation(async () => {
      await this.#testWitness.stopSession();
      this.witnessMessage = 'Session stopped. The evidence ZIP is ready to download.';
    });
  }

  public downloadEvidence(): void {
    void this.runWitnessOperation(async () => {
      const download = await this.#testWitness.downloadEvidence();
      this.witnessMessage = `Started download of ${download.fileName}.`;
    });
  }

  public submitAccessRequest(): void {
    if (this.submitting) return;
    void this.performAccessRequest();
  }

  private async initializeWitness(): Promise<void> {
    try {
      await this.#testWitness.initialize();
      this.witnessMessage = 'Ready. Use these controls or the floating toolbar.';
    } catch (error) {
      this.witnessMessage = this.errorMessage(error);
    }
  }

  private async performAccessRequest(): Promise<void> {
    this.submitting = true;
    this.requestOutcome = 'idle';
    this.requestMessage = 'Submitting the demo request…';
    const endpoint = this.simulateFailure ? '/demo-api/unavailable.json' : '/demo-api/success.json';
    try {
      const response = await fetch(endpoint, {
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'X-Demo-Scenario': 'angular-access-review',
        },
      });
      if (!response.ok) {
        throw new Error(`The demo endpoint returned HTTP ${response.status}.`);
      }
      const payload: unknown = await response.json();
      if (!isDemoSuccessResponse(payload)) throw new Error('The demo response was invalid.');
      this.ticket = payload.ticket;
      this.requestMessage = payload.message;
      this.requestOutcome = 'success';
    } catch (error) {
      this.ticket = '';
      this.requestMessage = this.errorMessage(error);
      this.requestOutcome = 'error';
      console.error('The synthetic access request failed.', {
        endpoint,
        message: this.requestMessage,
      });
    } finally {
      this.submitting = false;
    }
  }

  private async runWitnessOperation(operation: () => Promise<void> | void): Promise<void> {
    this.witnessBusy = true;
    try {
      await operation();
    } catch (error) {
      this.witnessMessage = this.errorMessage(error);
    } finally {
      this.witnessBusy = false;
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
