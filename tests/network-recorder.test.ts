import { afterEach, describe, expect, it, vi } from 'vitest';

import { NetworkRecorder, type NetworkTarget } from '../src/capture/NetworkRecorder';
import { DataSanitizer } from '../src/privacy/DataSanitizer';
import type { ResolvedTestWitnessConfig } from '../src/types/config';
import type { NetworkErrorRecord, NetworkRequestRecord } from '../src/types/evidence';

const BASE_CONFIG: ResolvedTestWitnessConfig['network'] = {
  enabled: true,
  captureSuccessfulRequests: false,
  captureFailedFetch: true,
  captureFailedXhr: true,
  captureRequestBody: false,
  captureResponseBody: false,
};

const activeRecorders: NetworkRecorder[] = [];

class FakeXMLHttpRequest extends EventTarget {
  public status = 0;
  public responseType: XMLHttpRequestResponseType = '';
  public responseText = '';
  public responseValue: unknown = null;
  public responseHeaders = '';
  public openedMethod = '';
  public openedUrl = '';
  public sentBody: Document | XMLHttpRequestBodyInit | null = null;
  public readonly requestHeaders: Record<string, string> = {};

  public get response(): unknown {
    return this.responseValue;
  }

  public open(method: string, url: string | URL): void {
    this.openedMethod = method;
    this.openedUrl = String(url);
  }

  public setRequestHeader(name: string, value: string): void {
    this.requestHeaders[name] = value;
  }

  public send(body: Document | XMLHttpRequestBodyInit | null = null): void {
    this.sentBody = body;
  }

  public getAllResponseHeaders(): string {
    return this.responseHeaders;
  }

  public complete(status: number): void {
    this.status = status;
    this.dispatchEvent(new Event('loadend'));
  }

  public fail(type: 'error' | 'timeout' | 'abort'): void {
    this.dispatchEvent(new Event(type));
    this.dispatchEvent(new Event('loadend'));
  }
}

function xhrConstructor(): typeof XMLHttpRequest {
  return FakeXMLHttpRequest as unknown as typeof XMLHttpRequest;
}

function createRecorder(
  target: NetworkTarget,
  records: NetworkErrorRecord[],
  config: Partial<ResolvedTestWitnessConfig['network']> = {},
  onError = vi.fn(),
  requests: NetworkRequestRecord[] = [],
): NetworkRecorder {
  let monotonicTime = 0;
  let idSequence = 0;
  const recorder = new NetworkRecorder({
    config: { ...BASE_CONFIG, ...config },
    sanitizer: new DataSanitizer(),
    target,
    onRecord: (record) => records.push(record),
    onRequest: (record) => requests.push(record),
    onError,
    timestampProvider: () => '2026-09-07T18:00:00.000Z',
    monotonicTimeProvider: () => {
      monotonicTime += 10;
      return monotonicTime;
    },
    idFactory: () => `network-${(idSequence += 1)}`,
  });
  activeRecorders.push(recorder);
  return recorder;
}

afterEach(() => {
  for (const recorder of activeRecorders.splice(0)) recorder.stop();
});

