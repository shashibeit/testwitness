export type EventListener<Payload> = (payload: Payload) => void;

export interface EventBusOptions<Events extends object> {
  /** Receives subscriber failures after the bus isolates them from the emitting operation. */
  onListenerError?: (error: unknown, event: keyof Events) => void;
}

function reportListenerError(error: unknown): void {
  try {
    const reportError = Reflect.get(globalThis, 'reportError');
    if (typeof reportError === 'function') {
      Reflect.apply(reportError, globalThis, [error]);
      return;
    }
  } catch {
    // Diagnostics must never escape into the application operation that emitted the event.
  }
  try {
    console.error('A TestWitness event listener failed.', error);
  } catch {
    // A host may replace console methods. Listener isolation still takes precedence.
  }
}

/** Small synchronous event bus used to decouple the core from optional UI adapters. */
export class EventBus<Events extends object> {
  readonly #listeners = new Map<keyof Events, Set<EventListener<Events[keyof Events]>>>();
  readonly #onListenerError: (error: unknown, event: keyof Events) => void;

  public constructor(options: EventBusOptions<Events> = {}) {
    this.#onListenerError = options.onListenerError ?? ((error) => reportListenerError(error));
  }

  public on<Key extends keyof Events>(
    event: Key,
    listener: EventListener<Events[Key]>,
  ): () => void {
    const listeners = this.#listeners.get(event) ?? new Set<EventListener<Events[keyof Events]>>();
    listeners.add(listener as EventListener<Events[keyof Events]>);
    this.#listeners.set(event, listeners);

    return () => this.off(event, listener);
  }

  public off<Key extends keyof Events>(event: Key, listener: EventListener<Events[Key]>): void {
    const listeners = this.#listeners.get(event);
    listeners?.delete(listener as EventListener<Events[keyof Events]>);
    if (listeners?.size === 0) this.#listeners.delete(event);
  }

  public emit<Key extends keyof Events>(event: Key, payload: Events[Key]): void {
    const listeners = this.#listeners.get(event);
    if (!listeners) return;

    for (const listener of [...listeners]) {
      try {
        listener(payload);
      } catch (error) {
        try {
          this.#onListenerError(error, event);
        } catch (reportingError) {
          reportListenerError(error);
          reportListenerError(reportingError);
        }
      }
    }
  }

  public clear(): void {
    this.#listeners.clear();
  }
}
