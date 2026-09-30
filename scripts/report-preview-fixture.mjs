import { deflateSync } from 'node:zlib';

const REDACTED = '[REDACTED]';
const APP_ORIGIN = 'https://qa.operations.example.invalid';
const API_ORIGIN = 'https://api.qa.operations.example.invalid';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function uint32(value) {
  const result = Buffer.alloc(4);
  result.writeUInt32BE(value >>> 0);
  return result;
}

function crc32(value) {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const checksumInput = Buffer.concat([typeBytes, data]);
  return Buffer.concat([uint32(data.length), typeBytes, data, uint32(crc32(checksumInput))]);
}

function rectangle(pixels, width, height, x, y, rectangleWidth, rectangleHeight, color) {
  const startX = Math.max(0, Math.floor(x));
  const startY = Math.max(0, Math.floor(y));
  const endX = Math.min(width, Math.ceil(x + rectangleWidth));
  const endY = Math.min(height, Math.ceil(y + rectangleHeight));

  for (let row = startY; row < endY; row += 1) {
    for (let column = startX; column < endX; column += 1) {
      const offset = (row * width + column) * 4;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = color[3] ?? 255;
    }
  }
}

function card(pixels, width, height, x, y, cardWidth, cardHeight, accent) {
  rectangle(pixels, width, height, x + 3, y + 4, cardWidth, cardHeight, [211, 222, 232]);
  rectangle(pixels, width, height, x, y, cardWidth, cardHeight, [255, 255, 255]);
  rectangle(pixels, width, height, x, y, 7, cardHeight, accent);
  rectangle(pixels, width, height, x + 22, y + 21, cardWidth * 0.46, 8, [44, 62, 80]);
  rectangle(pixels, width, height, x + 22, y + 43, cardWidth * 0.28, 18, accent);
  rectangle(pixels, width, height, x + 22, y + 76, cardWidth * 0.62, 6, [188, 201, 213]);
}

function createScreenshotPixels(variant) {
  const width = 960;
  const height = 540;
  const pixels = new Uint8Array(width * height * 4);
  rectangle(pixels, width, height, 0, 0, width, height, [238, 243, 247]);
  rectangle(pixels, width, height, 0, 0, 190, height, [16, 42, 67]);
  rectangle(pixels, width, height, 27, 28, 118, 13, [243, 249, 253]);
  rectangle(pixels, width, height, 26, 83, 138, 37, [29, 92, 138]);
  rectangle(pixels, width, height, 41, 97, 91, 8, [255, 255, 255]);
  for (let row = 0; row < 5; row += 1) {
    rectangle(pixels, width, height, 41, 153 + row * 45, 92 + row * 7, 8, [145, 169, 190]);
  }
  rectangle(pixels, width, height, 190, 0, width - 190, 66, [255, 255, 255]);
  rectangle(pixels, width, height, 221, 25, 214, 14, [30, 53, 72]);
  rectangle(pixels, width, height, 829, 18, 36, 36, [23, 105, 170]);
  rectangle(pixels, width, height, 876, 25, 57, 8, [82, 102, 122]);

  const accents =
    variant === 'failure'
      ? [
          [165, 29, 45],
          [23, 105, 170],
          [128, 80, 0],
        ]
      : [
          [23, 105, 170],
          [23, 107, 58],
          [101, 76, 176],
        ];
  card(pixels, width, height, 222, 94, 214, 105, accents[0]);
  card(pixels, width, height, 459, 94, 214, 105, accents[1]);
  card(pixels, width, height, 696, 94, 214, 105, accents[2]);

  rectangle(pixels, width, height, 222, 225, 688, 274, [255, 255, 255]);
  rectangle(pixels, width, height, 244, 247, 204, 12, [30, 53, 72]);
  rectangle(pixels, width, height, 244, 276, 643, 2, [211, 222, 232]);
  for (let row = 0; row < 6; row += 1) {
    const top = 298 + row * 31;
    rectangle(pixels, width, height, 244, top, 126, 8, [86, 106, 124]);
    rectangle(pixels, width, height, 417, top, 151, 8, [135, 151, 166]);
    rectangle(
      pixels,
      width,
      height,
      613,
      top - 4,
      71,
      17,
      row % 3 === 2 ? [253, 231, 234] : [226, 244, 232],
    );
    rectangle(
      pixels,
      width,
      height,
      629,
      top + 2,
      39,
      5,
      row % 3 === 2 ? [165, 29, 45] : [23, 107, 58],
    );
    rectangle(pixels, width, height, 743, top, 117, 8, [135, 151, 166]);
  }

  if (variant === 'failure') {
    rectangle(pixels, width, height, 217, 72, 700, 42, [253, 231, 234]);
    rectangle(pixels, width, height, 217, 72, 7, 42, [165, 29, 45]);
    rectangle(pixels, width, height, 241, 88, 354, 9, [165, 29, 45]);
  }

  if (variant === 'profile') {
    rectangle(pixels, width, height, 296, 117, 540, 342, [255, 255, 255]);
    rectangle(pixels, width, height, 326, 145, 212, 14, [30, 53, 72]);
    for (let row = 0; row < 4; row += 1) {
      const top = 188 + row * 59;
      rectangle(pixels, width, height, 326, top, 112, 7, [82, 102, 122]);
      rectangle(pixels, width, height, 326, top + 17, 478, 31, [247, 249, 251]);
      rectangle(pixels, width, height, 326, top + 47, 478, 2, [211, 222, 232]);
    }
    rectangle(pixels, width, height, 682, 419, 122, 31, [23, 105, 170]);
  }

  return { width, height, pixels };
}

