import { useEffect, useState } from 'react';
import { PortalShell } from './components/PortalShell';
import { navigate, useAppRoute, type AppRoute } from './router';
import { AccessRequestPage } from './pages/AccessRequestPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { ProfilePage } from './pages/ProfilePage';
import { SignupPage } from './pages/SignupPage';
import type { DemoUser } from './types';

const PAGE_DETAILS: Record<
  Exclude<AppRoute, '/login' | '/signup'>,
  { title: string; description: string }
> = {
  '/dashboard': {
    title: 'Overview',
    description: 'Monitor requests, policy coverage, and recent workspace activity.',
  },
  '/access-request': {
    title: 'Access requests',
    description: 'Request time-limited access to protected business applications.',
  },
  '/profile': {
    title: 'Profile settings',
    description: 'Maintain your contact information and workspace preferences.',
  },
};

function isProtectedRoute(route: AppRoute): route is Exclude<AppRoute, '/login' | '/signup'> {
  return route !== '/login' && route !== '/signup';
}

export function App() {
  const route = useAppRoute();
  const [user, setUser] = useState<DemoUser>();

  useEffect(() => {
    if (window.location.pathname !== route) navigate(route, true);

    const pageTitle =
      route === '/login'
        ? 'Sign in'
        : route === '/signup'
          ? 'Create account'
          : PAGE_DETAILS[route].title;
    document.title = `${pageTitle} · Operations Portal`;

    if (isProtectedRoute(route) && !user) navigate('/login', true);
  }, [route, user]);

  function completeAuthentication(authenticatedUser: DemoUser): void {
    setUser(authenticatedUser);
    navigate('/dashboard');
  }

  function signOut(): void {
    setUser(undefined);
    navigate('/login');
  }

  if (route === '/login') {
    return <LoginPage onSignedIn={completeAuthentication} />;
  }

  if (route === '/signup') {
    return <SignupPage onAccountCreated={completeAuthentication} />;
  }

  if (!user) {
    return <LoginPage onSignedIn={completeAuthentication} />;
  }

  const page = PAGE_DETAILS[route];
  return (
    <PortalShell
      route={route}
      user={user}
      title={page.title}
      description={page.description}
      onSignOut={signOut}
    >
      {route === '/dashboard' && <DashboardPage user={user} />}
      {route === '/access-request' && <AccessRequestPage />}
      {route === '/profile' && (
        <ProfilePage
          user={user}
          onProfileUpdated={(updates) =>
            setUser((current) => (current ? { ...current, ...updates } : current))
          }
        />
      )}
    </PortalShell>
  );
}
