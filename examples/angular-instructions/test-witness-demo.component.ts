import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { SessionResultStatus, SessionStatus, TestWitnessConfig } from '@testwitness/core';

import { TEST_WITNESS_CONFIG, TestWitnessService } from './test-witness.service';

const CONFIG: TestWitnessConfig = {
  applicationName: 'Angular QA Demo',
  environment: 'local',
  releaseVersion: '1.0.0',
  session: { testCaseId: 'ANGULAR-LOGIN-001', testCaseName: 'Successful login' },
  screenshot: { enabled: true, format: 'png' },
  video: { enabled: false, includeAudio: false, maxDurationMinutes: 10 },
  privacy: { maskSelectors: ['[data-private]'] },
  toolbar: { enabled: false },
};

@Component({
  selector: 'app-test-witness-demo',
  standalone: true,
  imports: [FormsModule],
  providers: [TestWitnessService, { provide: TEST_WITNESS_CONFIG, useValue: CONFIG }],
  template: `
    <section aria-labelledby="witness-heading">
      <h2 id="witness-heading">TestWitness Angular example</h2>
      <p aria-live="polite">
        Status: <strong>{{ status }}</strong
        >. {{ message }}
      </p>

      <label>
        <input type="checkbox" [(ngModel)]="captureVideo" [disabled]="busy || active" />
        Capture browser-tab video
      </label>
      <button type="button" [disabled]="busy || active" (click)="start()">
        {{ captureVideo ? 'Start with video' : 'Start without video' }}
      </button>
      <button type="button" [disabled]="busy || !active" (click)="pauseOrResume()">
        {{ status === 'paused' ? 'Resume session' : 'Pause session' }}
      </button>
      <button type="button" [disabled]="busy || status !== 'recording'" (click)="capture()">
        Capture screenshot
      </button>
      <label>Tester note <input [(ngModel)]="note" /></label>
      <button type="button" [disabled]="busy || !active || !note.trim()" (click)="addNote()">
        Add note
      </button>
      <label>
        Result
        <select [(ngModel)]="result" [disabled]="busy || !active" (ngModelChange)="selectResult()">
          <option value="not-set">Not set</option>
          <option value="passed">Passed</option>
          <option value="failed">Failed</option>
          <option value="blocked">Blocked</option>
        </select>
      </label>
      <button type="button" [disabled]="busy || !active" (click)="stop()">Stop session</button>
      <button type="button" [disabled]="busy || status !== 'stopped'" (click)="download()">
        Download ZIP
      </button>

      <div data-private>This application content is masked in screenshots.</div>
    </section>
  `,
})
export class TestWitnessDemoComponent implements OnInit {
  public status: SessionStatus = 'idle';
  public result: SessionResultStatus = 'not-set';
  public captureVideo = false;
  public note = 'Validated the successful login scenario';
  public message = 'Initializing…';
  public busy = true;

  public constructor(private readonly testWitness: TestWitnessService) {}

  public get active(): boolean {
    return this.status === 'recording' || this.status === 'paused';
  }

  public ngOnInit(): void {
    void this.run(async () => {
      await this.testWitness.initialize();
      this.message = 'Ready.';
    });
  }

  public start(): void {
    void this.run(async () => {
      // This call begins synchronously in the click handler, preserving display-media permission UX.
      await this.testWitness.startSession({ testerName: 'Angular tester' }, this.captureVideo);
      this.message = this.captureVideo
        ? 'Session started. The selected browser tab is being recorded.'
        : 'Session started without video.';
    });
  }

  public pauseOrResume(): void {
    void this.run(() => {
      if (this.status === 'paused') {
        this.testWitness.resumeSession();
        this.message = 'Session resumed.';
      } else {
        this.testWitness.pauseSession();
        this.message = 'Session paused.';
      }
    });
  }

  public capture(): void {
    void this.run(async () => {
      await this.testWitness.captureScreenshot('Login completed');
      this.message = 'Screenshot captured.';
    });
  }

  public addNote(): void {
    void this.run(() => {
      this.testWitness.addNote(this.note);
      this.note = '';
      this.message = 'Note added.';
    });
  }

  public selectResult(): void {
    if (this.active) this.testWitness.setResult(this.result);
  }

  public stop(): void {
    void this.run(async () => {
      this.testWitness.setResult(this.result);
      await this.testWitness.stopSession();
      this.message = 'Session stopped.';
    });
  }

  public download(): void {
    void this.run(async () => {
      await this.testWitness.downloadEvidence();
      this.message = 'Evidence download started.';
    });
  }

  private async run(operation: () => Promise<void> | void): Promise<void> {
    this.busy = true;
    this.message = '';
    try {
      await operation();
    } catch (error) {
      this.message = error instanceof Error ? error.message : String(error);
    } finally {
      this.busy = false;
      try {
        this.status = this.testWitness.getStatus();
      } catch {
        this.status = 'idle';
      }
    }
  }
}
