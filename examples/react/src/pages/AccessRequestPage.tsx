import { useState, type FormEvent } from 'react';
import { createAccessRequest } from '../demoApi';
import { useRequestGuard } from '../useRequestGuard';

function defaultExpiryDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
}

export function AccessRequestPage() {
  const requestGuard = useRequestGuard();
  const [application, setApplication] = useState('Payments Console');
  const [accessLevel, setAccessLevel] = useState('Read only');
  const [expiresOn, setExpiresOn] = useState(defaultExpiryDate);
  const [justification, setJustification] = useState(
    'Validate the release candidate and confirm the regression suite.',
  );
  const [customerReference, setCustomerReference] = useState('CUSTOMER-002845');
  const [policyConfirmed, setPolicyConfirmed] = useState(false);
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string }>();

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setMessage(undefined);
    const requestId = requestGuard.begin();
    try {
      const result = await createAccessRequest(
        { application, accessLevel, expiresOn, justification, customerReference },
        simulateFailure,
      );
      if (!requestGuard.isCurrent(requestId)) return;
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.message });
        console.error('Access request submission failed', {
          status: result.status,
          authorization: 'Bearer synthetic-access-console-token',
          access_token: 'synthetic-access-token',
        });
        return;
      }
      setMessage({
        tone: 'success',
        text: `Request ${result.data.requestId} was submitted for review.`,
      });
    } catch (caught) {
      if (!requestGuard.isCurrent(requestId)) return;
      const text = caught instanceof Error ? caught.message : String(caught);
      setMessage({ tone: 'error', text });
      console.error('Access request could not be submitted', { message: text });
    } finally {
      if (requestGuard.isCurrent(requestId)) setBusy(false);
    }
  }

  return (
    <div className="form-page-grid">
      <section className="content-card form-card" aria-labelledby="access-form-heading">
        <div className="content-card-heading">
          <div>
            <p className="section-kicker">Role provisioning</p>
            <h2 id="access-form-heading">Application access details</h2>
          </div>
          <span className="status-chip pending">Draft</span>
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
          data-testid="access-request-form"
          onSubmit={(event) => void submit(event)}
        >
          <div className="two-column-fields">
            <label htmlFor="request-application">
              Application
              <select
                id="request-application"
                data-testid="request-application"
                name="application"
                value={application}
                onChange={(event) => setApplication(event.currentTarget.value)}
              >
                <option>Payments Console</option>
                <option>Customer Service Hub</option>
                <option>Risk Review Workbench</option>
              </select>
            </label>
            <label htmlFor="request-access-level">
              Access level
              <select
                id="request-access-level"
                data-testid="request-access-level"
                name="accessLevel"
                value={accessLevel}
                onChange={(event) => setAccessLevel(event.currentTarget.value)}
              >
                <option>Read only</option>
                <option>Approver</option>
                <option>Administrator</option>
              </select>
            </label>
          </div>

          <div className="two-column-fields">
            <label htmlFor="request-expiry">
              Access expires
              <input
                id="request-expiry"
                data-testid="request-expiry"
                name="expiresOn"
                type="date"
                value={expiresOn}
                onChange={(event) => setExpiresOn(event.currentTarget.value)}
              />
            </label>
            <label data-private htmlFor="customer-reference">
              Customer reference
              <input
                id="customer-reference"
                data-testid="customer-reference"
                name="customerReference"
                value={customerReference}
                onChange={(event) => setCustomerReference(event.currentTarget.value)}
              />
            </label>
          </div>

          <label htmlFor="request-justification">
            Business justification
            <textarea
              id="request-justification"
              data-testid="request-justification"
              name="justification"
              rows={5}
              value={justification}
              onChange={(event) => setJustification(event.currentTarget.value)}
            />
            <span className="field-hint">
              TestWitness records that this field changed, but not the free-text value.
            </span>
          </label>

          <label className="checkbox-row">
            <input
              data-testid="request-policy-confirmed"
              name="policyConfirmed"
              type="checkbox"
              checked={policyConfirmed}
              required
              onChange={(event) => setPolicyConfirmed(event.currentTarget.checked)}
            />
            I confirm this request follows the least-privilege policy.
          </label>

          <label className="checkbox-row qa-option" data-evidence-exclude>
            <input
              data-testid="simulate-access-failure"
              type="checkbox"
              checked={simulateFailure}
              onChange={(event) => setSimulateFailure(event.currentTarget.checked)}
            />
            QA option: return a synthetic HTTP 503 response
          </label>

          <div className="form-actions">
            <button
              className="primary-button"
              data-testid="submit-access-request"
              type="submit"
              disabled={busy}
            >
              {busy ? 'Submitting…' : 'Submit request'}
            </button>
          </div>
        </form>
      </section>

      <aside className="content-card guidance-card">
        <p className="section-kicker">Before submitting</p>
        <h2>Request guidance</h2>
        <ul className="check-list">
          <li>Choose only the minimum role required.</li>
          <li>Set an appropriate expiration date.</li>
          <li>Do not enter real customer data in this demo.</li>
        </ul>
        <div className="privacy-box">
          <strong>Privacy behavior</strong>
          <p>
            The customer-reference field is masked in screenshots. Request bodies remain disabled in
            the evidence configuration.
          </p>
        </div>
      </aside>
    </div>
  );
}