describe('NetworkRecorder fetch interception', () => {
  it('returns the exact Promise and records sanitized HTTP failures without consuming bodies', async () => {
    const response = new Response('secret response body', {
      status: 503,
      headers: { 'x-api-key': 'response-secret', 'content-type': 'text/plain' },
    });
    const originalPromise = Promise.resolve(response);
    const originalFetch = vi.fn(() => originalPromise) as unknown as typeof fetch;
    const target: NetworkTarget = { fetch: originalFetch };
    const records: NetworkErrorRecord[] = [];
    const requests: NetworkRequestRecord[] = [];
    const recorder = createRecorder(
      target,
      records,
      { captureFailedXhr: false },
      vi.fn(),
      requests,
    );
    recorder.start();

    const returnedPromise = target.fetch?.('https://example.test/api?access_token=request-secret', {
      method: 'post',
      headers: { Authorization: 'Bearer credential', Accept: 'application/json' },
      body: '{"password":"request-body-secret"}',
    });

    expect(returnedPromise).toBe(originalPromise);
    expect(await returnedPromise).toBe(response);
    await recorder.drain();
    expect(await response.text()).toBe('secret response body');
    expect(records).toEqual([
      expect.objectContaining({
        transport: 'fetch',
        method: 'POST',
        status: 503,
        failureType: 'http-error',
        requestHeaders: {
          accept: 'application/json',
          authorization: '[REDACTED]',
        },
        responseHeaders: {
          'content-type': 'text/plain',
          'x-api-key': '[REDACTED]',
        },
      }),
    ]);
    expect(records[0]?.requestBody).toBeUndefined();
    expect(records[0]?.responseBody).toBeUndefined();
    expect(records[0]?.url).not.toContain('request-secret');
    expect(requests).toEqual([
      expect.objectContaining({
        id: records[0]?.id,
        method: 'POST',
        status: 503,
        outcome: 'http-error',
      }),
    ]);
  });

  it('records privacy-minimized successful fetch metadata only after explicit opt-in', async () => {
    const originalFetch = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 201 })),
    ) as unknown as typeof fetch;
    const target: NetworkTarget = { fetch: originalFetch };
    const records: NetworkErrorRecord[] = [];
    const requests: NetworkRequestRecord[] = [];
    const recorder = createRecorder(
      target,
      records,
      {
        captureSuccessfulRequests: true,
        captureFailedFetch: false,
        captureFailedXhr: false,
      },
      vi.fn(),
      requests,
    );
    recorder.start();

    const response = await target.fetch?.(
      'https://example.test/api/users?access_token=secret&view=summary',
      { method: 'post', body: 'never-stored' },
    );
    await recorder.drain();

    expect(response?.status).toBe(201);
    expect(records).toEqual([]);
    expect(requests).toEqual([
      expect.objectContaining({
        transport: 'fetch',
        method: 'POST',
        status: 201,
        outcome: 'success',
      }),
    ]);
    expect(requests[0]?.url).toContain('view=summary');
    expect(requests[0]?.url).not.toContain('secret');
    expect(JSON.stringify(requests)).not.toContain('never-stored');
  });

  it('does not turn disabled fetch failures into request activity when success capture is enabled', async () => {
    const originalFetch = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 503 })),
    ) as unknown as typeof fetch;
    const target: NetworkTarget = { fetch: originalFetch };
    const records: NetworkErrorRecord[] = [];
    const requests: NetworkRequestRecord[] = [];
    const recorder = createRecorder(
      target,
      records,
      {
        captureSuccessfulRequests: true,
        captureFailedFetch: false,
        captureFailedXhr: false,
      },
      vi.fn(),
      requests,
    );
    recorder.start();

    const response = await target.fetch?.('https://example.test/api/unavailable');
    await recorder.drain();

    expect(response?.status).toBe(503);
    expect(records).toEqual([]);
    expect(requests).toEqual([]);
  });

  it('classifies network, abort, and timeout rejections while preserving rejection objects', async () => {
    const networkError = new TypeError('offline');
    const abortError = new DOMException('cancelled', 'AbortError');
    const timeoutError = new DOMException('slow', 'TimeoutError');
    const failures = [networkError, abortError, timeoutError];
    const originalFetch = vi
      .fn()
      .mockImplementationOnce(() => Promise.reject(networkError))
      .mockImplementationOnce(() => Promise.reject(abortError))
      .mockImplementationOnce(() => Promise.reject(timeoutError)) as unknown as typeof fetch;
    const target: NetworkTarget = { fetch: originalFetch };
    const records: NetworkErrorRecord[] = [];
    const recorder = createRecorder(target, records, { captureFailedXhr: false });
    recorder.start();

    for (const failure of failures) {
      await expect(target.fetch?.('https://example.test/fail')).rejects.toBe(failure);
    }
    await recorder.drain();

    expect(records.map((record) => record.failureType)).toEqual([
      'network-error',
      'abort',
      'timeout',
    ]);
  });

  it('ignores successes, paused calls, and recorder-suppressed calls', async () => {
    const originalFetchMock = vi.fn(() => Promise.resolve(new Response('', { status: 500 })));
    const originalFetch = originalFetchMock as unknown as typeof fetch;
    const target: NetworkTarget = { fetch: originalFetch };
    const records: NetworkErrorRecord[] = [];
    const recorder = createRecorder(target, records, { captureFailedXhr: false });
    recorder.start();

    recorder.pause();
    await target.fetch?.('https://example.test/paused');
    recorder.resume();
    await recorder.runSuppressed(async () => {
      await target.fetch?.('https://example.test/internal-render-resource');
    });
    originalFetchMock.mockImplementationOnce(() =>
      Promise.resolve(new Response(null, { status: 204 })),
    );
    await target.fetch?.('https://example.test/success');
    await recorder.drain();

    expect(records).toEqual([]);
  });

  it('captures bounded sanitized bodies only after explicit opt-in', async () => {
    const response = new Response('{"password":"response-secret","ok":true}', { status: 400 });
    const originalFetch = vi.fn(() => Promise.resolve(response)) as unknown as typeof fetch;
    const target: NetworkTarget = { fetch: originalFetch };
    const records: NetworkErrorRecord[] = [];
    const recorder = createRecorder(target, records, {
      captureFailedXhr: false,
      captureRequestBody: true,
      captureResponseBody: true,
    });
    recorder.start();

    await target.fetch?.('https://example.test/body', {
      method: 'POST',
      body: '{"access_token":"request-secret","safe":true}',
    });
    await recorder.drain();

    const serialized = JSON.stringify(records);
    expect(serialized).not.toContain('request-secret');
    expect(serialized).not.toContain('response-secret');
    expect(records[0]?.requestBody).toBeDefined();
    expect(records[0]?.responseBody).toBeDefined();
  });

  it('restores its wrapper and never clobbers a later fetch patch', () => {
    const originalFetch = vi.fn(() => Promise.resolve(new Response())) as unknown as typeof fetch;
    const target: NetworkTarget = { fetch: originalFetch };
    const recorder = createRecorder(target, [], { captureFailedXhr: false });
    recorder.start();
    const wrapper = target.fetch;
    recorder.start();
    expect(target.fetch).toBe(wrapper);
    recorder.stop();
    expect(target.fetch).toBe(originalFetch);

    recorder.start();
    const laterPatch = vi.fn(() => Promise.resolve(new Response())) as unknown as typeof fetch;
    target.fetch = laterPatch;
    recorder.stop();
    expect(target.fetch).toBe(laterPatch);
  });

  it('invalidates a pending fetch observer when the recorder stops', async () => {
    let resolveResponse: ((response: Response) => void) | undefined;
    const originalPromise = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const target: NetworkTarget = {
      fetch: vi.fn(() => originalPromise),
    };
    const records: NetworkErrorRecord[] = [];
    const recorder = createRecorder(target, records, { captureFailedXhr: false });
    recorder.start();

    const hostPromise = target.fetch?.('https://example.test/late');
    recorder.stop();
    resolveResponse?.(new Response('', { status: 500 }));
    await hostPromise;
    await recorder.drain();

    expect(records).toEqual([]);
  });

  it('never replaces an original synchronous fetch error with capture failures', () => {
    const hostError = new TypeError('native fetch failure');
    const originalFetch = vi.fn(() => {
      throw hostError;
    }) as unknown as typeof fetch;
    class ThrowingSanitizer extends DataSanitizer {
      public override sanitizeUrl(): string {
        throw new Error('sanitizer failure');
      }
    }
    const onError = vi.fn();
    const target: NetworkTarget = { fetch: originalFetch };
    const recorder = new NetworkRecorder({
      config: { ...BASE_CONFIG, captureFailedXhr: false },
      sanitizer: new ThrowingSanitizer(),
      target,
      onRecord: vi.fn(),
      onError,
    });
    activeRecorders.push(recorder);
    recorder.start();

    expect(() => target.fetch?.('https://example.test/sync-error')).toThrow(hostError);
    expect(onError).toHaveBeenCalled();
  });
});

