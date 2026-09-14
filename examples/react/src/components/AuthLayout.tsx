import type { ReactNode } from 'react';
import { useTestWitnessIntegration } from '../../TestWitnessExample';
import { AppLink } from './AppLink';

interface AuthLayoutProps {
  eyebrow: string;
  title: string;
  introduction: string;
  children: ReactNode;
}

export function AuthLayout({ eyebrow, title, introduction, children }: AuthLayoutProps) {
  const witness = useTestWitnessIntegration();

  return (
    <main className="auth-page">
      <section className="auth-story" aria-label="Operations Portal">
        <div>
          <AppLink className="brand-lockup" to="/login">
            <span className="brand-mark" aria-hidden="true">
              TW
            </span>
            <span>
              <strong>Operations Portal</strong>
              <small>Secure workforce access</small>
            </span>
          </AppLink>
          <div className="story-copy">
            <p className="eyebrow">Local demonstration</p>
            <h2>A realistic application journey—not a recorder control page.</h2>
            <p>
              Use the portal normally while the floating TestWitness toolbar captures evidence
              across each client-side route.
            </p>
          </div>
        </div>

        <div className="story-footer">
          <span className={`integration-state ${witness.ready ? 'ready' : ''}`}>
            <span aria-hidden="true" />
            Evidence {witness.error ? 'unavailable' : witness.ready ? witness.status : 'loading'}
            {witness.summary ? ` · Video ${witness.summary.videoStatus.replace('-', ' ')}` : ''}
          </span>
          <p>Use only the synthetic credentials shown in this demo.</p>
        </div>
      </section>

      <section className="auth-panel" aria-labelledby="auth-heading">
        <div className="auth-card">
          <p className="section-kicker">{eyebrow}</p>
          <h1 id="auth-heading">{title}</h1>
          <p className="auth-introduction">{introduction}</p>
          {witness.error && (
            <div className="alert error" role="alert">
              TestWitness could not initialize: {witness.error}
            </div>
          )}
          {children}
        </div>
      </section>
    </main>
  );
}
