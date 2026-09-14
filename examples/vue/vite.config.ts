import vue from '@vitejs/plugin-vue';
import { defineConfig, type Connect, type Plugin } from 'vite';

interface DemoEndpoint {
  successStatus: number;
  failureStatus: number;
  successMessage: string;
  failureMessage: string;
  successPayload?: Record<string, number>;
}

const endpoints: Record<string, DemoEndpoint> = {
  '/api/vue/login': {
    successStatus: 200,
    failureStatus: 401,
    successMessage: 'Synthetic sign-in accepted.',
    failureMessage: 'The synthetic credentials were rejected.',
  },
  '/api/vue/overview': {
    successStatus: 200,
    failureStatus: 500,
    successMessage: 'Synthetic dashboard loaded.',
    failureMessage: 'The dashboard service is unavailable.',
    successPayload: { openRequests: 4, approvedToday: 12 },
  },
  '/api/vue/access-requests': {
    successStatus: 201,
    failureStatus: 503,
    successMessage: 'Synthetic access request created.',
    failureMessage: 'The access-request service is temporarily unavailable.',
  },
};

/** Supplies deterministic page-level requests without adding a backend to the SDK. */
function demoApi(): Plugin {
  const middleware: Connect.NextHandleFunction = (request, response, next) => {
    const requestUrl = new URL(request.url ?? '/', 'http://test-witness.local');
    const endpoint = endpoints[requestUrl.pathname];
    if (!endpoint) {
      next();
      return;
    }

    request.resume();
    const shouldFail = requestUrl.searchParams.get('fail') === 'true';
    const status = shouldFail ? endpoint.failureStatus : endpoint.successStatus;
    response.statusCode = status;
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(
      JSON.stringify({
        message: shouldFail ? endpoint.failureMessage : endpoint.successMessage,
        demo: true,
        ...(shouldFail ? {} : endpoint.successPayload),
      }),
    );
  };

  return {
    name: 'testwitness-vue-demo-api',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  plugins: [vue(), demoApi()],
  optimizeDeps: {
    exclude: ['@testwitness/core'],
  },
  server: {
    host: '127.0.0.1',
    port: 4174,
  },
  preview: {
    host: '127.0.0.1',
    port: 4174,
  },
});
