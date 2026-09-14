import { describe, expect, it } from 'vitest';

import { DataSanitizer, REDACTED_VALUE } from '../src/privacy/DataSanitizer';

describe('DataSanitizer', () => {
  it('always redacts mandatory and configured headers case-insensitively', () => {
    const sanitizer = new DataSanitizer({ redactHeaders: ['x-company-secret'] });

    expect(
      sanitizer.sanitizeHeaders({
        Authorization: 'Bearer top-secret',
        Cookie: 'session=abc',
        'Set-Cookie': 'id=abc',
        'X-API-Key': 'abc',
        'X-Access-Token': 'access-token-value',
        'Refresh-Token': 'refresh-token-value',
        'X-CSRF-Token': 'csrf',
        Password: 'password-value',
        'X-Session-ID': 'session-id-value',
        'X-Company-Secret': 'company',
        Accept: 'application/json',
      }),
    ).toEqual({
      accept: 'application/json',
      authorization: REDACTED_VALUE,
      cookie: REDACTED_VALUE,
      'set-cookie': REDACTED_VALUE,
      password: REDACTED_VALUE,
      'refresh-token': REDACTED_VALUE,
      'x-access-token': REDACTED_VALUE,
      'x-api-key': REDACTED_VALUE,
      'x-company-secret': REDACTED_VALUE,
      'x-csrf-token': REDACTED_VALUE,
      'x-session-id': REDACTED_VALUE,
    });
  });

  it('redacts repeated, encoded, custom, credential, and hash query values', () => {
    const sanitizer = new DataSanitizer({ sensitiveQueryParameters: ['private-code'] });
    const sanitized = sanitizer.sanitizeUrl(
      'https://user:pass@example.test/a;jsessionid=id?access%5Ftoken=one&access_token=two&private-code=three&safe=yes#/route?csrf_token=four&view=list',
    );

    expect(sanitized).not.toContain('one');
    expect(sanitized).not.toContain('two');
    expect(sanitized).not.toContain('three');
    expect(sanitized).not.toContain('four');
    expect(sanitized).not.toContain('user:pass');
    expect(sanitized).not.toContain('jsessionid=id');
    expect(sanitized).toContain('safe=yes');
    expect(sanitized).toContain('view=list');
  });

  it('sanitizes nested values without reading sensitive or throwing properties', () => {
    const sanitizer = new DataSanitizer();
    let getterCalls = 0;
    const value: Record<string, unknown> = {
      password: 'never',
      cookie: 'preference=private',
      safe: 'ok',
    };
    Object.defineProperty(value, 'accessToken', {
      enumerable: true,
      get: () => {
        throw new Error('must not be read');
      },
    });
    Object.defineProperty(value, 'computed', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return 'side effect';
      },
    });
    value.self = value;

    expect(sanitizer.sanitizeValue(value)).toEqual({
      password: REDACTED_VALUE,
      cookie: REDACTED_VALUE,
      safe: 'ok',
      accessToken: REDACTED_VALUE,
      computed: '[Getter]',
      self: '[Circular]',
    });
    expect(getterCalls).toBe(0);
  });

  it('redacts embedded credentials and bounds text', () => {
    const sanitizer = new DataSanitizer();

    expect(sanitizer.sanitizeText('Authorization: Bearer abc.def password=super-secret')).toBe(
      'Authorization: [REDACTED] password=[REDACTED]',
    );
    expect(sanitizer.sanitizeText('abcdefgh', 4)).toBe('abcd…');
  });

  it('never serializes file contents or sensitive form values', () => {
    const sanitizer = new DataSanitizer();
    const form = new FormData();
    form.append('username', 'tester');
    form.append('password', 'never');
    form.append('attachment', new File(['private bytes'], 'secret.txt'));

    const result = sanitizer.sanitizeBody(form);
    const serialized = JSON.stringify(result);
    expect(result).toEqual({
      username: 'tester',
      password: REDACTED_VALUE,
      attachment: '[BINARY OMITTED]',
    });
    expect(serialized).not.toContain('never');
    expect(serialized).not.toContain('private bytes');
  });
});
