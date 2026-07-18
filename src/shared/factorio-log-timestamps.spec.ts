import {
  FactorioLogSessionState,
  isFactorioSessionStartLine,
  liveLogTail,
  reformatFactorioLogTimestamps,
  trimLiveLogRing,
} from './factorio-log-timestamps';

describe('FactorioLogSessionState', () => {
  it('formats tick lines using session anchor', () => {
    const state = new FactorioLogSessionState();
    const start = state.formatLine(
      '0.000 2025-06-27 14:30:00; Factorio 2.0.54 (build 123)',
    );
    expect(isFactorioSessionStartLine(start)).toBe(true);
    expect(state.formatLine('11.943  Checksum for script foo: 1')).toMatch(
      /^2025-06-27 14:30:11\.943 {2}Checksum for script foo: 1$/,
    );
  });
});

describe('trimLiveLogRing', () => {
  it('keeps session anchor when ring overflows', () => {
    const state = new FactorioLogSessionState();
    const anchor = state.formatLine(
      '0.000 2025-06-27 14:30:00; Factorio 2.0.54',
    );
    const ring: string[] = [anchor];
    for (let i = 1; i <= 501; i++) {
      ring.push(state.formatLine(`${i}.000  line ${i}`));
    }
    const trimmed = trimLiveLogRing(ring, state.anchorLine, 500);
    expect(trimmed.length).toBe(500);
    expect(trimmed[0]).toBe(anchor);
  });
});

describe('liveLogTail', () => {
  it('prepends anchor when tail slice lost it', () => {
    const anchor = '2025-06-27 14:30:00.000  Factorio 2.0.54';
    const lines = Array.from({ length: 500 }, (_, i) => `${i}.000  line ${i}`);
    const tail = liveLogTail(lines, anchor, 500);
    expect(tail[0]).toBe(anchor);
    expect(tail.length).toBe(500);
  });
});

describe('reformatFactorioLogTimestamps', () => {
  it('leaves already formatted calendar lines unchanged', () => {
    const line = '2025-06-27 14:30:11.943  Hosting game';
    expect(reformatFactorioLogTimestamps([line])[0]).toBe(line);
  });
});