function createPreviewPng(variant) {
  const { width, height, pixels } = createScreenshotPixels(variant);
  const stride = width * 4 + 1;
  const scanlines = Buffer.alloc(stride * height);
  for (let row = 0; row < height; row += 1) {
    const targetOffset = row * stride;
    scanlines[targetOffset] = 0;
    const sourceOffset = row * width * 4;
    scanlines.set(pixels.subarray(sourceOffset, sourceOffset + width * 4), targetOffset + 1);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const bytes = Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  return new Blob([bytes], { type: 'image/png' });
}

function successfulRequest(overrides) {
  return {
    redirected: false,
    requestMode: 'cors',
    credentialsMode: 'include',
    cacheMode: 'no-store',
    redirectMode: 'follow',
    requestHeaders: {
      accept: 'application/json',
      authorization: REDACTED,
      cookie: REDACTED,
      'x-api-key': REDACTED,
      'x-correlation-id': 'tw-preview-correlation-001',
    },
    requestBodyCapture: { state: 'empty', capturedBytes: 0, originalBytes: 0 },
    responseHeaders: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      'set-cookie': REDACTED,
      'x-request-id': 'preview-request-001',
    },
    responseBodyCapture: { state: 'captured', capturedBytes: 128, originalBytes: 128 },
    responseType: 'basic',
    requestContentType: 'application/json',
    responseContentType: 'application/json; charset=utf-8',
    outcome: 'success',
    ...overrides,
  };
}

function failedRequest(overrides) {
  return successfulRequest({
    outcome: 'http-error',
    responseBodyCapture: { state: 'captured', capturedBytes: 186, originalBytes: 186 },
    ...overrides,
  });
}

function toNetworkError(request) {
  const { outcome, ...record } = request;
  return { ...record, failureType: outcome };
}

