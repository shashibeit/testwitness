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

  it('isolates a failing subscriber and continues delivering the event', () => {
    const onListenerError = vi.fn();
    const bus = new EventBus<Events>({ onListenerError });
    const failure = new Error('consumer render failed');
    const second = vi.fn();
    bus.on('status', () => {
      throw failure;
    });
    bus.on('status', second);

    expect(() => bus.emit('status', { value: 'recording' })).not.toThrow();
    expect(second).toHaveBeenCalledWith({ value: 'recording' });
    expect(onListenerError).toHaveBeenCalledWith(failure, 'status');
  });

  it('does not let a failing listener-error reporter break the emitter', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const bus = new EventBus<Events>({
      onListenerError: () => {
        throw new Error('reporter failed');
      },
    });
    bus.on('warning', () => {
      throw new Error('listener failed');
    });

    expect(() => bus.emit('warning', 'threshold')).not.toThrow();
    expect(consoleError).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });

  it('does not let host diagnostics hooks break listener isolation', () => {
    const originalReportError = Reflect.get(globalThis, 'reportError');
    Reflect.set(globalThis, 'reportError', () => {
      throw new Error('host reportError failed');
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {
      throw new Error('host console failed');
    });
    const bus = new EventBus<Events>();
    bus.on('warning', () => {
      throw new Error('listener failed');
    });

    expect(() => bus.emit('warning', 'threshold')).not.toThrow();

    consoleError.mockRestore();
    if (originalReportError === undefined) Reflect.deleteProperty(globalThis, 'reportError');
    else Reflect.set(globalThis, 'reportError', originalReportError);
  });
});
