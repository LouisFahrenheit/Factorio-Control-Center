import { Logger } from '@nestjs/common';

interface CapturedLog {
  level: string;
  message: unknown;
  optionalParams: unknown[];
}

const capturedLogs: CapturedLog[] = [];

function formatUnknown(val: unknown): string {
  if (val instanceof Error) {
    return val.stack ?? val.message;
  }
  if (typeof val === 'string') {
    return val;
  }
  if (
    typeof val === 'number' ||
    typeof val === 'boolean' ||
    typeof val === 'bigint' ||
    typeof val === 'symbol'
  ) {
    return val.toString();
  }
  if (val === undefined) {
    return 'undefined';
  }
  if (val === null) {
    return 'null';
  }
  try {
    return JSON.stringify(val);
  } catch {
    return '[Unserializable object]';
  }
}

function captureLog(
  level: string,
  message: unknown,
  ...optionalParams: unknown[]
): void {
  capturedLogs.push({ level, message, optionalParams });
}

beforeEach(() => {
  capturedLogs.length = 0;

  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
  jest.spyOn(Logger.prototype, 'verbose').mockImplementation(() => {});
  jest
    .spyOn(Logger.prototype, 'error')
    .mockImplementation((msg: unknown, ...params: unknown[]) => {
      captureLog('error', msg, ...params);
    });
  jest
    .spyOn(Logger.prototype, 'fatal')
    .mockImplementation((msg: unknown, ...params: unknown[]) => {
      captureLog('fatal', msg, ...params);
    });

  jest.spyOn(Logger, 'log').mockImplementation(() => {});
  jest.spyOn(Logger, 'warn').mockImplementation(() => {});
  jest.spyOn(Logger, 'debug').mockImplementation(() => {});
  jest.spyOn(Logger, 'verbose').mockImplementation(() => {});
  jest
    .spyOn(Logger, 'error')
    .mockImplementation((msg: unknown, ...params: unknown[]) => {
      captureLog('error', msg, ...params);
    });
  jest
    .spyOn(Logger, 'fatal')
    .mockImplementation((msg: unknown, ...params: unknown[]) => {
      captureLog('fatal', msg, ...params);
    });
});

afterEach(() => {
  let hasFailed = false;

  const symbol = Object.getOwnPropertySymbols(globalThis).find(
    (s) => s.toString() === 'Symbol(JEST_STATE_SYMBOL)',
  );
  if (symbol) {
    const circusState = (globalThis as Record<symbol, unknown>)[
      symbol
    ] as Record<string, unknown>;
    const currentTest = circusState.currentlyRunningTest as
      | { errors?: unknown[] }
      | undefined;
    if (currentTest?.errors && currentTest.errors.length > 0) {
      hasFailed = true;
    }
    const unhandledErrors = circusState.unhandledErrors as
      | unknown[]
      | undefined;
    if (unhandledErrors && unhandledErrors.length > 0) {
      hasFailed = true;
    }
  }

  const state = expect.getState();
  if (
    typeof state.assertionCalls === 'number' &&
    typeof state.numPassingAsserts === 'number' &&
    state.assertionCalls !== state.numPassingAsserts
  ) {
    hasFailed = true;
  }

  if (hasFailed && capturedLogs.length > 0) {
    const testName = state.currentTestName ?? 'Unknown test';
    process.stderr.write(
      `\n[Jest Setup] Captured logger output for failed test "${testName}":\n`,
    );
    for (const log of capturedLogs) {
      const parts = [log.message, ...log.optionalParams].map(formatUnknown);
      process.stderr.write(
        `  [${log.level.toUpperCase()}] ${parts.join(' ')}\n`,
      );
    }
    process.stderr.write('\n');
  }

  capturedLogs.length = 0;
});
