import { Inject, Injectable, InjectionToken, OnDestroy, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  TestWitness,
  type DownloadEvidenceResult,
  type NoteRecord,
  type ScreenshotRecord,
  type SessionResultStatus,
  type SessionStartMetadata,
  type SessionStatus,
  type SessionSummary,
  type TestSessionResult,
  type TestWitnessConfig,
} from '@testwitness/core';

export const TEST_WITNESS_CONFIG = new InjectionToken<TestWitnessConfig>('TEST_WITNESS_CONFIG');

/** Component-scoped Angular wrapper around the framework-independent browser library. */
@Injectable()
export class TestWitnessService implements OnDestroy {
  private witness?: TestWitness;
  private initialization?: Promise<void>;

  public constructor(
    @Inject(TEST_WITNESS_CONFIG) config: TestWitnessConfig,
    @Inject(PLATFORM_ID) platformId: object,
  ) {
    if (isPlatformBrowser(platformId)) this.witness = new TestWitness(config);
  }

  public initialize(): Promise<void> {
    const witness = this.requireBrowserWitness();
    this.initialization ??= witness.initialize();
    return this.initialization;
  }

  public startSession(
    metadata: SessionStartMetadata = {},
    captureVideo = false,
  ): Promise<SessionSummary> {
    return this.requireBrowserWitness().startSession(metadata, { captureVideo });
  }

  public pauseSession(): SessionSummary {
    return this.requireBrowserWitness().pauseSession();
  }

  public resumeSession(): SessionSummary {
    return this.requireBrowserWitness().resumeSession();
  }

  public async captureScreenshot(label: string): Promise<ScreenshotRecord> {
    return await this.requireBrowserWitness().captureScreenshot(label);
  }

  public addNote(text: string): NoteRecord {
    return this.requireBrowserWitness().addNote(text);
  }

  public setResult(result: SessionResultStatus): SessionSummary {
    return this.requireBrowserWitness().setSessionResult(result);
  }

  public async stopSession(): Promise<TestSessionResult> {
    return await this.requireBrowserWitness().stopSession();
  }

  public async downloadEvidence(): Promise<DownloadEvidenceResult> {
    return await this.requireBrowserWitness().downloadEvidence();
  }

  public getStatus(): SessionStatus {
    return this.requireBrowserWitness().getSessionStatus();
  }

  public async destroy(): Promise<void> {
    const witness = this.witness;
    this.witness = undefined;
    this.initialization = undefined;
    if (witness) await witness.destroy();
  }

  public ngOnDestroy(): void {
    void this.destroy();
  }

  private requireBrowserWitness(): TestWitness {
    if (!this.witness) {
      throw new Error('TestWitness is only available in the browser or has been destroyed.');
    }
    return this.witness;
  }
}
