import {
  linuxAddFactorioUdpRule,
  linuxIsElevated,
} from './linux-firewall.util';
import {
  windowsAddFactorioUdpRule,
  windowsIsElevated,
} from './windows-firewall.util';

export function platformFirewallIsElevated(): boolean {
  if (process.platform === 'win32') return windowsIsElevated();
  if (process.platform === 'linux') return linuxIsElevated();
  return false;
}

export function platformFirewallSupported(): boolean {
  return process.platform === 'win32' || process.platform === 'linux';
}

export async function platformFirewallAddUdpAllow(
  programExe: string,
  port: number,
): Promise<{ ok: boolean; detail: string }> {
  if (process.platform === 'win32')
    return windowsAddFactorioUdpRule(programExe, port);
  if (process.platform === 'linux')
    return linuxAddFactorioUdpRule(programExe, port);
  return { ok: false, detail: 'firewall auto-rule not supported on this OS' };
}
