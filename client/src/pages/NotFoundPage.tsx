import { useRef, useEffect } from 'react';
import { useLocale } from '../i18n/LocaleProvider';
import { IconAlertTriangle } from '@tabler/icons-react';
import { applyTheme, getProgramDefaultTheme } from '../theme/themes';

export default function NotFoundPage() {
  const { t, publicPageTheme } = useLocale();
  const screenRef = useRef<HTMLDivElement>(null);

  const themeToApply = publicPageTheme || getProgramDefaultTheme();

  useEffect(() => {
    applyTheme(themeToApply, { persist: 'none' });
  }, [themeToApply]);

  return (
    <div id="loginScreen" className="login-screen" ref={screenRef} style={{ display: 'flex' }}>
      <div className="login-screen__bg" aria-hidden="true">
        <span className="login-screen__bg-layer login-screen__bg-layer--shimmer" />
        <span className="login-screen__bg-layer login-screen__bg-layer--glow" />
        <span className="login-screen__bg-layer login-screen__bg-layer--drift" />
        <span className="login-screen__bg-layer login-screen__bg-layer--stars login-screen__bg-layer--stars-a" />
        <span className="login-screen__bg-layer login-screen__bg-layer--stars login-screen__bg-layer--stars-b" />
        <span className="login-screen__bg-layer login-screen__bg-layer--vignette" />
      </div>

      <article 
        className="login-portal" 
        style={{ 
          '--login-portal-max': '500px',
          margin: 'auto',
          padding: '2rem',
        } as any}
      >
        <div className="login-portal__fx" aria-hidden="true">
          <span className="login-portal__aura" />
          <span className="login-portal__grid" />
          <span className="login-portal__scan" />
          <span className="login-portal__rim" />
        </div>

        <span className="login-screen__corner login-screen__corner--tl" aria-hidden="true" />
        <span className="login-screen__corner login-screen__corner--tr" aria-hidden="true" />
        <span className="login-screen__corner login-screen__corner--bl" aria-hidden="true" />
        <span className="login-screen__corner login-screen__corner--br" aria-hidden="true" />

        <div style={{ position: 'relative', zIndex: 10, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', padding: '1rem 0' }}>
          <div style={{ color: 'var(--accent)', filter: 'drop-shadow(0 0 8px rgba(var(--accent-rgb), 0.5))' }}>
            <IconAlertTriangle size={64} stroke={1.5} />
          </div>
          
          <div>
            <h1 className="login-portal__headline" style={{ fontSize: '4.5rem', margin: 0, lineHeight: 1.1, fontWeight: 800, letterSpacing: '-0.05em' }}>
              <span className="login-screen__brand-text">
                <span className="login-screen__brand-primary" style={{ textShadow: '0 0 15px rgba(var(--accent-rgb), 0.6)' }}>
                  {t('page_not_found_title') || '404'}
                </span>
              </span>
            </h1>
            
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-main)', marginTop: '0.5rem', marginBottom: 0 }}>
              {t('page_not_found_subtitle') || 'Page Not Found'}
            </h2>
          </div>

          <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.5, color: 'var(--text-muted)' }}>
            {t('page_not_found_desc') || 'The requested page does not exist or has been disabled by the administrator.'}
          </p>
        </div>
      </article>
    </div>
  );
}
