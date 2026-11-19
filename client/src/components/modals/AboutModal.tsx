import { useCallback, useEffect, useRef, useState } from 'react';
import {
  IconCheck,
  IconCopy,
  IconExternalLink,
  IconSparkles,
} from '@tabler/icons-react';
import { fetchAppHealth } from '../../hooks/useLoginScreen';
import { formatUptimeDuration } from '../../lib/datetimeUtils';
import {
  MATERIAL_SYMBOLS_LICENSE_URL,
  MATERIAL_SYMBOLS_SOURCE_URL,
  MIT_LICENSE_URL,
  NSSM_URL,
  TABLER_ICONS_URL,
} from '../../lib/appIcons';
import { AppIcon } from '../AppIcon';
import { ModalBackdrop } from './ModalBackdrop';
import { webEffectsReduced } from '../../theme/webEffects';
import { useUserWebDisableEffects } from '../../hooks/useUserWebDisableEffects';

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

interface GithubReleaseResponse {
  tag_name?: string;
  html_url?: string;
}

function isNewerVersion(latest: string, current: string): boolean {
  const lParts = latest.split('.').map(Number);
  const cParts = current.split('.').map(Number);
  for (let i = 0; i < Math.max(lParts.length, cParts.length); i++) {
    const lv = lParts[i] || 0;
    const cv = cParts[i] || 0;
    if (lv > cv) return true;
    if (lv < cv) return false;
  }
  return false;
}

