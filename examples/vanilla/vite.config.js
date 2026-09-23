import { defineConfig } from 'vite';

const DEMO_ENDPOINTS = {
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

function demoApiMiddleware(request, response, next) {
  const requestUrl = new URL(request.url || '/', 'http://test-witness.local');
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
}

function demoApi() {
  return {
    name: 'testwitness-vanilla-portal-demo-api',
    configureServer(server) {
      server.middlewares.use(demoApiMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(demoApiMiddleware);
    },
  };
}

export default defineConfig({
  plugins: [demoApi()],
  server: {
    host: '127.0.0.1',
    port: 4174,
  },
  preview: {
    host: '127.0.0.1',
    port: 4174,
  },
  build: {
    target: 'es2020',
    sourcemap: true,
  },
});
