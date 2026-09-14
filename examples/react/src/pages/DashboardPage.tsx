import { useState } from 'react';
import { AppLink } from '../components/AppLink';
import type { DemoUser } from '../types';

interface DashboardPageProps {
  user: DemoUser;
}

const ACTIVITY = [
  {
    id: 'AR-2026-1038',
    action: 'Access request approved',
    time: 'Today, 09:42',
    status: 'Complete',
  },
  {
    id: 'PR-2026-0771',
    action: 'Profile preference changed',
    time: 'Yesterday, 16:18',
    status: 'Complete',
  },
  { id: 'AR-2026-1024', action: 'Elevated access review', time: 'Sep 9, 11:05', status: 'Pending' },
];

export function DashboardPage({ user }: DashboardPageProps) {
  const [range, setRange] = useState<'7-days' | '30-days'>('7-days');
  const currentDate = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  return (
    <div className="dashboard-stack">
      <section className="welcome-banner">
        <div>
          <p className="section-kicker">{currentDate}</p>
          <h2>Welcome back, {user.name.split(' ')[0]}</h2>
          <p>Your workspace has two items that may need attention.</p>
        </div>
        <AppLink
          className="primary-button button-link"
          dataTestId="new-access-request"
          to="/access-request"
        >
          New access request
        </AppLink>
      </section>

      <section className="metric-grid" aria-label="Workspace summary">
        <article className="metric-card">
          <span className="metric-label">Open requests</span>
          <strong>4</strong>
          <small>2 awaiting your response</small>
        </article>
        <article className="metric-card">
          <span className="metric-label">Completed this month</span>
          <strong>18</strong>
          <small className="positive">↑ 12% from August</small>
        </article>
        <article className="metric-card">
          <span className="metric-label">Policy coverage</span>
          <strong>96%</strong>
          <small>All critical controls active</small>
        </article>
        <article className="metric-card private-metric" data-private>
          <span className="metric-label">Assigned account</span>
          <strong>991-42-7281</strong>
          <small>Customer 002845</small>
        </article>
      </section>

      <div className="dashboard-columns">
        <section className="content-card" aria-labelledby="activity-heading">
          <div className="content-card-heading">
            <div>
              <p className="section-kicker">Audit trail</p>
              <h2 id="activity-heading">Recent activity</h2>
            </div>
            <div className="segmented-control" aria-label="Activity date range">
              <button
                className={range === '7-days' ? 'active' : ''}
                aria-pressed={range === '7-days'}
                data-testid="activity-7-days"
                type="button"
                onClick={() => setRange('7-days')}
              >
                7 days
              </button>
              <button
                className={range === '30-days' ? 'active' : ''}
                aria-pressed={range === '30-days'}
                data-testid="activity-30-days"
                type="button"
                onClick={() => setRange('30-days')}
              >
                30 days
              </button>
            </div>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Reference</th>
                  <th scope="col">Activity</th>
                  <th scope="col">Updated</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {ACTIVITY.map((item) => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td>{item.action}</td>
                    <td>{item.time}</td>
                    <td>
                      <span
                        className={
                          item.status === 'Pending' ? 'status-chip pending' : 'status-chip success'
                        }
                      >
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="content-card quick-actions" aria-labelledby="quick-actions-heading">
          <p className="section-kicker">Common tasks</p>
          <h2 id="quick-actions-heading">Quick actions</h2>
          <AppLink to="/access-request">
            <span aria-hidden="true">AR</span>
            <span>
              <strong>Request application access</strong>
              <small>Submit a time-limited role request</small>
            </span>
          </AppLink>
          <AppLink to="/profile">
            <span aria-hidden="true">PS</span>
            <span>
              <strong>Update profile settings</strong>
              <small>Manage contact and notification details</small>
            </span>
          </AppLink>
          <div className="qa-callout" data-evidence-exclude>
            <strong>Tester tip</strong>
            <p>
              Use the floating toolbar to capture this dashboard and add a “Login successful” note.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