export function AboutModal({ open, onClose, t }: AboutModalProps) {
  const effectsDisabled = useUserWebDisableEffects();
  const [version, setVersion] = useState('—');
  const [build, setBuild] = useState('—');
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [releaseUrl, setReleaseUrl] = useState<string | null>(null);
  const [uptime, setUptime] = useState<number | null>(null);
  const [nodeVersion, setNodeVersion] = useState<string | null>(null);
  const [hostOs, setHostOs] = useState<string | null>(null);
  const [isDocker, setIsDocker] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRequestClose = useCallback(() => {
    if (isClosing) return;
    if (effectsDisabled || webEffectsReduced()) {
      onClose();
      return;
    }
    setIsClosing(true);
    closeTimeoutRef.current = setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 520);
  }, [effectsDisabled, isClosing, onClose]);

  const handleCopyDiagnostics = useCallback(async () => {
    const lines = [
      '### Factorio Control Center System Report',
      `- **Version:** ${version}${build && build !== '—' ? ` (build ${build})` : ''}`,
      `- **Status:** ${latestVersion ? t('about_status_update_ready') : t('about_status_nominal')}`,
      `- **Runtime:** ${nodeVersion || 'Node.js'}`,
      `- **Host OS:** ${hostOs || 'Unknown'}${isDocker ? ' (Docker)' : ''}`,
      `- **Uptime:** ${uptime != null ? formatUptimeDuration(uptime) : '—'}`,
      `- **Client:** ${typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown'}`,
    ];
    const text = lines.join('\n');
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      // Ignore clipboard write failures
    }
  }, [build, hostOs, isDocker, latestVersion, nodeVersion, t, uptime, version]);

  useEffect(() => {
    if (!open) {
      setIsClosing(false);
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
    }
  }, [open]);

  const hasUptime = uptime != null;
  useEffect(() => {
    if (!open || !hasUptime) return;
    const interval = setInterval(() => {
      setUptime((prev) => (prev != null ? prev + 1 : prev));
    }, 1000);
    return () => clearInterval(interval);
  }, [open, hasUptime]);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setLatestVersion(null);
      setReleaseUrl(null);
      setUptime(null);
      setNodeVersion(null);
      setHostOs(null);
      setIsDocker(false);
      setCopied(false);
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
        copyTimeoutRef.current = null;
      }
      return;
    }

    let active = true;

    void fetchAppHealth().then((h) => {
      if (!active) return;
      const currentVer = String(h?.version || '—');
      setVersion(currentVer);
      const b = String(h?.build || '').trim();
      setBuild(b || '—');
      if (typeof h?.uptime === 'number') {
        setUptime(h.uptime);
      }
      if (h?.node_version) {
        setNodeVersion(h.node_version);
      }
      if (h?.host_os) {
        setHostOs(h.host_os);
      }
      if (typeof h?.is_docker === 'boolean') {
        setIsDocker(h.is_docker);
      }

      if (currentVer !== '—' && currentVer !== '0.0.0') {
        fetch(
          'https://api.github.com/repos/LouisFahrenheit/Factorio-Control-Center/releases/latest',
        )
          .then((res) =>
            res.ok ? (res.json() as Promise<GithubReleaseResponse>) : null,
          )
          .then((data) => {
            if (!active || !data?.tag_name) return;
            const latest = data.tag_name.replace(/^v/, '');
            if (isNewerVersion(latest, currentVer)) {
              setLatestVersion(latest);
              if (data.html_url) {
                setReleaseUrl(data.html_url);
              }
            }
          })
          .catch(() => {
            // Silently swallow network / rate-limit failures
          });
      }
    });

    return () => {
      active = false;
    };
  }, [open]);

  return (
    <ModalBackdrop
      open={open || isClosing}
      onClose={handleRequestClose}
      id="aboutModalBackdrop"
      backdropClassName={`about-modal-backdrop ${effectsDisabled ? 'about-modal-backdrop--reduced' : ''} ${isClosing ? 'about-modal-backdrop--closing' : ''}`}
    >
      <div
        className={`fu-modal about-modal ${effectsDisabled ? 'about-modal--reduced' : ''} ${isClosing ? 'about-modal--closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="aboutModalTitle"
      >
        {/* Cyber Corner Accents (LoginPage style) */}
        <span
          className="about-modal__corner about-modal__corner--tl"
          aria-hidden="true"
        />
        <span
          className="about-modal__corner about-modal__corner--tr"
          aria-hidden="true"
        />
        <span
          className="about-modal__corner about-modal__corner--bl"
          aria-hidden="true"
        />
        <span
          className="about-modal__corner about-modal__corner--br"
          aria-hidden="true"
        />

        {/* Ambient Portal FX Layers */}
        {!effectsDisabled ? (
          <div className="about-modal__fx" aria-hidden="true">
            <span className="about-modal__aura" />
            <span className="about-modal__grid" />
            <span className="about-modal__scan" />
          </div>
        ) : null}

        {/* Top HUD Header */}
        <div className="about-modal__header" id="aboutModalTitle">
          <div className="about-modal__header-tag-group">
            <span className="about-modal__hud-dot" aria-hidden="true" />
            <span className="about-modal__header-tag">
              SYSTEM INFORMATION // ABOUT
            </span>
          </div>
          <button
            type="button"
            className="about-modal__close"
            id="aboutModalClose"
            onClick={handleRequestClose}
            aria-label={t('close')}
          >
            <AppIcon name="close" size={16} />
          </button>
        </div>

        {/* Body Content */}
        <div className="about-modal__body">
          {/* Brand Hero — Login Screen Style */}
          <section className="about-modal__hero">
            <div
              className="about-modal__brand-headline"
              id="aboutProductName"
              aria-label="Factorio Control Center"
            >
              <span className="about-modal__brand-primary">Factorio</span>
              <span className="about-modal__brand-secondary">
                Control Center
              </span>
            </div>

            {latestVersion ? (
              <a
                className="about-modal__update-pill"
                href={
                  releaseUrl ||
                  'https://github.com/LouisFahrenheit/Factorio-Control-Center/releases'
                }
                target="_blank"
                rel="noopener noreferrer"
              >
                <IconSparkles size={13} stroke={2.2} />
                <span>{t('about_update_available', latestVersion)}</span>
              </a>
            ) : null}
          </section>

          {/* Telemetry Deck — Monospace HUD Rail */}
          <div className="about-modal__telemetry">
            <div className="about-modal__telemetry-head">
              <span className="about-modal__telemetry-head-tag">
                TELEMETRY // SYSTEM METRICS
              </span>
              <span className="about-modal__telemetry-head-line" />
              <button
                type="button"
                className={`about-modal__copy-btn ${copied ? 'about-modal__copy-btn--copied' : ''}`}
                onClick={handleCopyDiagnostics}
                title={t('about_copy_system_info')}
                aria-label={t('about_copy_system_info')}
                id="aboutCopyDiagnosticsBtn"
              >
                {copied ? (
                  <>
                    <IconCheck size={12} stroke={2.4} />
                    <span>{t('about_system_info_copied')}</span>
                  </>
                ) : (
                  <>
                    <IconCopy size={12} stroke={2} />
                    <span>{t('about_copy_system_info')}</span>
                  </>
                )}
              </button>
            </div>

            <div className="about-modal__telemetry-rail">
              {/* Version Slot */}
              <div className="about-modal__telemetry-slot">
                <span className="about-modal__telemetry-label">
                  {t('about_version_label')}
                </span>
                <span className="about-modal__telemetry-val" id="aboutVerLine">
                  {version}
                </span>
              </div>

              {/* Build Slot */}
              <div className="about-modal__telemetry-slot">
                <span className="about-modal__telemetry-label">
                  {t('about_build_label')}
                </span>
                <span
                  className="about-modal__telemetry-val"
                  id="aboutBuildLine"
                >
                  {build}
                </span>
              </div>

              {/* Status Slot */}
              <div className="about-modal__telemetry-slot">
                <span className="about-modal__telemetry-label">
                  {t('about_status_label')}
                </span>
                <span className="about-modal__telemetry-status-pill">
                  <span className="about-modal__hud-dot" aria-hidden="true" />
                  <span>
                    {latestVersion
                      ? t('about_status_update_ready')
                      : t('about_status_nominal')}
                  </span>
                </span>
              </div>

              {/* Uptime Slot */}
              <div className="about-modal__telemetry-slot">
                <span className="about-modal__telemetry-label">
                  {t('about_uptime_label')}
                </span>
                <span
                  className="about-modal__telemetry-val"
                  id="aboutUptimeLine"
                  title={uptime != null ? `${uptime}s` : undefined}
                >
                  {formatUptimeDuration(uptime)}
                </span>
              </div>

              {/* Runtime Slot */}
              <div className="about-modal__telemetry-slot">
                <span className="about-modal__telemetry-label">
                  {t('about_runtime_label')}
                </span>
                <span
                  className="about-modal__telemetry-val"
                  id="aboutRuntimeLine"
                  title={
                    nodeVersion
                      ? `Node.js ${nodeVersion} (${hostOs || 'OS'}${isDocker ? ', Docker' : ''})`
                      : undefined
                  }
                >
                  {nodeVersion ? (
                    <span>
                      {nodeVersion}
                      {hostOs ? (
                        <span className="about-modal__telemetry-sub">
                          /{hostOs.slice(0, 3)}
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    '—'
                  )}
                </span>
              </div>

              {/* GitHub Link Slot */}
              <a
                className="about-modal__telemetry-slot about-modal__telemetry-slot--link"
                href="https://github.com/LouisFahrenheit/Factorio-Control-Center"
                target="_blank"
                rel="noopener noreferrer"
                id="aboutGithubLink"
              >
                <span className="about-modal__telemetry-label">
                  {t('about_github')}
                </span>
                <span className="about-modal__telemetry-link-val">
                  <span>Factorio-Control-Center</span>
                  <IconExternalLink size={13} stroke={2} />
                </span>
              </a>
            </div>
          </div>

          {/* Credits & Licenses Deck */}
          <section className="about-modal__section">
            <div className="about-modal__section-head">
              <span className="about-modal__section-tag">
                {t('about_credits_section')}
              </span>
              <span className="about-modal__section-line" />
            </div>

            <div className="about-modal__credits-grid">
              {/* Factorio & Wube Software (Full Width) */}
              <article className="about-modal__credit-card about-modal__credit-card--full">
                <div className="about-modal__credit-head">
                  <h4 className="about-modal__credit-title">
                    <span className="about-modal__credit-mark" />
                    <span>{t('about_factorio_block_label')}</span>
                  </h4>
                  <span className="about-modal__credit-badge">
                    Wube Software
                  </span>
                </div>
                <div className="about-modal__credit-body">
                  <ul
                    className="about-modal__credit-list"
                    id="aboutFactorioSprites"
                  >
                    <li>{t('about_factorio_assets_map_gen')}</li>
                    <li>{t('about_factorio_assets_sa_badge')}</li>
                  </ul>
                  <div className="about-modal__legal-callout">
                    <span>
                      {t('about_factorio_assets_permission')}
                      <strong>{t('about_factorio_assets_wube_images')}</strong>
                    </span>
                    <span id="aboutLegal">{t('about_trademark_notice')}</span>
                  </div>
                </div>
              </article>

              {/* FCC Application License */}
              <article className="about-modal__credit-card">
                <div className="about-modal__credit-head">
                  <h4 className="about-modal__credit-title">
                    <span className="about-modal__credit-mark" />
                    <span>{t('window_title')}</span>
                  </h4>
                  <span className="about-modal__credit-badge">MIT</span>
                </div>
                <div className="about-modal__credit-body" id="aboutAppLicense">
                  <p style={{ margin: 0 }}>
                    {t('about_app_license_credit_intro')}
                    <a
                      href={MIT_LICENSE_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      MIT License
                    </a>
                    {t('about_app_license_credit_outro')}
                  </p>
                </div>
              </article>

              {/* Material Symbols */}
              <article className="about-modal__credit-card">
                <div className="about-modal__credit-head">
                  <h4 className="about-modal__credit-title">
                    <span className="about-modal__credit-mark" />
                    <span>{t('about_ui_icons_label')}</span>
                  </h4>
                  <span className="about-modal__credit-badge">Apache 2.0</span>
                </div>
                <div className="about-modal__credit-body" id="aboutIconsCredit">
                  <p style={{ margin: 0 }}>
                    {t('about_ui_icons_credit_intro')}
                    <a
                      href={MATERIAL_SYMBOLS_SOURCE_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Material Symbols
                    </a>
                    {t('about_material_icons_credit_suffix')}
                    <a
                      href={MATERIAL_SYMBOLS_LICENSE_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Apache License 2.0
                    </a>
                    {t('about_ui_icons_credit_outro')}
                  </p>
                </div>
              </article>

              {/* Tabler Icons */}
              <article className="about-modal__credit-card">
                <div className="about-modal__credit-head">
                  <h4 className="about-modal__credit-title">
                    <span className="about-modal__credit-mark" />
                    <span>{t('about_tabler_icons_label')}</span>
                  </h4>
                  <span className="about-modal__credit-badge">MIT</span>
                </div>
                <div
                  className="about-modal__credit-body"
                  id="aboutTablerIconsCredit"
                >
                  <p style={{ margin: 0 }}>
                    <a
                      href={TABLER_ICONS_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Tabler Icons
                    </a>
                    {t('about_tabler_icons_credit')}
                  </p>
                </div>
              </article>

              {/* NSSM */}
              <article className="about-modal__credit-card">
                <div className="about-modal__credit-head">
                  <h4 className="about-modal__credit-title">
                    <span className="about-modal__credit-mark" />
                    <span>{t('about_nssm_label')}</span>
                  </h4>
                  <span className="about-modal__credit-badge">
                    Public Domain
                  </span>
                </div>
                <div className="about-modal__credit-body" id="aboutNssmCredit">
                  <p style={{ margin: 0 }}>
                    <a
                      href={NSSM_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      NSSM
                    </a>
                    {t('about_nssm_credit')}
                  </p>
                </div>
              </article>
            </div>
          </section>
        </div>

        {/* Bottom Telemetry Strip Footer */}
        <div className="about-modal__footer">
          <span className="about-modal__footer-status">
            <span>FCC CORE // SYS_OK</span>
          </span>
          <a
            className="about-modal__footer-issue-link"
            href="https://github.com/LouisFahrenheit/Factorio-Control-Center/issues"
            target="_blank"
            rel="noopener noreferrer"
          >
            <IconExternalLink size={12} stroke={2} />
            <span>{t('about_report_issue')}</span>
          </a>
        </div>
      </div>
    </ModalBackdrop>
  );
}
