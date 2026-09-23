/**
 * Deterministic browser calls used by the framework-free demo.
 *
 * The Vite development server supplies these local endpoints. Request and response bodies stay
 * disabled in TestWitness; the synthetic secrets deliberately exercise header and query-string
 * redaction in the exported evidence.
 */

async function responseMessage(response) {
  try {
    const body = await response.json();
    return typeof body.message === 'string' ? body.message : `Request failed (${response.status}).`;
  } catch {
    return `Request failed (${response.status}).`;
  }
}

export async function signIn(input) {
  const query = input.simulateFailure ? '?fail=true&access_token=synthetic-login-query-token' : '';
  const response = await fetch(`/api/demo/login${query}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer synthetic-login-header-token',
      'X-API-Key': 'synthetic-demo-api-key',
    },
    body: JSON.stringify({ email: input.email, password: input.password }),
  });

  if (!response.ok) {
    return { ok: false, status: response.status, message: await responseMessage(response) };
  }

  return {
    ok: true,
    status: response.status,
    data: {
      name: 'Alex Morgan',
      email: input.email,
      role: 'QA Analyst',
      employeeId: 'EMP-002845',
    },
  };
}

export async function createAccount(input) {
  const response = await fetch('/api/demo/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    return { ok: false, status: response.status, message: await responseMessage(response) };
  }

  return {
    ok: true,
    status: response.status,
    data: {
      name: input.name,
      email: input.email,
      role: `${input.department} contributor`,
      employeeId: 'EMP-NEW-1042',
    },
  };
}

export async function createAccessRequest(input, simulateFailure) {
  const query = simulateFailure ? '?fail=true&access_token=synthetic-access-query-token' : '';
  const response = await fetch(`/api/demo/access-requests${query}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer synthetic-access-header-token',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    return { ok: false, status: response.status, message: await responseMessage(response) };
  }

  return { ok: true, status: response.status, data: { requestId: 'AR-2026-1042' } };
}

export function updateProfile(input, simulateFailure) {
  return new Promise((resolve) => {
    const query = simulateFailure ? '?fail=true&access_token=synthetic-profile-query-token' : '';
    const request = new XMLHttpRequest();
    request.open('PUT', `/api/demo/profile${query}`);
    request.setRequestHeader('Content-Type', 'application/json');
    request.setRequestHeader('Authorization', 'Bearer synthetic-profile-header-token');
    request.setRequestHeader('X-CSRF-Token', 'synthetic-profile-csrf-token');
    request.timeout = 5_000;

    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) {
        resolve({ ok: true, status: request.status, data: undefined });
        return;
      }
      resolve({
        ok: false,
        status: request.status,
        message: `Profile service rejected the update (${request.status}).`,
      });
    });
    request.addEventListener('error', () => {
      resolve({ ok: false, status: 0, message: 'Profile service could not be reached.' });
    });
    request.addEventListener('timeout', () => {
      resolve({ ok: false, status: 0, message: 'Profile service timed out.' });
    });
    request.send(JSON.stringify(input));
  });
}
