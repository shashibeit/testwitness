import { describe, expect, it, vi } from 'vitest';

import { EventBus } from '../src/core/EventBus';

interface Events {
  status: { value: string };
  warning: string;
}

describe('EventBus', () => {
  it('delivers typed payloads and supports unsubscribe', () => {
    const bus = new EventBus<Events>();
    const listener = vi.fn();
    const unsubscribe = bus.on('status', listener);

    bus.emit('status', { value: 'recording' });
    unsubscribe();
    bus.emit('status', { value: 'paused' });

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({ value: 'recording' });
  });

  it('uses a snapshot so listeners can safely unsubscribe during emission', () => {
    const bus = new EventBus<Events>();
    const second = vi.fn();
    let unsubscribeSecond = (): void => undefined;
    bus.on('warning', () => unsubscribeSecond());
    unsubscribeSecond = bus.on('warning', second);

    bus.emit('warning', 'threshold');
    bus.emit('warning', 'again');

    expect(second).toHaveBeenCalledOnce();
  });
});
