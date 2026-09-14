export type EventListener<Payload> = (payload: Payload) => void;

/** Small synchronous event bus used to decouple the core from optional UI adapters. */
export class EventBus<Events extends object> {
  readonly #listeners = new Map<keyof Events, Set<EventListener<Events[keyof Events]>>>();

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
      listener(payload);
    }
  }

  public clear(): void {
    this.#listeners.clear();
  }
}
