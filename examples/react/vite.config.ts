import react from '@vitejs/plugin-react';
import { defineConfig, type Connect, type Plugin } from 'vite';

interface DemoEndpoint {
  successStatus: number;
  failureStatus: number;
  successMessage: string;
  failureMessage: string;
}

const DEMO_ENDPOINTS: Record<string, DemoEndpoint> = {
  '/api/demo/login': {
    successStatus: 200,
    failureStatus: 401,
    successMessage: 'Synthetic sign-in accepted.',
    failureMessage: 'The synthetic email or password was not accepted.',
  },
  '/api/demo/signup': {
    successStatus: 201,
    failureStatus: 409,
    successMessage: 'Synthetic account created.',
    failureMessage: 'The synthetic account already exists.',
  },
  '/api/demo/access-requests': {
    successStatus: 201,
    failureStatus: 503,
    successMessage: 'Synthetic access request created.',
    failureMessage: 'The access-request service is temporarily unavailable.',
  },
  '/api/demo/profile': {
    successStatus: 204,
    failureStatus: 500,
    successMessage: 'Synthetic profile updated.',
    failureMessage: 'The profile service could not save the update.',
  },
};

/** Supplies deterministic local API responses without adding a backend to the SDK. */
function demoApi(): Plugin {
  const middleware: Connect.NextHandleFunction = (request, response, next) => {
    const requestUrl = new URL(request.url ?? '/', 'http://test-witness.local');
    const endpoint = DEMO_ENDPOINTS[requestUrl.pathname];
    if (!endpoint) {
      next();
      return;
    }

    request.resume();
    const shouldFail = requestUrl.searchParams.get('fail') === 'true';
    const status = shouldFail ? endpoint.failureStatus : endpoint.successStatus;
    response.statusCode = status;
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Demo-Endpoint', 'true');

    if (status === 204) {
      response.end();
      return;
    }

    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(
      JSON.stringify({
        message: shouldFail ? endpoint.failureMessage : endpoint.successMessage,
        demo: true,
      }),
    );
  };

  return {
    name: 'testwitness-portal-demo-api',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  plugins: [react(), demoApi()],
  optimizeDeps: {
    exclude: ['@testwitness/core'],
  },
  server: {
    host: '127.0.0.1',
    port: 4173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
});
