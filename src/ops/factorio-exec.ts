import { execFile } from 'child_process';

export function factorioErrorMessage(
  err: Error,
  stdout: string,
  stderr: string,
): string {
  const lines = [
    ...String(stdout || '').split(/\r?\n/),
    ...String(stderr || '').split(/\r?\n/),
  ]
    .map((l) => l.trim())
    .filter(
      (l) =>
        l &&
        !/^Factorio /i.test(l) &&
        !/^Goodbye/i.test(l) &&
        !/Operating system:/i.test(l),
    );
  const errBlock = lines.findIndex((l) =>
    /------------- Error -------------/i.test(l),
  );
  if (errBlock >= 0) {
    const slice = lines.slice(errBlock, errBlock + 8).join('\n');
    if (slice) return slice;
  }
  const tail = lines
    .filter((l) => /error|not found|invalid|failed/i.test(l))
    .slice(-6);
  if (tail.length) return tail.join('\n');
  const generic = String(err.message || '')
    .replace(/^Command failed:\s*/i, '')
    .trim();
  if (generic && !/^C:\\/.test(generic)) return generic;
  return lines.slice(-8).join('\n') || 'factorio_command_failed';
}

export function execFactorio(
  exe: string,
  args: string[],
  cwd: string,
  timeout: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      exe,
      args,
      { cwd, timeout, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          reject(
            new Error(
              factorioErrorMessage(
                err,
                String(stdout || ''),
                String(stderr || ''),
              ),
            ),
          );
          return;
        }
        resolve();
      },
    );
  });
}
