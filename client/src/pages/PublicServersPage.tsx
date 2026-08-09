import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence, type Variants } from 'motion/react';
import { api } from '../api/client';
import { useLocale } from '../i18n/LocaleProvider';
import { getLocalLanguageOverride, setLocalLanguageOverride } from '../i18n/locale';
import { AppIcon } from '../components/AppIcon';
import type { InstanceItem } from '../types/instance';
import { IconUsers, IconSettings, IconList, IconPlayerPlay, IconCopy, IconCheck, IconServer, IconHelp, IconClock, IconDownload, IconWorld, IconBrandDiscord, IconBrandTelegram, IconBrandGithub } from '@tabler/icons-react';
import { notifyErr, notifyOk } from '../lib/notify';
import { applyEffectiveTheme, applyTheme, getProgramDefaultTheme } from '../theme/themes';
import { CryoLoginSnow } from '../theme/CryoLoginSnow';
import { formatUptime } from '../lib/instanceUtils';
import {
  useServerListIconsProbe,
  SPACE_AGE_LIST_ICON_URL,
  SERVER_LIST_MOD_BADGE_ICON_URL,
  SERVER_LIST_MOD_BADGE_I18N,
} from '../lib/serverListIcons';

function getLinkIcon(url: string) {
  const norm = url.toLowerCase();
  if (norm.includes('discord')) return <IconBrandDiscord size={18} />;
  if (norm.includes('t.me') || norm.includes('telegram')) return <IconBrandTelegram size={18} />;
  if (norm.includes('github')) return <IconBrandGithub size={18} />;
  return <IconWorld size={18} />;
}

