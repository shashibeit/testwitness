import { useState, type FormEvent } from 'react';
import { createAccount } from '../demoApi';
import type { DemoUser } from '../types';
import { useRequestGuard } from '../useRequestGuard';
import { AppLink } from '../components/AppLink';
import { AuthLayout } from '../components/AuthLayout';

interface SignupPageProps {
  onAccountCreated: (user: DemoUser) => void;
}

export function SignupPage({ onAccountCreated }: SignupPageProps) {
  const requestGuard = useRequestGuard();
  const [name, setName] = useState('Jordan Lee');
  const [email, setEmail] = useState('jordan.lee@example.test');
  const [department, setDepartment] = useState('Quality Engineering');
  const [password, setPassword] = useState('DemoOnly!123');
  const [confirmation, setConfirmation] = useState('DemoOnly!123');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [createdUser, setCreatedUser] = useState<DemoUser>();

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(undefined);
    if (password !== confirmation) {
      setError('The two password values must match.');
      return;
    }

    setBusy(true);
    const requestId = requestGuard.begin();
    try {
      const result = await createAccount({ name, email, department, password });
      if (!requestGuard.isCurrent(requestId)) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setCreatedUser(result.data);
    } catch (caught) {
      if (!requestGuard.isCurrent(requestId)) return;
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      if (requestGuard.isCurrent(requestId)) setBusy(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="New workspace account"
      title="Create your profile"
      introduction="This local signup flow gives the recorder another realistic form and route transition."
    >
      {createdUser ? (
        <div className="completion-state" role="status">
          <span className="completion-icon" aria-hidden="true">
            ✓
          </span>
          <h2>Account created</h2>
          <p>
            The demo profile for <strong>{createdUser.name}</strong> is ready. Capture this state
            from the floating toolbar before continuing.
          </p>
          <button
            className="primary-button full-width"
            data-testid="continue-to-dashboard"
            type="button"
            onClick={() => onAccountCreated(createdUser)}
          >
            Continue to dashboard
          </button>
        </div>
      ) : (
        <>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}

          <form
            className="form-stack"
            data-testid="signup-form"
            onSubmit={(event) => void submit(event)}
          >
            <div className="two-column-fields">
              <label htmlFor="signup-name">
                Full name
                <input
                  id="signup-name"
                  data-testid="signup-name"
                  name="displayName"
                  value={name}
                  autoComplete="name"
                  required
                  onChange={(event) => setName(event.currentTarget.value)}
                />
              </label>
              <label htmlFor="signup-department">
                Department
                <select
                  id="signup-department"
                  data-testid="signup-department"
                  name="department"
                  value={department}
                  onChange={(event) => setDepartment(event.currentTarget.value)}
                >
                  <option>Quality Engineering</option>
                  <option>Operations</option>
                  <option>Risk and Compliance</option>
                </select>
              </label>
            </div>

            <label htmlFor="signup-email">
              Work email
              <input
                id="signup-email"
                data-testid="signup-email"
                name="email"
                type="email"
                value={email}
                autoComplete="email"
                required
                onChange={(event) => setEmail(event.currentTarget.value)}
              />
            </label>

            <div className="two-column-fields">
              <label htmlFor="signup-password">
                Password
                <input
                  id="signup-password"
                  data-testid="signup-password"
                  name="password"
                  type="password"
                  value={password}
                  autoComplete="new-password"
                  required
                  onChange={(event) => setPassword(event.currentTarget.value)}
                />
              </label>
              <label htmlFor="signup-confirmation">
                Confirm password
                <input
                  id="signup-confirmation"
                  data-testid="signup-confirmation"
                  name="confirmPassword"
                  type="password"
                  value={confirmation}
                  autoComplete="new-password"
                  required
                  onChange={(event) => setConfirmation(event.currentTarget.value)}
                />
              </label>
            </div>

            <label className="checkbox-row">
              <input
                data-testid="signup-terms"
                name="termsAccepted"
                type="checkbox"
                checked={termsAccepted}
                required
                onChange={(event) => setTermsAccepted(event.currentTarget.checked)}
              />
              I accept the demo workspace policy.
            </label>

            <button
              className="primary-button full-width"
              data-testid="create-account"
              type="submit"
              disabled={busy}
            >
              {busy ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        </>
      )}

      {!createdUser && (
        <p className="auth-switch">
          Already have an account? <AppLink to="/login">Sign in</AppLink>
        </p>
      )}
    </AuthLayout>
  );
}