function buildNetworkRequests() {
  return [
    successfulRequest({
      id: 'request-login',
      timestamp: '2026-09-24T14:00:12.412Z',
      startedAt: '2026-09-24T14:00:12.228Z',
      completedAt: '2026-09-24T14:00:12.412Z',
      documentUrl: `${APP_ORIGIN}/login`,
      responseUrl: `${API_ORIGIN}/v1/session`,
      transport: 'fetch',
      method: 'POST',
      url: `${API_ORIGIN}/v1/session?source=portal&csrf_token=${encodeURIComponent(REDACTED)}`,
      status: 200,
      statusText: 'OK',
      durationMs: 184,
      requestBodyCapture: { state: 'captured', capturedBytes: 92, originalBytes: 92 },
      requestBody: {
        email: 'qa.tester@example.invalid',
        password: REDACTED,
        rememberMe: false,
      },
      responseBody: {
        user: { id: 'USR-DEMO-104', name: 'Alex Morgan', role: 'QA analyst' },
        accessToken: REDACTED,
        expiresInSeconds: 3600,
      },
    }),
    successfulRequest({
      id: 'request-dashboard-1',
      timestamp: '2026-09-24T14:00:13.061Z',
      startedAt: '2026-09-24T14:00:12.817Z',
      completedAt: '2026-09-24T14:00:13.061Z',
      documentUrl: `${APP_ORIGIN}/dashboard`,
      responseUrl: `${API_ORIGIN}/v1/dashboard/summary?range=7-days`,
      transport: 'fetch',
      method: 'GET',
      url: `${API_ORIGIN}/v1/dashboard/summary?range=7-days&session_id=${encodeURIComponent(REDACTED)}`,
      status: 200,
      statusText: 'OK',
      durationMs: 244,
      requestContentType: undefined,
      requestBodyCapture: { state: 'empty', capturedBytes: 0, originalBytes: 0 },
      responseBodyCapture: { state: 'captured', capturedBytes: 164, originalBytes: 164 },
      responseBody: {
        activeUsers: 1284,
        pendingApprovals: 14,
        successRate: 99.82,
        generatedAt: '2026-09-24T14:00:12.990Z',
      },
    }),
    successfulRequest({
      id: 'request-dashboard-2',
      timestamp: '2026-09-24T14:01:41.009Z',
      startedAt: '2026-09-24T14:01:40.940Z',
      completedAt: '2026-09-24T14:01:41.009Z',
      documentUrl: `${APP_ORIGIN}/dashboard`,
      responseUrl: `${API_ORIGIN}/v1/dashboard/summary?range=30-days`,
      transport: 'xhr',
      method: 'GET',
      url: `${API_ORIGIN}/v1/dashboard/summary?range=30-days`,
      status: 200,
      statusText: 'OK',
      durationMs: 69,
      timeoutMs: 10_000,
      withCredentials: true,
      requestMode: undefined,
      credentialsMode: undefined,
      cacheMode: undefined,
      redirectMode: undefined,
      requestContentType: undefined,
      responseType: 'json',
      responseBody: {
        activeUsers: 1412,
        pendingApprovals: 19,
        successRate: 99.76,
      },
    }),
    successfulRequest({
      id: 'request-access-create',
      timestamp: '2026-09-24T14:04:25.540Z',
      startedAt: '2026-09-24T14:04:25.112Z',
      completedAt: '2026-09-24T14:04:25.540Z',
      documentUrl: `${APP_ORIGIN}/access-request`,
      responseUrl: `${API_ORIGIN}/v1/access-requests`,
      transport: 'fetch',
      method: 'POST',
      url: `${API_ORIGIN}/v1/access-requests`,
      status: 201,
      statusText: 'Created',
      durationMs: 428,
      requestBodyCapture: { state: 'captured', capturedBytes: 154, originalBytes: 154 },
      requestBody: {
        role: 'Audit reviewer',
        justification: 'Synthetic quarterly access review demonstration',
        expiresOn: '2026-10-31',
        csrfToken: REDACTED,
      },
      responseBodyCapture: { state: 'captured', capturedBytes: 118, originalBytes: 118 },
      responseBody: {
        requestId: 'AR-DEMO-1042',
        state: 'pending-approval',
        submittedAt: '2026-09-24T14:04:25.502Z',
      },
    }),
    failedRequest({
      id: 'request-approval-status',
      timestamp: '2026-09-24T14:05:07.877Z',
      startedAt: '2026-09-24T14:05:05.563Z',
      completedAt: '2026-09-24T14:05:07.877Z',
      documentUrl: `${APP_ORIGIN}/access-request`,
      responseUrl: `${API_ORIGIN}/v1/access-requests/AR-DEMO-1042`,
      transport: 'xhr',
      method: 'GET',
      url: `${API_ORIGIN}/v1/access-requests/AR-DEMO-1042`,
      status: 503,
      statusText: 'Service Unavailable',
      durationMs: 2314,
      timeoutMs: 10_000,
      withCredentials: true,
      requestMode: undefined,
      credentialsMode: undefined,
      cacheMode: undefined,
      redirectMode: undefined,
      requestContentType: undefined,
      responseType: 'json',
      responseHeaders: {
        'content-type': 'application/problem+json',
        'retry-after': '30',
        'set-cookie': REDACTED,
        'x-request-id': 'preview-request-503',
      },
      responseContentType: 'application/problem+json',
      responseBodyCapture: { state: 'captured', capturedBytes: 186, originalBytes: 186 },
      responseBody: {
        code: 'APPROVAL_SERVICE_UNAVAILABLE',
        message: 'The synthetic approval service is temporarily unavailable.',
        retryAfterSeconds: 30,
        traceId: 'trace-preview-503',
      },
    }),
    failedRequest({
      id: 'request-notifications-timeout',
      timestamp: '2026-09-24T14:06:10.000Z',
      startedAt: '2026-09-24T14:06:00.000Z',
      completedAt: '2026-09-24T14:06:10.000Z',
      documentUrl: `${APP_ORIGIN}/access-request`,
      transport: 'xhr',
      method: 'GET',
      url: `${API_ORIGIN}/v1/notifications?unread=true`,
      status: undefined,
      statusText: undefined,
      durationMs: 10_000,
      outcome: 'timeout',
      timeoutMs: 10_000,
      withCredentials: true,
      responseUrl: undefined,
      responseType: 'json',
      requestMode: undefined,
      credentialsMode: undefined,
      cacheMode: undefined,
      redirectMode: undefined,
      requestContentType: undefined,
      responseContentType: undefined,
      responseHeaders: {},
      responseBodyCapture: { state: 'unavailable' },
      responseBody: undefined,
    }),
    failedRequest({
      id: 'request-profile-validation',
      timestamp: '2026-09-24T14:08:19.144Z',
      startedAt: '2026-09-24T14:08:18.989Z',
      completedAt: '2026-09-24T14:08:19.144Z',
      documentUrl: `${APP_ORIGIN}/profile`,
      responseUrl: `${API_ORIGIN}/v1/users/USR-DEMO-104`,
      transport: 'fetch',
      method: 'PATCH',
      url: `${API_ORIGIN}/v1/users/USR-DEMO-104`,
      status: 422,
      statusText: 'Unprocessable Content',
      durationMs: 155,
      requestBodyCapture: { state: 'captured', capturedBytes: 106, originalBytes: 106 },
      requestBody: {
        displayName: 'Alex Morgan',
        preferredTimezone: 'America/Chicago',
        recoveryCode: REDACTED,
      },
      responseHeaders: {
        'content-type': 'application/problem+json',
        'x-request-id': 'preview-request-422',
      },
      responseContentType: 'application/problem+json',
      responseBodyCapture: { state: 'captured', capturedBytes: 174, originalBytes: 174 },
      responseBody: {
        code: 'VALIDATION_FAILED',
        errors: [
          { field: 'preferredTimezone', message: 'Timezone is not enabled for this tenant.' },
        ],
        traceId: 'trace-preview-422',
      },
    }),
    failedRequest({
      id: 'request-health-network-error',
      timestamp: '2026-09-24T14:09:30.383Z',
      startedAt: '2026-09-24T14:09:30.342Z',
      completedAt: '2026-09-24T14:09:30.383Z',
      documentUrl: `${APP_ORIGIN}/profile`,
      transport: 'fetch',
      method: 'GET',
      url: `${API_ORIGIN}/v1/health`,
      status: undefined,
      statusText: undefined,
      durationMs: 41,
      outcome: 'network-error',
      responseUrl: undefined,
      responseContentType: undefined,
      responseHeaders: {},
      responseBodyCapture: { state: 'unavailable' },
      responseBody: undefined,
    }),
    failedRequest({
      id: 'request-draft-aborted',
      timestamp: '2026-09-24T14:10:04.716Z',
      startedAt: '2026-09-24T14:10:04.604Z',
      completedAt: '2026-09-24T14:10:04.716Z',
      documentUrl: `${APP_ORIGIN}/access-request`,
      transport: 'xhr',
      method: 'DELETE',
      url: `${API_ORIGIN}/v1/access-requests/draft/AR-DRAFT-DEMO`,
      status: undefined,
      statusText: undefined,
      durationMs: 112,
      outcome: 'abort',
      timeoutMs: 10_000,
      withCredentials: true,
      responseUrl: undefined,
      responseType: 'json',
      requestMode: undefined,
      credentialsMode: undefined,
      cacheMode: undefined,
      redirectMode: undefined,
      requestContentType: undefined,
      responseContentType: undefined,
      responseHeaders: {},
      responseBodyCapture: { state: 'unavailable' },
      responseBody: undefined,
    }),
    successfulRequest({
      id: 'request-role-catalog',
      timestamp: '2026-09-24T14:12:48.903Z',
      startedAt: '2026-09-24T14:12:48.515Z',
      completedAt: '2026-09-24T14:12:48.903Z',
      documentUrl: `${APP_ORIGIN}/access-request`,
      responseUrl: `${API_ORIGIN}/v1/roles?active=true`,
      transport: 'fetch',
      method: 'GET',
      url: `${API_ORIGIN}/v1/roles?active=true`,
      status: 200,
      statusText: 'OK',
      durationMs: 388,
      requestContentType: undefined,
      responseBodyCapture: {
        state: 'truncated',
        capturedBytes: 65_536,
        originalBytes: 81_904,
      },
      responseBody: {
        items: [
          { id: 'ROLE-AUDITOR', name: 'Audit reviewer' },
          { id: 'ROLE-SUPPORT', name: 'Support analyst' },
          '[Additional sanitized roles truncated]',
        ],
        nextPageToken: REDACTED,
      },
    }),
  ];
}

