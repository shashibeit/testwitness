import type { ReactNode } from 'react';
import { useTestWitnessIntegration } from '../../TestWitnessExample';
import { type AppRoute } from '../router';
import type { DemoUser } from '../types';
import { AppLink } from './AppLink';

interface PortalShellProps {
  route: AppRoute;
  user: DemoUser;
  title: string;
  description: string;
  onSignOut: () => void;
  children: ReactNode;
}

const NAVIGATION: Array<{ route: AppRoute; label: string; shortLabel: string }> = [
  { route: '/dashboard', label: 'Overview', shortLabel: 'OV' },
  { route: '/access-request', label: 'Access requests', shortLabel: 'AR' },
  { route: '/profile', label: 'Profile settings', shortLabel: 'PS' },
];

export function PortalShell({
  route,
  user,
  title,
  description,
  onSignOut,
  children,
}: PortalShellProps) {
  const witness = useTestWitnessIntegration();

  return (
    <div className="portal-layout">
      <aside className="sidebar">
        <AppLink className="brand-lockup sidebar-brand" to="/dashboard">
          <span className="brand-mark" aria-hidden="true">
            TW
          </span>
          <span>
            <strong>Operations Portal</strong>
            <small>Enterprise workspace</small>
          </span>
        </AppLink>

        <nav aria-label="Primary navigation">
          {NAVIGATION.map((item) => (
            <AppLink
              key={item.route}
              ariaCurrent={route === item.route ? 'page' : undefined}
              className={route === item.route ? 'nav-link active' : 'nav-link'}
              dataTestId={`nav-${item.route.slice(1)}`}
              to={item.route}
            >
              <span aria-hidden="true">{item.shortLabel}</span>
              {item.label}
            </AppLink>
          ))}
        </nav>

        <div className="sidebar-user" data-private>
          <span className="avatar" aria-hidden="true">
            {user.name
              .split(' ')
              .map((part) => part[0])
              .join('')
              .slice(0, 2)}
          </span>
          <span>
            <strong>{user.name}</strong>
            <small>{user.employeeId}</small>
          </span>
        </div>
      </aside>

      <div className="portal-main">
        <header className="topbar">
          <div>
            <p className="breadcrumb">Workspace / {title}</p>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          <div className="topbar-actions">
            <span className={`integration-state ${witness.ready ? 'ready' : ''}`}>
              <span aria-hidden="true" />
              Evidence: {witness.error ? 'unavailable' : witness.status}
              {witness.summary
                ? ` · Video ${witness.summary.videoStatus.replace('-', ' ')} · ${witness.summary.evidence.screenshots} ${witness.summary.evidence.screenshots === 1 ? 'shot' : 'shots'}`
                : ''}
            </span>
            <button
              className="text-button"
              data-testid="sign-out"
              type="button"
              onClick={onSignOut}
            >
              Sign out
            </button>
          </div>
        </header>

        {witness.error && (
          <div className="alert error instrumentation-alert" role="alert">
            TestWitness could not initialize: {witness.error}
          </div>
        )}

        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
