import type { ReactNode } from 'react';

interface MobileShellProps {
  actions?: ReactNode;
  withNav?: boolean;
  children: ReactNode;
}

export function MobileShell({ actions, withNav, children }: MobileShellProps) {
  const showHeader = !!actions;

  return (
    <div
      className={`mobile-shell${withNav ? ' mobile-shell--with-nav' : ''}${!showHeader ? ' mobile-shell--no-header' : ''}`}
    >
      {showHeader ? (
        <header className="mobile-top-bar">
          <div className="mobile-top-actions">{actions}</div>
        </header>
      ) : null}
      <main className="mobile-content">{children}</main>
    </div>
  );
}
