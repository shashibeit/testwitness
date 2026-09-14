import type {
  EvidenceCounts,
  SessionResultStatus,
  SessionStatus,
  SessionSummary,
  SessionWarning,
  VideoCaptureStatus,
} from '../types/session';
import { TestWitnessError } from '../utils/errors';
import { createSessionId } from '../utils/ids';
import { elapsedMilliseconds, systemClock, toIsoTimestamp, type Clock } from '../utils/timestamps';

const EMPTY_EVIDENCE_COUNTS: EvidenceCounts = Object.freeze({
  screenshots: 0,
  actions: 0,
  consoleLogs: 0,
  networkRequests: 0,
  successfulRequests: 0,
  networkErrors: 0,
  notes: 0,
  hasVideo: false,
});

const VALID_RESULTS: ReadonlySet<SessionResultStatus> = new Set([
  'passed',
  'failed',
  'blocked',
  'not-set',
]);

let activeSessionOwner: symbol | undefined;

export interface SessionManagerOptions {
  clock?: Clock;
  idFactory?: () => string;
}

export interface SessionSummaryMetrics {
  evidence?: Partial<EvidenceCounts>;
  approximateSizeBytes?: number;
  memoryWarningReached?: boolean;
  videoStatus?: VideoCaptureStatus;
  videoRecording?: boolean;
  warnings?: readonly SessionWarning[];
}

/**
 * Owns the strict lifecycle of one session. A module-level lease prevents two
 * TestWitness instances from installing competing recorders at the same time.
 */
export class SessionManager {
  private readonly owner = Symbol('test-witness-session-owner');
  private readonly clock: Clock;
  private readonly idFactory: () => string;
  private status: SessionStatus = 'idle';
  private result: SessionResultStatus = 'not-set';
  private sessionId?: string;
  private startedAt?: Date;
  private endedAt?: Date;

  public constructor(options: SessionManagerOptions = {}) {
    this.clock = options.clock ?? systemClock;
    this.idFactory = options.idFactory ?? createSessionId;
  }

  public start(): SessionSummary {
    if (this.status === 'recording' || this.status === 'paused') {
      throw new TestWitnessError(
        'SESSION_ALREADY_ACTIVE',
        'This TestWitness instance already has an active session.',
      );
    }

    if (this.status === 'stopped') {
      throw new TestWitnessError(
        'INVALID_SESSION_STATE',
        'A stopped SessionManager cannot be restarted. Create a new session manager.',
      );
    }

    if (activeSessionOwner !== undefined) {
      throw new TestWitnessError(
        'SESSION_ALREADY_ACTIVE',
        'Another TestWitness instance already has an active recording session.',
      );
    }

    const sessionId = this.idFactory();
    const startedAt = this.clock();

    activeSessionOwner = this.owner;
    this.sessionId = sessionId;
    this.startedAt = startedAt;
    this.endedAt = undefined;
    this.result = 'not-set';
    this.status = 'recording';

    return this.getSummary();
  }

  public pause(): SessionSummary {
    this.assertActive('pause');
    if (this.status !== 'recording') {
      throw new TestWitnessError(
        'INVALID_SESSION_STATE',
        'Only a recording session can be paused.',
      );
    }

    this.status = 'paused';
    return this.getSummary();
  }

  public resume(): SessionSummary {
    this.assertActive('resume');
    if (this.status !== 'paused') {
      throw new TestWitnessError('INVALID_SESSION_STATE', 'Only a paused session can be resumed.');
    }

    this.status = 'recording';
    return this.getSummary();
  }

  public setResult(result: SessionResultStatus): SessionSummary {
    this.assertActive('set a result for');
    if (!VALID_RESULTS.has(result)) {
      throw new TestWitnessError(
        'INVALID_SESSION_STATE',
        `Unknown session result: ${String(result)}`,
      );
    }

    this.result = result;
    return this.getSummary();
  }

  public stop(metrics: SessionSummaryMetrics = {}): SessionSummary {
    this.assertActive('stop');
    this.endedAt = this.clock();
    this.status = 'stopped';
    this.releaseLease();
    return this.getSummary(metrics);
  }

  public getStatus(): SessionStatus {
    return this.status;
  }

  public getResult(): SessionResultStatus {
    return this.result;
  }

  public getSessionId(): string | undefined {
    return this.sessionId;
  }

  public getSummary(metrics: SessionSummaryMetrics = {}): SessionSummary {
    const evidence: EvidenceCounts = {
      ...EMPTY_EVIDENCE_COUNTS,
      ...metrics.evidence,
    };

    return {
      sessionId: this.sessionId,
      status: this.status,
      result: this.result,
      startedAt: this.startedAt ? toIsoTimestamp(this.startedAt) : undefined,
      endedAt: this.endedAt ? toIsoTimestamp(this.endedAt) : undefined,
      durationMs: this.durationAt(this.endedAt ?? this.clock()),
      evidence,
      approximateSizeBytes: Math.max(0, metrics.approximateSizeBytes ?? 0),
      memoryWarningReached: metrics.memoryWarningReached ?? false,
      videoStatus: metrics.videoStatus ?? 'off',
      videoRecording: metrics.videoRecording ?? false,
      warnings: [...(metrics.warnings ?? [])],
    };
  }

  private assertActive(action: string): void {
    if (this.status !== 'recording' && this.status !== 'paused') {
      throw new TestWitnessError('NO_ACTIVE_SESSION', `There is no active session to ${action}.`);
    }
  }

  private durationAt(at: Date): number {
    return this.startedAt ? elapsedMilliseconds(this.startedAt, at) : 0;
  }

  private releaseLease(): void {
    if (activeSessionOwner === this.owner) activeSessionOwner = undefined;
  }
}