export default function PublicServersPage() {
  const {
    t,
    publicPageTitle,
    publicPageSubtitle,
    publicPageTheme,
    publicPageHideTitle,
    publicPageHideSubtitle,
    availableLanguages,
    panelDefaultLanguage,
    publicPageAllowModDownloads,
    publicPageShowPlayers,
    publicPageContactLink,
    reload: reloadLocale,
  } = useLocale();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [modsModal, setModsModal] = useState<{ id: string; name: string; mods: { name: string; title: string; version?: string }[] } | null>(null);
  const [playersModal, setPlayersModal] = useState<{ id: string; name: string; players: string[] } | null>(null);
  const [infoModal, setInfoModal] = useState<InstanceItem | null>(null);
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
  const [showLangDropdown, setShowLangDropdown] = useState<boolean>(false);

  const { ready: readyIcons, isAvailable: isIconAvailable } = useServerListIconsProbe();

  const currentLang = getLocalLanguageOverride() || panelDefaultLanguage || 'en';

  const languageLabel = (code: string): string => {
    const key = `lang_name_${code}`;
    const label = t(key);
    return label !== key ? label : code.toUpperCase();
  };

  const screenRef = useRef<HTMLDivElement>(null);
  const brandRef = useRef<HTMLDivElement>(null);

  const themeToApply = publicPageTheme || getProgramDefaultTheme();

  useEffect(() => {
    applyTheme(themeToApply, { persist: 'none' });

    const enforceTheme = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.theme !== themeToApply) {
        applyTheme(themeToApply, { persist: 'none' });
      }
    };
    window.addEventListener('fcc-theme-applied', enforceTheme);

    return () => {
      window.removeEventListener('fcc-theme-applied', enforceTheme);
      applyEffectiveTheme();
    };
  }, [themeToApply]);

  const isCryo = themeToApply === 'cryogenics';

  const [, setTick] = useState(0);
  const lastFetchTimeRef = useRef<number>(Date.now());

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['public-servers'],
    queryFn: () => api<{ ok: boolean; items: InstanceItem[] }>('/api/public-servers'),
    refetchInterval: 5000,
  });

  useEffect(() => {
    lastFetchTimeRef.current = Date.now();
  }, [data]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick(t => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const servers = data?.items || [];
  const onlineServersCount = servers.filter(s => s.status === 'running').length;

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const [downloading, setDownloading] = useState(false);

  const handleDownloadMods = async (instanceId: string) => {
    if (downloading) return;
    setDownloading(true);
    try {
      const response = await fetch(`/api/public-servers/${instanceId}/download-mods`);
      if (!response.ok) {
        let errorMsg = t('download_limit_exceeded') || 'Rate limit exceeded. Please try again in 15 minutes.';
        try {
          const errData = await response.json();
          if (errData && errData.message) {
            errorMsg = errData.message;
          }
        } catch {
          // ignore
        }
        notifyErr(t('error') || 'Error', errorMsg);
        setDownloading(false);
        return;
      }
      
      const blob = await response.blob();
      let filename = `${modsModal?.name || 'server'}-mods.zip`;
      const cd = response.headers.get('Content-Disposition');
      if (cd) {
        const match = /filename="?([^"]+)"?/.exec(cd);
        if (match && match[1]) {
          filename = match[1];
        }
      }
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      
      notifyOk(t('success') || 'Success', t('download_complete') || 'Mods download started!');
    } catch (err) {
      notifyErr(t('error') || 'Error', t('api_error_load_failed') || 'Failed to download.');
    } finally {
      setDownloading(false);
    }
  };

  const containerVariants: Variants = {
    hidden: { opacity: 1 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
  };

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
      {isCryo && <CryoLoginSnow active={true} melting={false} screenRef={screenRef} brandRef={brandRef} />}

      <article
        className="login-portal"
        style={{
          '--login-portal-max': '1400px',
          height: '90vh'
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

        <div
          style={{
            position: 'absolute',
            top: '1.25rem',
            right: '1.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            zIndex: 50,
          }}
        >
          {publicPageContactLink && (
            <a
              href={publicPageContactLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid color-mix(in srgb, var(--border) 70%, var(--accent) 15%)',
                color: 'var(--accent)',
                cursor: 'pointer',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                transition: 'all 0.2s',
                opacity: 0.8,
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                textDecoration: 'none',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '1';
                e.currentTarget.style.background = 'rgba(var(--accent-rgb), 0.15)';
                e.currentTarget.style.borderColor = 'var(--accent)';
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '0.8';
                e.currentTarget.style.background = 'rgba(0, 0, 0, 0.4)';
                e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--border) 70%, var(--accent) 15%)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
              title={t('public_page_contact_link') || 'Contact'}
            >
              {getLinkIcon(publicPageContactLink)}
            </a>
          )}

          {availableLanguages.length > 1 && (
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setShowLangDropdown(!showLangDropdown)}
                style={{
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid color-mix(in srgb, var(--border) 70%, var(--accent) 15%)',
                  color: 'var(--accent)',
                  cursor: 'pointer',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '50%',
                  transition: 'all 0.2s',
                  opacity: 0.8,
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                  fontFamily: 'inherit',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '1';
                  e.currentTarget.style.background = 'rgba(var(--accent-rgb), 0.15)';
                  e.currentTarget.style.borderColor = 'var(--accent)';
                  e.currentTarget.style.transform = 'scale(1.05)';
                }}
                onMouseLeave={(e) => {
                  if (!showLangDropdown) {
                    e.currentTarget.style.opacity = '0.8';
                    e.currentTarget.style.background = 'rgba(0, 0, 0, 0.4)';
                    e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--border) 70%, var(--accent) 15%)';
                    e.currentTarget.style.transform = 'scale(1)';
                  }
                }}
                title={t('program_language_label') || 'Language'}
              >
                {currentLang.toUpperCase()}
              </button>

              <AnimatePresence>
                {showLangDropdown && (
                  <>
                    <div
                      onClick={() => setShowLangDropdown(false)}
                      style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 90,
                        cursor: 'default',
                      }}
                    />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -5 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -5 }}
                      transition={{ duration: 0.15 }}
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 0.5rem)',
                        right: 0,
                        zIndex: 100,
                        background: 'rgba(15, 15, 18, 0.95)',
                        backdropFilter: 'blur(12px)',
                        border: '1px solid color-mix(in srgb, var(--border) 70%, var(--accent) 20%)',
                        borderRadius: '8px',
                        padding: '0.35rem',
                        minWidth: '120px',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.2rem',
                      }}
                    >
                      {availableLanguages.map((code) => {
                        const active = code === currentLang;
                        return (
                          <button
                            key={code}
                            type="button"
                            onClick={() => {
                              if (!active) {
                                setLocalLanguageOverride(code);
                                void reloadLocale();
                              }
                              setShowLangDropdown(false);
                            }}
                            style={{
                              background: active ? 'rgba(var(--accent-rgb), 0.15)' : 'transparent',
                              border: 'none',
                              borderRadius: '6px',
                              color: active ? 'var(--accent)' : 'var(--text-muted)',
                              cursor: 'pointer',
                              padding: '0.5rem 0.75rem',
                              textAlign: 'left',
                              fontSize: '0.8rem',
                              fontWeight: active ? 600 : 500,
                              transition: 'all 0.15s',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              width: '100%',
                            }}
                            onMouseEnter={(e) => {
                              if (!active) {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                e.currentTarget.style.color = 'var(--text-main)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!active) {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.color = 'var(--text-muted)';
                              }
                            }}
                          >
                            <span>{languageLabel(code)}</span>
                            {active && <IconCheck size={14} />}
                          </button>
                        );
                      })}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowHelpModal(true)}
            style={{
              background: 'rgba(0, 0, 0, 0.4)',
              border: '1px solid color-mix(in srgb, var(--border) 70%, var(--accent) 15%)',
              color: 'var(--accent)',
              cursor: 'pointer',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              transition: 'all 0.2s',
              opacity: 0.8,
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '1';
              e.currentTarget.style.background = 'rgba(var(--accent-rgb), 0.15)';
              e.currentTarget.style.borderColor = 'var(--accent)';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '0.8';
              e.currentTarget.style.background = 'rgba(0, 0, 0, 0.4)';
              e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--border) 70%, var(--accent) 15%)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
            title={t('how_to_connect_title') || 'How to connect'}
          >
            <IconHelp size={18} stroke={2.5} />
          </button>
        </div>

        {(!publicPageHideTitle || !publicPageHideSubtitle) ? (
          <div className="login-screen__brand login-portal__brand" ref={brandRef} aria-label="Factorio Control Center" style={{ padding: '2rem 2rem 1rem' }}>
            {!publicPageHideTitle && (
              <h1 className="login-portal__headline">
                <span className="login-screen__brand-text" style={{ fontSize: '2.5rem' }}>
                  <span className="login-screen__brand-primary">{publicPageTitle || t('public_servers_page_title') || 'Factorio Servers'}</span>
                </span>
              </h1>
            )}
            {!publicPageHideSubtitle && (
              <p style={{ marginTop: '1rem', color: 'var(--text-muted)', fontSize: '1.1rem', maxWidth: '600px', margin: '1rem auto 0', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                {publicPageSubtitle || t('public_servers_page_desc') || 'Welcome to our public servers. Select a server to view details or connect.'}
              </p>
            )}
          </div>
        ) : (
          <div ref={brandRef} style={{ height: '3.5rem', flexShrink: 0 }} />
        )}

        <section className="panel login-screen__panel login-portal__gate" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0, minHeight: 0 }}>
          <div className="panel__body" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '1.5rem', minHeight: 0 }}>
            {isLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <div className="loader" style={{ width: '40px', height: '40px', border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
              </div>
            ) : isError ? (
              <div style={{ background: 'rgba(231, 76, 60, 0.1)', color: 'var(--danger)', padding: '2rem', border: '1px solid rgba(231, 76, 60, 0.2)', borderRadius: '12px', textAlign: 'center' }}>
                <div style={{ marginBottom: '1rem', opacity: 0.8 }}><AppIcon name="info" size={32} /></div>
                <h3 style={{ margin: '0 0 0.5rem 0' }}>{t('error') || 'Error Loading Servers'}</h3>
                <p style={{ margin: 0, opacity: 0.8 }}>{String(error)}</p>
              </div>
            ) : servers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '16px', border: '1px solid var(--border)' }}>
                <div style={{ opacity: 0.2, marginBottom: '1rem' }}><AppIcon name="lan" size={48} /></div>
                <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.5rem', opacity: 0.8 }}>{t('no_public_servers') || 'No public servers available'}</h3>
                <p style={{ margin: 0, opacity: 0.5 }}>Check back later for new servers to join.</p>
              </div>
            ) : (
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="show"
                style={{
                  flex: 1,
                  display: 'grid',
                  gap: '1rem',
                  gridTemplateColumns: servers.length <= 2
                    ? 'repeat(auto-fit, minmax(360px, 450px))'
                    : 'repeat(auto-fill, minmax(360px, 1fr))',
                  gridAutoRows: 'minmax(176px, auto)',
                  alignContent: 'start',
                  justifyContent: servers.length <= 2 ? 'center' : undefined
                }}
              >
                <AnimatePresence>
                  {servers.map((server) => {
                    const isOnline = server.status === 'running';
                    const connectStr = `${server.publicConnectionAddress || (server.ip === '0.0.0.0' || server.ip === '127.0.0.1' || server.ip === 'localhost' ? window.location.hostname : server.ip)}:${server.port}`;
                    const steamUrl = `steam://run/427520//--mp-connect%20${encodeURIComponent(connectStr)}/`;
                    const isCopied = copiedId === server.id;

                    return (
                      <motion.div
                        key={server.id}
                        variants={itemVariants}
                        layout
                        whileHover={{ y: -2 }}
                        style={{
                          minHeight: '176px',
                          background: 'linear-gradient(168deg, rgba(var(--bg-widget-rgb), 0.4) 0%, rgba(0,0,0,0.6) 100%)',
                          border: '1px solid color-mix(in srgb, var(--border) 70%, var(--accent) 15%)',
                          borderRadius: '12px',
                          padding: '0.85rem 1.25rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.5rem',
                          position: 'relative',
                          overflow: 'hidden',
                          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                        }}
                      >
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: isOnline ? 'var(--success)' : 'var(--danger)', opacity: 0.8 }} />

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <h3 style={{ fontSize: '1.25rem', fontWeight: '600', margin: 0, lineHeight: 1.2, color: 'var(--text-main)', wordBreak: 'break-word' }}>{server.name}</h3>
                              {readyIcons && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                  {server.hasSpaceAge && isIconAvailable(SPACE_AGE_LIST_ICON_URL) && (
                                    <img
                                      src={SPACE_AGE_LIST_ICON_URL}
                                      alt="Space Age"
                                      title={t('instance_space_age_badge_title') || 'Space Age'}
                                      style={{ height: '18px', width: 'auto', display: 'block' }}
                                      draggable={false}
                                    />
                                  )}
                                  {server.modBadges?.map((id: string) => {
                                    const iconUrl = (SERVER_LIST_MOD_BADGE_ICON_URL as any)[id];
                                    const titleKey = (SERVER_LIST_MOD_BADGE_I18N as any)[id];
                                    if (iconUrl && isIconAvailable(iconUrl)) {
                                      return (
                                        <img
                                          key={id}
                                          src={iconUrl}
                                          alt={id}
                                          title={t(titleKey) || id}
                                          style={{ height: '18px', width: 'auto', display: 'block' }}
                                          draggable={false}
                                        />
                                      );
                                    }
                                    return null;
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                            {isOnline && server.uptimeSeconds !== undefined && server.uptimeSeconds !== null && (() => {
                              const elapsed = Math.floor((Date.now() - lastFetchTimeRef.current) / 1000);
                              const currentUptime = Math.max(0, server.uptimeSeconds + elapsed);
                              return (
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.3rem',
                                    fontSize: '0.7rem',
                                    fontWeight: '600',
                                    color: 'var(--text-muted)',
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    padding: '0.25rem 0.5rem',
                                    borderRadius: '999px',
                                    border: '1px solid rgba(255, 255, 255, 0.08)',
                                    whiteSpace: 'nowrap'
                                  }}
                                  title={t('server_uptime') || 'Uptime'}
                                >
                                  <IconClock size={12} stroke={2} />
                                  <span>{formatUptime(currentUptime, t('server_uptime_placeholder') || '—')}</span>
                                </div>
                              );
                            })()}
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              fontSize: '0.7rem',
                              fontWeight: '600',
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                              color: isOnline ? 'var(--success)' : 'var(--danger)',
                              background: isOnline ? 'rgba(46, 204, 113, 0.1)' : 'rgba(231, 76, 60, 0.1)',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '999px',
                              border: `1px solid ${isOnline ? 'rgba(46, 204, 113, 0.2)' : 'rgba(231, 76, 60, 0.2)'}`,
                              whiteSpace: 'nowrap'
                            }}>
                              <span style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                background: 'currentColor',
                                boxShadow: isOnline ? '0 0 6px currentColor' : 'none'
                              }} />
                              {isOnline ? (t('server_status_running') || 'Online') : (t('server_status_stopped') || 'Offline')}
                            </div>
                          </div>
                        </div>

                        <p style={{
                          opacity: 0.7,
                          fontSize: '0.86rem',
                          margin: 0,
                          lineHeight: 1.35,
                          color: 'var(--text-muted)',
                          minHeight: '1.15rem',
                          display: '-webkit-box',
                          WebkitLineClamp: 1,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          wordBreak: 'break-word'
                        }}>
                          {server.publicDescription || ' '}
                        </p>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', fontSize: '0.76rem', background: 'rgba(0,0,0,0.25)', padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', marginTop: 'auto' }}>
                          {publicPageShowPlayers && (server.onlineCount || 0) > 0 && server.publicPlayers?.length ? (
                            <div
                              style={{
                                display: 'flex', alignItems: 'center', gap: '0.3rem', flex: '1 1 auto',
                                cursor: 'pointer',
                                color: 'var(--text-muted)',
                                borderRadius: '4px',
                                padding: '2px 4px',
                                margin: '-2px -4px',
                                transition: 'background 0.15s, color 0.15s',
                              }}
                              onClick={() => {
                                setPlayersModal({ id: String(server.id), name: String(server.name || ''), players: server.publicPlayers || [] });
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'var(--text-main)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-muted)'; }}
                            >
                              <IconUsers size={14} stroke={2} />
                              <span style={{ fontWeight: '600', color: 'var(--text-main)' }}>{server.onlineCount || 0}</span>
                              <span>{t('players') || 'Players'}</span>
                              <span style={{ opacity: 0.4, fontSize: '0.7rem' }}>↗</span>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flex: '1 1 auto', color: 'var(--text-muted)' }}>
                              <IconUsers size={14} stroke={2} />
                              <span style={{ fontWeight: '600', color: 'var(--text-main)' }}>{server.onlineCount || 0}</span>
                              <span>{t('players') || 'Players'}</span>
                            </div>
                          )}
                          <div
                            style={{
                              display: 'flex', alignItems: 'center', gap: '0.3rem', flex: '1 1 auto',
                              cursor: 'pointer',
                              color: 'var(--text-muted)',
                              borderRadius: '4px',
                              padding: '2px 4px',
                              margin: '-2px -4px',
                              transition: 'background 0.15s, color 0.15s',
                            }}
                            onClick={() => setInfoModal(server)}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'var(--text-main)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-muted)'; }}
                            title={t('server_details') || 'Server Details'}
                          >
                            <IconSettings size={14} stroke={2} />
                            <span style={{ fontWeight: '600', color: 'var(--text-main)' }}>{server.gameVersion || 'Unknown'}</span>
                            <span style={{ opacity: 0.4, fontSize: '0.7rem' }}>↗</span>
                          </div>

                          <div
                            style={{
                              display: 'flex', alignItems: 'center', gap: '0.3rem', flex: '1 1 auto',
                              cursor: (server.modsCount || 0) > 0 ? 'pointer' : 'default',
                              color: 'var(--text-muted)',
                              borderRadius: '4px',
                              padding: '2px 4px',
                              margin: '-2px -4px',
                              transition: 'background 0.15s, color 0.15s',
                            }}
                            onClick={() => {
                              if ((server.modsCount || 0) > 0 && server.publicMods?.length) {
                                setModsModal({ id: String(server.id), name: String(server.name || ''), mods: server.publicMods });
                              }
                            }}
                            onMouseEnter={(e) => { if ((server.modsCount || 0) > 0) { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'var(--text-main)'; } }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-muted)'; }}
                          >
                            <IconList size={14} stroke={2} />
                            <span style={{ fontWeight: '600', color: 'var(--text-main)' }}>{server.modsCount || 0}</span>
                            <span>{t('mods') || 'Mods'}</span>
                            {(server.modsCount || 0) > 0 && <span style={{ opacity: 0.4, fontSize: '0.7rem' }}>↗</span>}
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <a
                            href={isOnline ? steamUrl : '#'}
                            className="login-portal__cta"
                            style={{
                              flex: 1,
                              height: '34px',
                              minHeight: '34px',
                              fontSize: '0.82rem',
                              opacity: isOnline ? 1 : 0.5,
                              pointerEvents: isOnline ? 'auto' : 'none',
                              textDecoration: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.45rem'
                            }}
                          >
                            <span className="login-portal__cta-mark" aria-hidden="true" />
                            <IconPlayerPlay size={14} stroke={2} style={{ position: 'relative', zIndex: 1 }} />
                            <span className="login-portal__cta-text">{t('connect_steam') || 'Steam'}</span>
                          </a>
                          <button
                            type="button"
                            className="login-portal__cta"
                            style={{
                              flex: 1,
                              height: '34px',
                              minHeight: '34px',
                              fontSize: '0.82rem',
                              background: isCopied ? 'rgba(46, 204, 113, 0.15)' : undefined,
                              borderColor: isCopied ? 'var(--success)' : undefined,
                              color: isCopied ? 'var(--success)' : undefined,
                              opacity: isOnline ? 1 : 0.5,
                              pointerEvents: isOnline ? 'auto' : 'none',
                              boxShadow: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.45rem'
                            }}
                            onClick={() => handleCopy(server.id, connectStr)}
                          >
                            <span className="login-portal__cta-mark" aria-hidden="true" style={{ opacity: isCopied ? 1 : 0, background: 'var(--success)' }} />
                            {isCopied ? <IconCheck size={14} stroke={2} style={{ position: 'relative', zIndex: 1 }} /> : <IconCopy size={14} stroke={2} style={{ position: 'relative', zIndex: 1 }} />}
                            <span className="login-portal__cta-text">{isCopied ? (t('copied') || 'Copied!') : (t('copy_ip') || 'Copy IP')}</span>
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </motion.div>
            )}
          </div>
        </section>

        <footer className="login-screen__hud login-portal__foot login-portal__telemetry" aria-hidden="true">
          <div className="login-portal__telemetry-head">
            <span className="login-portal__telemetry-head-tag">SYS/DIAG</span>
            <span className="login-portal__telemetry-head-line" aria-hidden="true" />
          </div>
          <div className="login-portal__telemetry-rail">
            <div className="login-portal__telemetry-slot">
              <span className="login-portal__telemetry-label">PUB</span>
              <span className="login-portal__telemetry-value login-screen__hud-value">GUEST</span>
            </div>
            <div className="login-portal__telemetry-slot">
              <span className="login-portal__telemetry-label">NET</span>
              <span className="login-portal__telemetry-value login-screen__hud-value">{servers.length} SERVERS</span>
            </div>
            <div className="login-portal__telemetry-slot">
              <span className="login-portal__telemetry-label">ONL</span>
              <span className="login-portal__telemetry-value login-screen__hud-value">{onlineServersCount} SERVERS</span>
            </div>
            <div className="login-portal__telemetry-slot login-portal__telemetry-slot--status login-screen__hud-cell login-screen__hud-cell--status login-portal__telemetry-slot--granted">
              <span className="login-portal__telemetry-label">STAT</span>
              <span className="login-portal__telemetry-status">
                <span className="login-screen__hud-pulse" aria-hidden="true" />
                <span className="login-screen__hud-value login-screen__hud-value--accent">
                  ACTIVE
                </span>
              </span>
            </div>
          </div>
        </footer>
      </article>

      {/* Mods Modal */}
      <AnimatePresence>
        {modsModal && (
          <motion.div
            key="mods-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setModsModal(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 1000,
              background: 'rgba(0,0,0,0.7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '2rem',
              backdropFilter: 'blur(8px)',
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="login-portal"
              style={{
                width: '100%',
                maxWidth: '600px',
                maxHeight: '80vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
              }}
            >
              <div className="login-portal__fx" aria-hidden="true">
                <span className="login-portal__aura" />
                <span className="login-portal__scan" />
              </div>
              <span className="login-screen__corner login-screen__corner--tl" aria-hidden="true" />
              <span className="login-screen__corner login-screen__corner--tr" aria-hidden="true" />
              <span className="login-screen__corner login-screen__corner--bl" aria-hidden="true" />
              <span className="login-screen__corner login-screen__corner--br" aria-hidden="true" />

              <div style={{ padding: '1.5rem', borderBottom: '1px solid color-mix(in srgb, var(--border) 70%, var(--accent) 15%)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 10 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-main)', textShadow: '0 0 8px rgba(var(--accent-rgb), 0.5)' }}>
                    {t('mods') || 'Mods'}
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.25rem 0 0 0', opacity: 0.6, fontSize: '0.85rem' }}>
                    <IconServer size={14} />
                    {modsModal.name} &mdash; {modsModal.mods.length} {t('mods') || 'mods'}
                  </div>
                </div>
                <button
                  type="button"
                  className="login-portal__input-toggle"
                  style={{ position: 'relative' }}
                  onClick={() => setModsModal(null)}
                >
                  ✕
                </button>
              </div>
              <div style={{ overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', position: 'relative', zIndex: 10 }}>
                {modsModal.mods.map((mod) => (
                  <div
                    key={mod.name}
                    style={{
                      padding: '0.5rem 0.75rem',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255,255,255,0.05)',
                      borderRadius: '4px',
                      fontSize: '0.85rem',
                      color: 'var(--text-muted)',
                      wordBreak: 'break-all',
                      display: 'flex',
                      alignItems: 'baseline',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>
                      {mod.title || mod.name}
                    </span>
                    {mod.version && (
                      <span style={{ fontSize: '0.75rem', opacity: 0.5, marginLeft: '0.55rem', fontFamily: 'monospace' }}>
                        v{mod.version}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {publicPageAllowModDownloads && (
                <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid color-mix(in srgb, var(--border) 70%, var(--accent) 15%)', display: 'flex', justifyContent: 'flex-end', position: 'relative', zIndex: 10 }}>
                  <button
                    type="button"
                    className="login-portal__cta"
                    disabled={downloading}
                    onClick={() => handleDownloadMods(modsModal.id)}
                    style={{
                      height: '36px',
                      minHeight: '36px',
                      fontSize: '0.85rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0 1.25rem',
                      opacity: downloading ? 0.6 : 1,
                      cursor: downloading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <span className="login-portal__cta-mark" aria-hidden="true" />
                    <IconDownload size={16} stroke={2} style={{ position: 'relative', zIndex: 1 }} />
                    <span className="login-portal__cta-text">
                      {downloading ? (t('loading') || 'Downloading...') : (t('download_mods_zip') || 'Download mods (.zip)')}
                    </span>
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Players Modal */}
      <AnimatePresence>
        {playersModal && (
          <motion.div
            key="players-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPlayersModal(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 1000,
              background: 'rgba(0,0,0,0.7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '2rem',
              backdropFilter: 'blur(8px)',
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="login-portal"
              style={{
                width: '100%',
                maxWidth: '500px',
                maxHeight: '80vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
              }}
            >
              <div className="login-portal__fx" aria-hidden="true">
                <span className="login-portal__aura" />
                <span className="login-portal__scan" />
              </div>
              <span className="login-screen__corner login-screen__corner--tl" aria-hidden="true" />
              <span className="login-screen__corner login-screen__corner--tr" aria-hidden="true" />
              <span className="login-screen__corner login-screen__corner--bl" aria-hidden="true" />
              <span className="login-screen__corner login-screen__corner--br" aria-hidden="true" />

              <div style={{ padding: '1.5rem', borderBottom: '1px solid color-mix(in srgb, var(--border) 70%, var(--accent) 15%)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 10 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-main)', textShadow: '0 0 8px rgba(var(--accent-rgb), 0.5)' }}>
                    {t('online_players') || 'Online Players'}
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.25rem 0 0 0', opacity: 0.6, fontSize: '0.85rem' }}>
                    <IconServer size={14} />
                    {playersModal.name} &mdash; {playersModal.players.length} {t('players') || 'players'}
                  </div>
                </div>
                <button
                  type="button"
                  className="login-portal__input-toggle"
                  style={{ position: 'relative' }}
                  onClick={() => setPlayersModal(null)}
                >
                  ✕
                </button>
              </div>
              <div style={{ overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', position: 'relative', zIndex: 10 }}>
                {playersModal.players.map((player) => (
                  <div
                    key={player}
                    style={{
                      padding: '0.5rem 0.75rem',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255,255,255,0.05)',
                      borderRadius: '4px',
                      fontSize: '0.85rem',
                      fontFamily: 'monospace',
                      color: 'var(--text-muted)',
                      wordBreak: 'break-all',
                    }}
                  >
                    {player}
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Server Info Modal */}
      <AnimatePresence>
        {infoModal && (
          <motion.div
            key="info-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setInfoModal(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 1000,
              background: 'rgba(0,0,0,0.7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '2rem',
              backdropFilter: 'blur(8px)',
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="login-portal"
              style={{
                width: '100%',
                maxWidth: '500px',
                maxHeight: '80vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
              }}
            >
              <div className="login-portal__fx" aria-hidden="true">
                <span className="login-portal__aura" />
                <span className="login-portal__scan" />
              </div>
              <span className="login-screen__corner login-screen__corner--tl" aria-hidden="true" />
              <span className="login-screen__corner login-screen__corner--tr" aria-hidden="true" />
              <span className="login-screen__corner login-screen__corner--bl" aria-hidden="true" />
              <span className="login-screen__corner login-screen__corner--br" aria-hidden="true" />

              <div style={{ padding: '1.5rem', borderBottom: '1px solid color-mix(in srgb, var(--border) 70%, var(--accent) 15%)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 10 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-main)', textShadow: '0 0 8px rgba(var(--accent-rgb), 0.5)' }}>
                    {t('server_details') || 'Server Details'}
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.25rem 0 0 0', opacity: 0.6, fontSize: '0.85rem' }}>
                    <IconServer size={14} />
                    {infoModal.name}
                  </div>
                </div>
                <button
                  type="button"
                  className="login-portal__input-toggle"
                  style={{ position: 'relative' }}
                  onClick={() => setInfoModal(null)}
                >
                  ✕
                </button>
              </div>

              <div style={{ overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative', zIndex: 10 }}>
                {/* Details Table */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  
                  {/* Game Version */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                      {t('web_panel_game_version_label') || 'Version'}
                    </span>
                    <span style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.9rem', fontFamily: 'monospace' }}>
                      {infoModal.gameVersion || 'Unknown'}
                    </span>
                  </div>

                  {/* DLC Space Age */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                      {t('instance_space_age_badge_title') || 'Space Age'}
                    </span>
                    <span style={{
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      color: infoModal.hasSpaceAge ? 'var(--accent)' : 'var(--text-muted)',
                      textTransform: 'uppercase',
                    }}>
                      {infoModal.hasSpaceAge ? (t('yes') || 'Yes') : (t('no') || 'No')}
                    </span>
                  </div>

                  {/* Server Name from Settings */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                      {t('server_name') || 'Server Name'}
                    </span>
                    <span style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.9rem' }}>
                      {infoModal.serverSettingsName || infoModal.name || 'Unknown'}
                    </span>
                  </div>

                  {/* Description from Settings */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                      {t('description') || 'Description'}
                    </span>
                    <span style={{ color: 'var(--text-main)', fontSize: '0.9rem', whiteSpace: 'pre-line', opacity: infoModal.serverSettingsDesc ? 1 : 0.5 }}>
                      {infoModal.serverSettingsDesc || t('no_description') || 'No description'}
                    </span>
                  </div>

                  {/* Require User Verification (Auth) */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                      {t('require_user_verification') || 'Require user verification'}
                    </span>
                    <span style={{
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      color: infoModal.requireUserVerification ? 'var(--success)' : 'var(--text-muted)',
                      textTransform: 'uppercase',
                    }}>
                      {infoModal.requireUserVerification ? (t('yes') || 'Yes') : (t('no') || 'No')}
                    </span>
                  </div>

                  {/* Auto Pause */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                      {t('auto_pause') || 'Auto pause when empty'}
                    </span>
                    <span style={{
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      color: infoModal.serverSettingsAutoPause ? 'var(--accent)' : 'var(--text-muted)',
                      textTransform: 'uppercase',
                    }}>
                      {infoModal.serverSettingsAutoPause ? (t('yes') || 'Yes') : (t('no') || 'No')}
                    </span>
                  </div>

                  {/* Max Players */}
                  {infoModal.serverSettingsMaxPlayers !== undefined && infoModal.serverSettingsMaxPlayers > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        {t('max_players') || 'Max players'}
                      </span>
                      <span style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.9rem' }}>
                        {infoModal.serverSettingsMaxPlayers}
                      </span>
                    </div>
                  )}

                  {/* AFK Auto-kick */}
                  {infoModal.serverSettingsAfkAutokick !== undefined && infoModal.serverSettingsAfkAutokick > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        {t('afk_autokick_interval') || 'AFK auto-kick (min)'}
                      </span>
                      <span style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.9rem' }}>
                        {infoModal.serverSettingsAfkAutokick}
                      </span>
                    </div>
                  )}

                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Help Modal */}
      <AnimatePresence>
        {showHelpModal && (
          <motion.div
            key="help-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowHelpModal(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1000,
              background: 'rgba(0,0,0,0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '2rem',
              backdropFilter: 'blur(8px)',
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="login-portal"
              style={{
                width: '100%',
                maxWidth: '600px',
                maxHeight: '80vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
              }}
            >
              <div className="login-portal__fx" aria-hidden="true">
                <span className="login-portal__aura" />
                <span className="login-portal__scan" />
              </div>
              <span className="login-screen__corner login-screen__corner--tl" aria-hidden="true" />
              <span className="login-screen__corner login-screen__corner--tr" aria-hidden="true" />
              <span className="login-screen__corner login-screen__corner--bl" aria-hidden="true" />
              <span className="login-screen__corner login-screen__corner--br" aria-hidden="true" />

              <div style={{ padding: '1.5rem', borderBottom: '1px solid color-mix(in srgb, var(--border) 70%, var(--accent) 15%)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 10 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-main)', textShadow: '0 0 8px rgba(var(--accent-rgb), 0.5)' }}>
                    {t('how_to_connect_title') || 'How to connect'}
                  </h2>
                </div>
                <button
                  type="button"
                  className="login-portal__input-toggle"
                  style={{ position: 'relative' }}
                  onClick={() => setShowHelpModal(false)}
                >
                  ✕
                </button>
              </div>
              <div style={{ overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', position: 'relative', zIndex: 10 }}>

                {/* Steam Method */}
                <div style={{ display: 'flex', gap: '1rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '1rem' }}>
                  <div style={{ color: 'var(--accent)', marginTop: '0.15rem' }}>
                    <IconPlayerPlay size={20} />
                  </div>
                  <div>
                    <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)' }}>
                      {t('how_to_connect_steam_title') || 'Via Steam (recommended)'}
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.4, color: 'var(--text-muted)', whiteSpace: 'pre-line' }}>
                      {t('how_to_connect_steam_desc') || 'Make sure the game is closed before clicking. After clicking, confirm the game launch in the Steam window.'}
                    </p>
                  </div>
                </div>

                {/* Copy IP Method */}
                <div style={{ display: 'flex', gap: '1rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '1rem' }}>
                  <div style={{ color: 'var(--accent)', marginTop: '0.15rem' }}>
                    <IconCopy size={20} />
                  </div>
                  <div>
                    <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)' }}>
                      {t('how_to_connect_copy_title') || 'Direct Connection (via IP)'}
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.4, color: 'var(--text-muted)', whiteSpace: 'pre-line' }}>
                      {t('how_to_connect_copy_desc') || 'Copy the server IP address, launch Factorio, go to Multiplayer -> Direct connection, and paste the address (Ctrl+V) to join.'}
                    </p>
                  </div>
                </div>

              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}