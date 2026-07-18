import { execFile, execFileSync } from 'child_process';
import { promisify } from 'util';
import { resolve } from 'path';

const execFileAsync = promisify(execFile);

const EXEC_OPTS = {
  windowsHide: true,
  timeout: 90_000,
  maxBuffer: 4 * 1024 * 1024,
};

export function windowsIsElevated(): boolean {
  if (process.platform !== 'win32') return false;
  try {
    execFileSync('net', ['session'], { stdio: 'ignore', windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

export async function windowsAdvfirewallRuleExists(
  ruleName: string,
): Promise<boolean> {
  try {
    const { stdout, stderr } = await execFileAsync(
      'netsh',
      ['advfirewall', 'firewall', 'show', 'rule', `name=${ruleName}`],
      { ...EXEC_OPTS, timeout: 45_000 },
    );
    const out = `${stdout || ''}${stderr || ''}`.toLowerCase();
    if (out.includes('no rules match')) return false;
    return !!out.trim();
  } catch {
    return false;
  }
}

export async function windowsAddFactorioUdpRule(
  programExe: string,
  port: number,
): Promise<{ ok: boolean; detail: string }> {
  const prog = resolve(String(programExe || '').trim());
  if (port < 1 || port > 65535) return { ok: false, detail: 'invalid port' };

  const ruleName = `FCC-Server-UDP-${port}`;
  if (await windowsAdvfirewallRuleExists(ruleName))
    return { ok: true, detail: '' };

  const args = [
    'advfirewall',
    'firewall',
    'add',
    'rule',
    `name=${ruleName}`,
    'dir=in',
    'action=allow',
    'protocol=UDP',
    `localport=${port}`,
    `program=${prog}`,
  ];
  try {
    const { stdout, stderr } = await execFileAsync('netsh', args, EXEC_OPTS);
    const combined = `${stdout || ''}${stderr || ''}`.trim();
    if (await windowsAdvfirewallRuleExists(ruleName))
      return { ok: true, detail: '' };
    const low = combined.toLowerCase();
    if (
      low.includes('already exists') ||
      low.includes('already been created') ||
      low.includes('duplicate')
    ) {
      return { ok: true, detail: '' };
    }
    return { ok: false, detail: combined || 'netsh failed' };
  } catch (e) {
    if (await windowsAdvfirewallRuleExists(ruleName))
      return { ok: true, detail: '' };
    const msg = e instanceof Error ? e.message : String(e);
    if (/timeout/i.test(msg)) return { ok: false, detail: 'timeout' };
    return { ok: false, detail: msg };
  }
}
