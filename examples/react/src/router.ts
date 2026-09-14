import { useEffect, useState } from 'react';

export type AppRoute = '/login' | '/signup' | '/dashboard' | '/access-request' | '/profile';

const ROUTE_EVENT = 'testwitness-demo:route-change';
const KNOWN_ROUTES = new Set<AppRoute>([
  '/login',
  '/signup',
  '/dashboard',
  '/access-request',
  '/profile',
]);

function routeFromLocation(): AppRoute {
  const path = window.location.pathname as AppRoute;
  return KNOWN_ROUTES.has(path) ? path : '/login';
}

/** Returns a same-document route so the in-memory evidence session remains mounted. */
export function routeHref(route: AppRoute): string {
  return route;
}

export function navigate(route: AppRoute, replace = false): void {
  const nextUrl = routeHref(route);
  if (replace) window.history.replaceState({ route }, '', nextUrl);
  else window.history.pushState({ route }, '', nextUrl);
  window.dispatchEvent(new Event(ROUTE_EVENT));
}

export function useAppRoute(): AppRoute {
  const [route, setRoute] = useState<AppRoute>(routeFromLocation);

  useEffect(() => {
    const updateRoute = (): void => setRoute(routeFromLocation());
    window.addEventListener('popstate', updateRoute);
    window.addEventListener(ROUTE_EVENT, updateRoute);
    return () => {
      window.removeEventListener('popstate', updateRoute);
      window.removeEventListener(ROUTE_EVENT, updateRoute);
    };
  }, []);

  return route;
}
