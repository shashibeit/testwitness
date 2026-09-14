import { describe, expect, it } from 'vitest';

import {
  DEFAULT_REDACT_HEADERS,
  DEFAULT_SENSITIVE_FIELD_NAMES,
  DEFAULT_SENSITIVE_QUERY_PARAMETERS,
  resolveTestWitnessConfig,
} from '../src/core/config';
import type { ConsoleLevel, TestWitnessConfig } from '../src/types/config';
import { TestWitnessError } from '../src/utils/errors';

const minimalConfig = (): TestWitnessConfig => ({
  applicationName: 'Customer Portal',
  environment: 'QA',
});

function expectInvalid(config: TestWitnessConfig, path: string): void {
  try {
    resolveTestWitnessConfig(config);
    throw new Error('Expected configuration resolution to fail');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(TestWitnessError);
    if (error instanceof TestWitnessError) {
      expect(error.code).toBe('INVALID_CONFIG');
      expect(error.message).toContain(path);
    }
  }
}

describe('resolveTestWitnessConfig', () => {
  it('trims required values and supplies privacy-first defaults', () => {
    const resolved = resolveTestWitnessConfig({
      applicationName: '  Customer Portal  ',
      environment: '  QA  ',
    });

    expect(resolved.applicationName).toBe('Customer Portal');
    expect(resolved.environment).toBe('QA');
    expect(resolved.screenshot).toEqual({
      enabled: true,
      format: 'png',
      quality: 0.92,
      captureOnError: false,
      captureOnStart: false,
      captureOnNavigation: false,
      autoCaptureIntervalSeconds: 0,
      maxAutomaticScreenshots: 50,
    });
    expect(resolved.video).toEqual({
      enabled: false,
      mimeType: 'video/webm',
      maxDurationMinutes: 30,
      includeAudio: false,
    });
    expect(resolved.actions.captureTextInputValues).toBe(false);
    expect(resolved.network.captureRequestBody).toBe(false);
    expect(resolved.network.captureResponseBody).toBe(false);
    expect(resolved.network.captureSuccessfulRequests).toBe(false);
    expect(resolved.toolbar).toEqual({ enabled: false, position: 'bottom-right' });
    expect(resolved.export.fileNamePattern).toBe('TestWitness-{testCaseId}-{timestamp}.zip');
    expect(resolved.memory.warningThresholdMb).toBe(250);
  });

  it('keeps body and text-value capture as explicit boolean opt-ins', () => {
    const resolved = resolveTestWitnessConfig({
      ...minimalConfig(),
      actions: { captureTextInputValues: true },
      network: {
        captureSuccessfulRequests: true,
        captureRequestBody: true,
        captureResponseBody: true,
      },
      video: { enabled: true, includeAudio: true },
      screenshot: {
        captureOnStart: false,
        captureOnNavigation: false,
        captureOnError: true,
        autoCaptureIntervalSeconds: 15,
        maxAutomaticScreenshots: 40,
      },
    });

    expect(resolved.actions.captureTextInputValues).toBe(true);
    expect(resolved.network.captureRequestBody).toBe(true);
    expect(resolved.network.captureResponseBody).toBe(true);
    expect(resolved.network.captureSuccessfulRequests).toBe(true);
    expect(resolved.video.enabled).toBe(true);
    expect(resolved.video.includeAudio).toBe(true);
    expect(resolved.screenshot).toMatchObject({
      captureOnStart: false,
      captureOnNavigation: false,
      captureOnError: true,
      autoCaptureIntervalSeconds: 15,
      maxAutomaticScreenshots: 40,
    });
  });

  it('always unions and case-insensitively deduplicates protected names', () => {
    const resolved = resolveTestWitnessConfig({
      ...minimalConfig(),
      privacy: {
        redactHeaders: ['Authorization', 'X-Customer-Secret', 'x-customer-secret'],
        sensitiveQueryParameters: ['ACCESS_TOKEN', 'signature', 'Signature'],
        sensitiveFieldNames: ['Password', 'customerPin', 'CUSTOMERPIN'],
      },
    });

    expect(resolved.privacy.redactHeaders).toEqual(
      expect.arrayContaining(['authorization', 'cookie', 'set-cookie', 'x-api-key']),
    );
    expect(
      resolved.privacy.redactHeaders.filter((name) => name === 'X-Customer-Secret'),
    ).toHaveLength(1);
    expect(resolved.privacy.sensitiveQueryParameters).toEqual(
      expect.arrayContaining(['access_token', 'session_id', 'signature']),
    );
    expect(resolved.privacy.sensitiveFieldNames).toEqual(
      expect.arrayContaining(['password', 'session_id', 'customerPin']),
    );
  });

  it('returns detached arrays and does not share mutable defaults between calls', () => {
    const levels: ConsoleLevel[] = ['error'];
    const maskSelectors = ['.account-number'];
    const redactHeaders = ['x-private'];
    const input: TestWitnessConfig = {
      ...minimalConfig(),
      console: { levels },
      privacy: { maskSelectors, redactHeaders },
    };

    const first = resolveTestWitnessConfig(input);
    levels.push('warn');
    maskSelectors.push('.late-mutation');
    redactHeaders[0] = 'changed';

    expect(first.console.levels).toEqual(['error']);
    expect(first.privacy.maskSelectors).toContain('.account-number');
    expect(first.privacy.maskSelectors).not.toContain('.late-mutation');
    expect(first.privacy.redactHeaders).toContain('x-private');
    expect(first.privacy.redactHeaders).not.toContain('changed');

    first.console.levels.push('warn');
    first.privacy.redactHeaders.push('mutated-result');
    const second = resolveTestWitnessConfig(minimalConfig());

    expect(second.console.levels).toEqual(['warn', 'error']);
    expect(second.privacy.redactHeaders).not.toContain('mutated-result');
  });

  it('exports runtime-immutable mandatory privacy defaults', () => {
    expect(Object.isFrozen(DEFAULT_REDACT_HEADERS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_SENSITIVE_QUERY_PARAMETERS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_SENSITIVE_FIELD_NAMES)).toBe(true);
  });

  it.each([
    [{ applicationName: '', environment: 'QA' }, 'applicationName'],
    [{ applicationName: '   ', environment: 'QA' }, 'applicationName'],
    [{ applicationName: 'Portal', environment: '' }, 'environment'],
    [{ applicationName: 'Portal', environment: '   ' }, 'environment'],
  ] as const)('rejects blank required strings', (config, path) => {
    expectInvalid(config, path);
  });

  it.each([-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid screenshot quality %s',
    (quality) => {
      expectInvalid({ ...minimalConfig(), screenshot: { quality } }, 'screenshot.quality');
    },
  );

  it.each([-1, 3_600.01, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid automatic screenshot interval %s',
    (autoCaptureIntervalSeconds) => {
      expectInvalid(
        { ...minimalConfig(), screenshot: { autoCaptureIntervalSeconds } },
        'screenshot.autoCaptureIntervalSeconds',
      );
    },
  );

  it.each([0, 1.5, 1_001, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid automatic screenshot maximum %s',
    (maxAutomaticScreenshots) => {
      expectInvalid(
        { ...minimalConfig(), screenshot: { maxAutomaticScreenshots } },
        'screenshot.maxAutomaticScreenshots',
      );
    },
  );

  it.each([0, -1, 120.01, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid maximum duration %s',
    (maxDurationMinutes) => {
      expectInvalid(
        { ...minimalConfig(), video: { maxDurationMinutes } },
        'video.maxDurationMinutes',
      );
    },
  );

  it.each([0, -1, 4_096.01, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid memory warning threshold %s',
    (warningThresholdMb) => {
      expectInvalid(
        { ...minimalConfig(), memory: { warningThresholdMb } },
        'memory.warningThresholdMb',
      );
    },
  );

  it.each(['', 'audio/webm', 'video/', 'video/webm;', 'video/webm\ntext/plain'])(
    'rejects invalid video MIME type %j',
    (mimeType) => {
      expectInvalid({ ...minimalConfig(), video: { mimeType } }, 'video.mimeType');
    },
  );

  it('rejects unsupported enum members and invalid array entries', () => {
    expectInvalid(
      {
        ...minimalConfig(),
        screenshot: { format: 'webp' },
      } as unknown as TestWitnessConfig,
      'screenshot.format',
    );
    expectInvalid(
      {
        ...minimalConfig(),
        console: { levels: ['info'] },
      } as unknown as TestWitnessConfig,
      'console.levels[0]',
    );
    expectInvalid(
      {
        ...minimalConfig(),
        toolbar: { position: 'center' },
      } as unknown as TestWitnessConfig,
      'toolbar.position',
    );
    expectInvalid(
      {
        ...minimalConfig(),
        privacy: { redactHeaders: [''] },
      },
      'privacy.redactHeaders[0]',
    );
  });

  it('rejects non-boolean truthy values instead of treating them as opt-ins', () => {
    expectInvalid(
      {
        ...minimalConfig(),
        network: { captureRequestBody: 'true' },
      } as unknown as TestWitnessConfig,
      'network.captureRequestBody',
    );
    expectInvalid(
      {
        ...minimalConfig(),
        network: { captureSuccessfulRequests: 'yes' },
      } as unknown as TestWitnessConfig,
      'network.captureSuccessfulRequests',
    );
  });

  it('throws the public typed error for invalid configuration', () => {
    try {
      resolveTestWitnessConfig({ applicationName: '', environment: 'QA' });
      throw new Error('Expected configuration resolution to fail');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(TestWitnessError);
      if (error instanceof TestWitnessError) {
        expect(error.code).toBe('INVALID_CONFIG');
      }
    }
  });
});
