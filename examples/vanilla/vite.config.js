import { defineConfig } from 'vite';

function writeJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.end(JSON.stringify(payload));
}

function demoApiMiddleware(request, response, next) {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (!url.pathname.startsWith('/api/demo/')) {
    next();
    return;
  }

  const shouldFail = url.searchParams.get('fail') === '1';
  setTimeout(() => {
    if (url.pathname === '/api/demo/login') {
      writeJson(
        response,
        shouldFail ? 401 : 200,
        shouldFail
          ? { message: 'The synthetic credentials were rejected as requested.' }
          : { memberId: 'DEMO-MEMBER-1004' },
      );
      return;
    }

    if (url.pathname === '/api/demo/access-requests') {
      writeJson(
        response,
        shouldFail ? 503 : 201,
        shouldFail
          ? { message: 'The synthetic approval service is temporarily unavailable.' }
          : { requestId: 'AR-1042' },
      );
      return;
    }

    if (url.pathname === '/api/demo/health') {
      writeJson(response, shouldFail ? 503 : 200, {
        message: shouldFail ? 'The synthetic dependency is unavailable.' : 'healthy',
      });
      return;
    }

    writeJson(response, 404, { message: 'Unknown demo endpoint.' });
  }, 250);
}

function demoApi() {
  return {
    name: 'testwitness-vanilla-demo-api',
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
  build: {
    target: 'es2020',
    sourcemap: true,
  },
});
