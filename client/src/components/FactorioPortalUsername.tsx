interface FactorioPortalUsernameProps {
  username: string;
  source?: string;
  t: (key: string, ...args: (string | number)[]) => string;
  className?: string;
}

const FACTORIO_PROFILE_URL = 'https://factorio.com/profile';

export function FactorioPortalUsername({
  username,
  source,
  t,
  className,
}: FactorioPortalUsernameProps) {
  const name = String(username || '').trim();
  if (!name) return null;

  const baseLabel = t('factorio_portal_logged_in_username', name);
  const src = String(source || '').trim();
  const label = src ? `${baseLabel} (${src})` : baseLabel;
  const rootClass =
    'factorio-portal-username' + (className ? ' ' + className : '');

  return (
    <a
      href={FACTORIO_PROFILE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={rootClass}
      title={label}
    >
      {name}
    </a>
  );
}
