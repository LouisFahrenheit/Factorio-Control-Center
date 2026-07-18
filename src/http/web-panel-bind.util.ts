import { trimHost, trimPort } from '../common/trim.util';
import type { WebPanelIni } from '../config/fcc-config.service';

export interface WebPanelRuntimeSnapshot {
  listenHost: string;
  bindPort: number;
  tlsEnabled: boolean;
  tlsCertfile: string;
  tlsKeyfile: string;
  tlsKeyPassword: string;
  portMode: string;
}

/** Unix non-root cannot bind ports below 1024 without capabilities. */
export function unixNonRootNoPrivilegedBind(): boolean {
  if (process.platform === 'win32') return false;
  const uid = process.getuid?.();
  return uid !== undefined && uid !== 0;
}

export function webPanelTlsEffective(wp: WebPanelIni): boolean {
  return !!wp.tls_enabled;
}

export function resolveAutoListenPort(wp: WebPanelIni): number {
  const useHigh = unixNonRootNoPrivilegedBind();
  if (webPanelTlsEffective(wp)) return useHigh ? 8443 : 443;
  return useHigh ? 8080 : 80;
}

/** Effective TCP bind port from [web_panel] (port_mode auto vs custom). */
export function resolveBindPort(wp: WebPanelIni): number {
  const mode = String(wp.port_mode || 'custom')
    .trim()
    .toLowerCase();
  if (mode === 'auto') return resolveAutoListenPort(wp);
  return trimPort(wp.listen_port, 8080);
}

export function resolveDisplayPort(wp: WebPanelIni, bindPort: number): number {
  const pub = String(wp.public_port ?? '').trim();
  if (pub) {
    const p = parseInt(pub, 10);
    if (Number.isFinite(p) && p >= 1 && p <= 65535) return p;
  }
  return bindPort;
}

export function resolveDisplayHost(wp: WebPanelIni): string {
  const pub = String(wp.public_host || '').trim();
  if (pub) return pub;
  const host = trimHost(wp.listen_host);
  return host === '0.0.0.0' ? '127.0.0.1' : host;
}

export function captureRuntimeSnapshot(
  wp: WebPanelIni,
): WebPanelRuntimeSnapshot {
  return {
    listenHost: trimHost(wp.listen_host),
    bindPort: resolveBindPort(wp),
    tlsEnabled: webPanelTlsEffective(wp),
    tlsCertfile: String(wp.tls_certfile || '').trim(),
    tlsKeyfile: String(wp.tls_keyfile || '').trim(),
    tlsKeyPassword: String(wp.tls_key_password || ''),
    portMode: String(wp.port_mode || 'custom')
      .trim()
      .toLowerCase(),
  };
}

export function runtimeNeedsRestart(
  prev: WebPanelRuntimeSnapshot,
  wp: WebPanelIni,
): boolean {
  const next = captureRuntimeSnapshot(wp);
  return (
    prev.listenHost !== next.listenHost ||
    prev.bindPort !== next.bindPort ||
    prev.tlsEnabled !== next.tlsEnabled ||
    prev.tlsCertfile !== next.tlsCertfile ||
    prev.tlsKeyfile !== next.tlsKeyfile ||
    prev.tlsKeyPassword !== next.tlsKeyPassword ||
    prev.portMode !== next.portMode
  );
}

export function customBindPortRequiresElevation(
  wp: WebPanelIni,
  bindPort: number,
): boolean {
  const mode = String(wp.port_mode || 'custom')
    .trim()
    .toLowerCase();
  return mode !== 'auto' && unixNonRootNoPrivilegedBind() && bindPort < 1024;
}
