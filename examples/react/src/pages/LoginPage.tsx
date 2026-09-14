import { useState, type FormEvent } from 'react';
import { signIn } from '../demoApi';
import type { DemoUser } from '../types';
import { useRequestGuard } from '../useRequestGuard';
import { AppLink } from '../components/AppLink';
import { AuthLayout } from '../components/AuthLayout';

interface LoginPageProps {
  onSignedIn: (user: DemoUser) => void;
}

export function LoginPage({ onSignedIn }: LoginPageProps) {
  const requestGuard = useRequestGuard();
  const [email, setEmail] = useState('qa.tester@example.test');
  const [password, setPassword] = useState('DemoOnly!123');
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    const requestId = requestGuard.begin();
    try {
      const result = await signIn({ email, password, simulateFailure });
      if (!requestGuard.isCurrent(requestId)) return;
      if (!result.ok) {
        setError(result.message);
        console.error('Portal sign-in failed', {
          status: result.status,
          authorization: 'Bearer synthetic-console-token',
          password: 'synthetic-console-password',
        });
        return;
      }
      onSignedIn(result.data);
    } catch (caught) {
      if (!requestGuard.isCurrent(requestId)) return;
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      console.error('Portal sign-in request failed', { message });
    } finally {
      if (requestGuard.isCurrent(requestId)) setBusy(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="Welcome back"
      title="Sign in to your workspace"
      introduction="Use the synthetic account below to continue to the operations dashboard."
    >
      <div className="demo-credentials" data-evidence-exclude>
        <strong>Demo credentials</strong>
        <span>qa.tester@example.test / DemoOnly!123</span>
      </div>

      {error && (
        <div className="alert error" role="alert">
          <strong>Sign-in unsuccessful</strong>
          <span>{error}</span>
        </div>
      )}

      <form
        className="form-stack"
        data-testid="login-form"
        onSubmit={(event) => void submit(event)}
      >
        <label htmlFor="login-email">
          Work email
          <input
            id="login-email"
            data-testid="login-email"
            name="email"
            type="email"
            value={email}
            autoComplete="username"
            required
            onChange={(event) => setEmail(event.currentTarget.value)}
          />
        </label>

        <label htmlFor="login-password">
          Password
          <input
            id="login-password"
            data-testid="login-password"
            name="password"
            type="password"
            value={password}
            autoComplete="current-password"
            required
            onChange={(event) => setPassword(event.currentTarget.value)}
          />
          <span className="field-hint">Password values are never recorded by TestWitness.</span>
        </label>

        <label className="checkbox-row" data-evidence-exclude>
          <input
            data-testid="simulate-login-failure"
            type="checkbox"
            checked={simulateFailure}
            onChange={(event) => setSimulateFailure(event.currentTarget.checked)}
          />
          Simulate an invalid login (HTTP 401)
        </label>

        <button
          className="primary-button full-width"
          data-testid="sign-in"
          type="submit"
          disabled={busy}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="auth-switch">
        Need a demo account? <AppLink to="/signup">Create one</AppLink>
      </p>
    </AuthLayout>
  );
}