export function createReportPreviewFixture() {
  const networkRequests = buildNetworkRequests();
  const networkErrors = networkRequests
    .filter((request) => request.outcome !== 'success')
    .map(toNetworkError);

  const evidence = {
    metadata: {
      sessionId: 'session-preview-20260924-140000',
      applicationName: 'Operations Portal',
      environment: 'QA — synthetic preview',
      releaseVersion: '2026.09.24-rc.3',
      testerName: 'Taylor Tester',
      testerEmployeeId: 'E-DEMO-104',
      testCaseId: 'TC-ACCESS-1042',
      testCaseName: 'Submit and verify a privileged access request',
      requirementId: 'REQ-IAM-218',
      startedAt: '2026-09-24T14:00:00.000Z',
      endedAt: '2026-09-24T14:14:38.420Z',
      durationMs: 878_420,
      currentUrl: `${APP_ORIGIN}/access-request`,
      pageTitle: 'Access request — Operations Portal',
      browser: { name: 'Microsoft Edge', version: '140.0.3485.81' },
      operatingSystem: { name: 'Windows', version: '11 Enterprise' },
      viewport: { width: 1440, height: 900 },
      screen: { width: 2560, height: 1440 },
      libraryVersion: '0.1.0-preview',
      result: 'failed',
      custom: {
        buildNumber: '20260924.3',
        commit: '7f3c9b1-preview',
        suite: 'IAM regression',
        featureFlag: 'new-access-workflow',
        region: 'us-central-synthetic',
      },
    },
    screenshots: [
      {
        id: 'screenshot-dashboard',
        timestamp: '2026-09-24T14:00:14.810Z',
        label: 'Dashboard loaded after successful sign in',
        url: `${APP_ORIGIN}/dashboard`,
        actionSequence: 4,
        blob: createPreviewPng('dashboard'),
        fileName: '001-dashboard-loaded.png',
      },
      {
        id: 'screenshot-access-failure',
        timestamp: '2026-09-24T14:05:08.110Z',
        label: 'Approval service unavailable after request submission',
        url: `${APP_ORIGIN}/access-request`,
        actionSequence: 8,
        blob: createPreviewPng('failure'),
        fileName: '002-approval-service-unavailable.png',
      },
      {
        id: 'screenshot-profile-validation',
        timestamp: '2026-09-24T14:08:19.330Z',
        label: 'Profile timezone validation message',
        url: `${APP_ORIGIN}/profile`,
        actionSequence: 11,
        blob: createPreviewPng('profile'),
        fileName: '003-profile-validation.png',
      },
    ],
    actions: [
      {
        sequence: 1,
        timestamp: '2026-09-24T14:00:01.140Z',
        type: 'navigation',
        url: `${APP_ORIGIN}/login`,
      },
      {
        sequence: 2,
        timestamp: '2026-09-24T14:00:05.220Z',
        type: 'input-change',
        elementTag: 'input',
        elementIdentifier: '[data-testid="email"]',
        elementText: 'Email address',
        value: 'changed',
        url: `${APP_ORIGIN}/login`,
      },
      {
        sequence: 3,
        timestamp: '2026-09-24T14:00:12.190Z',
        type: 'form-submit',
        elementTag: 'form',
        elementIdentifier: '[data-testid="login-form"]',
        elementText: 'Sign in',
        url: `${APP_ORIGIN}/login`,
      },
      {
        sequence: 4,
        timestamp: '2026-09-24T14:00:12.610Z',
        type: 'history-push',
        url: `${APP_ORIGIN}/dashboard`,
      },
      {
        sequence: 5,
        timestamp: '2026-09-24T14:01:40.880Z',
        type: 'click',
        elementTag: 'button',
        elementIdentifier: '[data-testid="range-30-days"]',
        elementText: 'Last 30 days',
        url: `${APP_ORIGIN}/dashboard`,
      },
      {
        sequence: 6,
        timestamp: '2026-09-24T14:03:01.040Z',
        type: 'history-push',
        url: `${APP_ORIGIN}/access-request`,
      },
      {
        sequence: 7,
        timestamp: '2026-09-24T14:03:45.620Z',
        type: 'input-change',
        elementTag: 'select',
        elementIdentifier: '[data-testid="requested-role"]',
        elementText: 'Requested role',
        value: 'Audit reviewer',
        url: `${APP_ORIGIN}/access-request`,
      },
      {
        sequence: 8,
        timestamp: '2026-09-24T14:04:25.080Z',
        type: 'form-submit',
        elementTag: 'form',
        elementIdentifier: '[data-testid="access-request-form"]',
        elementText: 'Submit access request',
        url: `${APP_ORIGIN}/access-request`,
      },
      {
        sequence: 9,
        timestamp: '2026-09-24T14:05:42.670Z',
        type: 'click',
        elementTag: 'button',
        elementIdentifier: '[data-testid="retry-status"]',
        elementText: 'Retry status check',
        url: `${APP_ORIGIN}/access-request`,
      },
      {
        sequence: 10,
        timestamp: '2026-09-24T14:07:35.020Z',
        type: 'history-push',
        url: `${APP_ORIGIN}/profile`,
      },
      {
        sequence: 11,
        timestamp: '2026-09-24T14:08:18.940Z',
        type: 'form-submit',
        elementTag: 'form',
        elementIdentifier: '[data-testid="profile-form"]',
        elementText: 'Save profile',
        url: `${APP_ORIGIN}/profile`,
      },
      {
        sequence: 12,
        timestamp: '2026-09-24T14:14:12.125Z',
        type: 'click',
        elementTag: 'button',
        elementIdentifier: '[data-testid="sign-out"]',
        elementText: 'Sign out',
        url: `${APP_ORIGIN}/profile`,
      },
    ],
    consoleLogs: [
      {
        id: 'console-warning-retry',
        timestamp: '2026-09-24T14:05:07.910Z',
        level: 'warn',
        message: 'Approval status check will be retried after a recoverable service response.',
        arguments: [
          'Approval status retry scheduled',
          { attempt: 1, retryAfterSeconds: 30, requestId: 'preview-request-503' },
        ],
        url: `${APP_ORIGIN}/access-request`,
      },
      {
        id: 'console-error-profile',
        timestamp: '2026-09-24T14:08:19.170Z',
        level: 'error',
        message: 'Profile update was rejected by server-side validation.',
        arguments: [
          'Profile update failed',
          { status: 422, traceId: 'trace-preview-422', authorization: REDACTED },
        ],
        url: `${APP_ORIGIN}/profile`,
      },
      {
        id: 'console-error-health',
        timestamp: '2026-09-24T14:09:30.390Z',
        level: 'error',
        message: 'Health endpoint could not be reached.',
        arguments: ['NetworkError', { endpoint: '/v1/health', retryable: true }],
        url: `${APP_ORIGIN}/profile`,
      },
    ],
    networkRequests,
    networkErrors,
    notes: [
      {
        id: 'note-preconditions',
        timestamp: '2026-09-24T14:00:02.040Z',
        text: 'Confirmed the synthetic QA account has no privileged role before starting.',
        url: `${APP_ORIGIN}/login`,
        actionSequence: 1,
      },
      {
        id: 'note-dashboard',
        timestamp: '2026-09-24T14:00:15.020Z',
        text: 'Happy path sign-in completed and the dashboard summary loaded normally.',
        url: `${APP_ORIGIN}/dashboard`,
        actionSequence: 4,
      },
      {
        id: 'note-defect',
        timestamp: '2026-09-24T14:05:12.250Z',
        text: 'Access request was created, but its approval status endpoint returned 503. Captured the visible failure and request trace.',
        url: `${APP_ORIGIN}/access-request`,
        actionSequence: 8,
      },
      {
        id: 'note-result',
        timestamp: '2026-09-24T14:14:30.300Z',
        text: 'Marked failed because status verification and profile update did not complete successfully.',
        url: `${APP_ORIGIN}/profile`,
        actionSequence: 12,
      },
    ],
    video: {
      id: 'video-preview',
      startedAt: '2026-09-24T14:00:00.820Z',
      endedAt: '2026-09-24T14:13:31.100Z',
      durationMs: 810_280,
      mimeType: 'video/webm;codecs=vp8',
      blob: new Blob(
        ['Synthetic preview placeholder. Real evidence uses MediaRecorder-generated WebM bytes.'],
        { type: 'video/webm' },
      ),
      fileName: 'recording.webm',
      stopReason: 'user-ended-sharing',
    },
  };

  const summary = {
    sessionId: evidence.metadata.sessionId,
    status: 'stopped',
    result: 'failed',
    startedAt: evidence.metadata.startedAt,
    endedAt: evidence.metadata.endedAt,
    durationMs: evidence.metadata.durationMs,
    evidence: {
      screenshots: evidence.screenshots.length,
      actions: evidence.actions.length,
      consoleLogs: evidence.consoleLogs.length,
      networkRequests: networkRequests.length,
      successfulRequests: networkRequests.filter((request) => request.outcome === 'success').length,
      networkErrors: networkErrors.length,
      notes: evidence.notes.length,
      hasVideo: true,
    },
    approximateSizeBytes: 8_764_211,
    memoryWarningReached: false,
    videoStatus: 'captured',
    videoRecording: false,
    warnings: [
      {
        code: 'VIDEO_ENDED',
        message: 'The tester ended tab sharing before the evidence session was stopped.',
        timestamp: '2026-09-24T14:13:31.100Z',
      },
    ],
  };

  return { evidence, summary };
}
