import { useState, type FormEvent } from 'react';
import { updateProfile } from '../demoApi';
import type { DemoUser } from '../types';
import { useRequestGuard } from '../useRequestGuard';

interface ProfilePageProps {
  user: DemoUser;
  onProfileUpdated: (updates: Pick<DemoUser, 'name'>) => void;
}

export function ProfilePage({ user, onProfileUpdated }: ProfilePageProps) {
  const requestGuard = useRequestGuard();
  const [displayName, setDisplayName] = useState(user.name);
  const [phone, setPhone] = useState('312-555-0142');
  const [timeZone, setTimeZone] = useState('America/Chicago');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string }>();

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setMessage(undefined);
    const requestId = requestGuard.begin();
    try {
      const result = await updateProfile(
        { displayName, phone, timeZone, notificationsEnabled },
        simulateFailure,
      );
      if (!requestGuard.isCurrent(requestId)) return;
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.message });
        console.warn('Profile update was rejected', {
          status: result.status,
          'x-csrf-token': 'synthetic-profile-console-token',
        });
        return;
      }
      onProfileUpdated({ name: displayName });
      setMessage({ tone: 'success', text: 'Your profile settings were saved.' });
    } catch (caught) {
      if (!requestGuard.isCurrent(requestId)) return;
      setMessage({
        tone: 'error',
        text: caught instanceof Error ? caught.message : String(caught),
      });
    } finally {
      if (requestGuard.isCurrent(requestId)) setBusy(false);
    }
  }

  return (
    <div className="form-page-grid profile-grid">
      <section className="content-card profile-summary" data-private>
        <span className="large-avatar" aria-hidden="true">
          {user.name
            .split(' ')
            .map((part) => part[0])
            .join('')
            .slice(0, 2)}
        </span>
        <h2>{user.name}</h2>
        <p>{user.role}</p>
        <dl>
          <div>
            <dt>Employee ID</dt>
            <dd>{user.employeeId}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{user.email}</dd>
          </div>
        </dl>
        <small>This card is marked private and is masked in screenshots.</small>
      </section>

      <section className="content-card form-card" aria-labelledby="profile-form-heading">
        <div className="content-card-heading">
          <div>
            <p className="section-kicker">Personal preferences</p>
            <h2 id="profile-form-heading">Contact and notification settings</h2>
          </div>
        </div>

        {message && (
          <div
            className={`alert ${message.tone}`}
            role={message.tone === 'error' ? 'alert' : 'status'}
          >
            {message.text}
          </div>
        )}

        <form
          className="form-stack"
          data-testid="profile-form"
          onSubmit={(event) => void submit(event)}
        >
          <div className="two-column-fields">
            <label htmlFor="profile-display-name">
              Display name
              <input
                id="profile-display-name"
                data-testid="profile-display-name"
                name="displayName"
                value={displayName}
                autoComplete="name"
                required
                onChange={(event) => setDisplayName(event.currentTarget.value)}
              />
            </label>
            <label htmlFor="profile-phone">
              Phone number
              <input
                id="profile-phone"
                data-testid="profile-phone"
                name="phone"
                type="tel"
                value={phone}
                autoComplete="tel"
                onChange={(event) => setPhone(event.currentTarget.value)}
              />
            </label>
          </div>

          <label htmlFor="profile-time-zone">
            Time zone
            <select
              id="profile-time-zone"
              data-testid="profile-time-zone"
              name="timeZone"
              value={timeZone}
              onChange={(event) => setTimeZone(event.currentTarget.value)}
            >
              <option value="America/Chicago">Central Time (Chicago)</option>
              <option value="America/New_York">Eastern Time (New York)</option>
              <option value="America/Los_Angeles">Pacific Time (Los Angeles)</option>
            </select>
          </label>

          <label className="checkbox-row">
            <input
              data-testid="profile-notifications"
              name="notificationsEnabled"
              type="checkbox"
              checked={notificationsEnabled}
              onChange={(event) => setNotificationsEnabled(event.currentTarget.checked)}
            />
            Send email notifications for request updates.
          </label>

          <label className="checkbox-row qa-option" data-evidence-exclude>
            <input
              data-testid="simulate-profile-failure"
              type="checkbox"
              checked={simulateFailure}
              onChange={(event) => setSimulateFailure(event.currentTarget.checked)}
            />
            QA option: return a synthetic XHR HTTP 500 response
          </label>

          <div className="form-actions">
            <button
              className="primary-button"
              data-testid="save-profile"
              type="submit"
              disabled={busy}
            >
              {busy ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
