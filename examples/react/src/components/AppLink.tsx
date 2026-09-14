import type { MouseEvent, ReactNode } from 'react';
import { navigate, routeHref, type AppRoute } from '../router';

interface AppLinkProps {
  to: AppRoute;
  children: ReactNode;
  className?: string;
  dataTestId?: string;
  ariaCurrent?: 'page';
}

export function AppLink({ to, children, className, dataTestId, ariaCurrent }: AppLinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>): void {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    navigate(to);
  }

  return (
    <a
      aria-current={ariaCurrent}
      className={className}
      data-testid={dataTestId}
      href={routeHref(to)}
      onClick={handleClick}
    >
      {children}
    </a>
  );
}