describe('NetworkRecorder XMLHttpRequest interception', () => {
  it('records successful XHR endpoint metadata when explicitly enabled', () => {
    const records: NetworkErrorRecord[] = [];
    const requests: NetworkRequestRecord[] = [];
    const recorder = createRecorder(
      { XMLHttpRequest: xhrConstructor() },
      records,
      {
        captureSuccessfulRequests: true,
        captureFailedFetch: false,
        captureFailedXhr: false,
      },
      vi.fn(),
      requests,
    );
    recorder.start();
    const xhr = new FakeXMLHttpRequest();
    xhr.open('GET', 'https://example.test/api/profile?csrf_token=private');
    xhr.send();
    xhr.complete(200);

    expect(records).toEqual([]);
    expect(requests).toEqual([
      expect.objectContaining({
        transport: 'xhr',
        method: 'GET',
        status: 200,
        outcome: 'success',
      }),
    ]);
    expect(requests[0]?.url).not.toContain('private');
  });

  it('records 4xx/5xx once with sanitized headers and restores prototype methods', () => {
    const constructor = xhrConstructor();
    const prototype = FakeXMLHttpRequest.prototype;
    const originalOpen = Object.getOwnPropertyDescriptor(prototype, 'open');
    const originalSend = Object.getOwnPropertyDescriptor(prototype, 'send');
    const originalSetHeader = Object.getOwnPropertyDescriptor(prototype, 'setRequestHeader');
    const records: NetworkErrorRecord[] = [];
    const recorder = createRecorder({ XMLHttpRequest: constructor }, records, {
      captureFailedFetch: false,
    });
    recorder.start();

    const xhr = new FakeXMLHttpRequest();
    xhr.open('PATCH', 'https://example.test/resource?session_id=private');
    xhr.setRequestHeader('Authorization', 'Bearer secret');
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.responseHeaders = 'Content-Type: application/json\r\nSet-Cookie: session=secret';
    xhr.send('{"password":"not-captured"}');
    xhr.complete(500);
    xhr.dispatchEvent(new Event('loadend'));

    expect(records).toHaveLength(1);
    expect(records[0]).toEqual(
      expect.objectContaining({
        transport: 'xhr',
        method: 'PATCH',
        status: 500,
        failureType: 'http-error',
        requestHeaders: {
          accept: 'application/json',
          authorization: '[REDACTED]',
        },
        responseHeaders: {
          'content-type': 'application/json',
          'set-cookie': '[REDACTED]',
        },
      }),
    );
    expect(records[0]?.url).not.toContain('private');
    expect(records[0]?.requestBody).toBeUndefined();

    recorder.stop();
    expect(Object.getOwnPropertyDescriptor(prototype, 'open')).toEqual(originalOpen);
    expect(Object.getOwnPropertyDescriptor(prototype, 'send')).toEqual(originalSend);
    expect(Object.getOwnPropertyDescriptor(prototype, 'setRequestHeader')).toEqual(
      originalSetHeader,
    );
  });

  it.each([
    ['error', 'network-error'],
    ['timeout', 'timeout'],
    ['abort', 'abort'],
  ] as const)('classifies %s and deduplicates its following loadend', (event, failureType) => {
    const records: NetworkErrorRecord[] = [];
    const recorder = createRecorder({ XMLHttpRequest: xhrConstructor() }, records, {
      captureFailedFetch: false,
    });
    recorder.start();
    const xhr = new FakeXMLHttpRequest();
    xhr.open('GET', 'https://example.test/failure');
    xhr.send();

    xhr.fail(event);

    expect(records).toHaveLength(1);
    expect(records[0]?.failureType).toBe(failureType);
  });

  it('captures sanitized XHR bodies only when opted in and gates paused calls', () => {
    const records: NetworkErrorRecord[] = [];
    const recorder = createRecorder({ XMLHttpRequest: xhrConstructor() }, records, {
      captureFailedFetch: false,
      captureRequestBody: true,
      captureResponseBody: true,
    });
    recorder.start();

    recorder.pause();
    const pausedXhr = new FakeXMLHttpRequest();
    pausedXhr.open('GET', 'https://example.test/paused');
    pausedXhr.send();
    pausedXhr.complete(500);

    recorder.resume();
    const xhr = new FakeXMLHttpRequest();
    xhr.open('POST', 'https://example.test/body');
    xhr.send('{"password":"request-secret"}');
    xhr.responseText = '{"refresh_token":"response-secret"}';
    xhr.complete(400);

    const serialized = JSON.stringify(records);
    expect(records).toHaveLength(1);
    expect(records[0]?.requestBody).toBeDefined();
    expect(records[0]?.responseBody).toBeDefined();
    expect(serialized).not.toContain('request-secret');
    expect(serialized).not.toContain('response-secret');
  });

  it('rolls back earlier XHR patches when a later method cannot be instrumented', () => {
    class LockedSendXMLHttpRequest extends FakeXMLHttpRequest {}
    Object.defineProperty(LockedSendXMLHttpRequest.prototype, 'send', {
      configurable: false,
      value: () => undefined,
      writable: false,
    });
    const prototype = LockedSendXMLHttpRequest.prototype;
    const openBefore = Object.getOwnPropertyDescriptor(prototype, 'open');
    const recorder = createRecorder(
      {
        XMLHttpRequest: LockedSendXMLHttpRequest as unknown as typeof XMLHttpRequest,
      },
      [],
      { captureFailedFetch: false },
    );

    expect(() => recorder.start()).toThrowError(
      expect.objectContaining({ code: 'INSTRUMENTATION_FAILED' }),
    );
    expect(Object.getOwnPropertyDescriptor(prototype, 'open')).toEqual(openBefore);
  });
});
