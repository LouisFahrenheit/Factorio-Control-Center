import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const EXEC_OPTS = { timeout: 90_000, maxBuffer: 4 * 1024 * 1024 };

export function linuxIsElevated(): boolean {
  try {
    return typeof process.getuid === 'function' && process.getuid() === 0;
  } catch {
    return false;
  }
}

async function iptablesBin(): Promise<string | null> {
  for (const bin of ['iptables', '/sbin/iptables', '/usr/sbin/iptables']) {
    try {
      await execFileAsync(bin, ['--version'], {
        ...EXEC_OPTS,
        timeout: 10_000,
      });
      return bin;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function linuxUdpRuleExists(
  port: number,
  iptables: string,
): Promise<boolean> {
  try {
    await execFileAsync(
      iptables,
      [
        '-w',
        '15',
        '-C',
        'INPUT',
        '-p',
        'udp',
        '--dport',
        String(port),
        '-j',
        'ACCEPT',
      ],
      { ...EXEC_OPTS, timeout: 45_000 },
    );
    return true;
  } catch {
    return false;
  }
}

export async function linuxAddFactorioUdpRule(
  _programExe: string,
  port: number,
): Promise<{ ok: boolean; detail: string }> {
  if (port < 1 || port > 65535) return { ok: false, detail: 'invalid port' };
  const iptables = await iptablesBin();
  if (!iptables) return { ok: false, detail: 'iptables not found in PATH' };

  if (await linuxUdpRuleExists(port, iptables)) return { ok: true, detail: '' };

  try {
    const { stdout, stderr } = await execFileAsync(
      iptables,
      [
        '-w',
        '15',
        '-I',
        'INPUT',
        '1',
        '-p',
        'udp',
        '--dport',
        String(port),
        '-j',
        'ACCEPT',
      ],
      EXEC_OPTS,
    );
    const combined = `${stdout || ''}${stderr || ''}`.trim();
    if (await linuxUdpRuleExists(port, iptables))
      return { ok: true, detail: '' };
    const low = combined.toLowerCase();
    if (low.includes('already exists') || low.includes('file exists'))
      return { ok: true, detail: '' };
    return { ok: false, detail: combined || 'iptables failed' };
  } catch (e) {
    if (await linuxUdpRuleExists(port, iptables))
      return { ok: true, detail: '' };
    const msg = e instanceof Error ? e.message : String(e);
    if (/timeout/i.test(msg)) return { ok: false, detail: 'timeout' };
    return { ok: false, detail: msg };
  }
}
