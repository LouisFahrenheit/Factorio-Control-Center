import { describe, expect, it } from 'vitest';
import {
  decodeLogHtmlPlainText,
  ensurePreparedLogEntryHtml,
  FenwickHeightIndex,
  findLogHistoryMatches,
  highlightLogHtmlRanges,
  prepareLogHistoryEntries,
} from './logUtils';

describe('logUtils virtualized history search & indexing', () => {
  it('prepares entries, filters RCON quit noise, and lazily caches syntax HTML', () => {
    const entries = prepareLogHistoryEntries(
      [
        '',
        '   ',
        '[multi] /quit sent via rcon',
        '   0.123 Info ServerMultiplayerManager.cpp:814: Matching serverPrompt',
      ],
      true,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].html).toBeNull();

    const first = ensurePreparedLogEntryHtml(entries[0]);
    expect(first.html).toContain('log-syntax-info-kw');
    expect(entries[0].html).toBe(first.html);
    expect(first.plainLower).toBe(
      '   0.123 info servermultiplayermanager.cpp:814: matching serverprompt',
    );
  });

  it('finds matches across multiple lines including across syntax span boundaries and entities', () => {
    const entries = prepareLogHistoryEntries(
      [
        '2026-11-24 14:00:00 Info Server.cpp:10: Ready <ok> & steady',
        '2026-11-24 14:00:01 Warning Check.cpp:20: info server check',
      ],
      true,
    );

    const spanBoundarySearch = findLogHistoryMatches(entries, 'Info Server');
    expect(spanBoundarySearch.matches).toHaveLength(2);
    expect(spanBoundarySearch.matches[0]).toEqual({
      lineIndex: 0,
      rangeIndex: 0,
    });
    expect(spanBoundarySearch.matches[1]).toEqual({
      lineIndex: 1,
      rangeIndex: 0,
    });

    const { html: html0 } = ensurePreparedLogEntryHtml(entries[0]);
    const highlightedCrossSpan = highlightLogHtmlRanges(
      html0,
      spanBoundarySearch.lineRanges.get(0),
      0,
    );
    // Active match is split cleanly across </span><span> without malformed nesting
    expect(highlightedCrossSpan).toContain('data-active-log-match="1"');
    expect(highlightedCrossSpan).toContain('log-search-highlight--active');
    expect(decodeLogHtmlPlainText(highlightedCrossSpan)).toBe(
      decodeLogHtmlPlainText(html0),
    );

    const entitySearch = findLogHistoryMatches(entries, '<ok> & steady');
    expect(entitySearch.matches).toHaveLength(1);
    const highlightedEntities = highlightLogHtmlRanges(
      html0,
      entitySearch.lineRanges.get(0),
      0,
    );
    expect(highlightedEntities).toContain(
      '<mark class="log-search-highlight log-search-highlight--active" data-active-log-match="1">&lt;ok&gt; &amp; steady</mark>',
    );
  });

  it('maintains accurate FenwickHeightIndex prefix offsets and offset-to-index lookup', () => {
    const idx = new FenwickHeightIndex(100, 20);
    expect(idx.totalHeight).toBe(2000);
    expect(idx.getOffsetTop(0)).toBe(0);
    expect(idx.getOffsetTop(10)).toBe(200);
    expect(idx.findIndexAtOffset(0)).toBe(0);
    expect(idx.findIndexAtOffset(199)).toBe(9);
    expect(idx.findIndexAtOffset(200)).toBe(10);

    // Line 5 wraps to 3 lines (60px instead of 20px -> +40px)
    const delta = idx.setHeight(5, 60);
    expect(delta).toBe(40);
    expect(idx.totalHeight).toBe(2040);
    expect(idx.getOffsetTop(5)).toBe(100);
    expect(idx.getOffsetTop(6)).toBe(160);
    expect(idx.findIndexAtOffset(150)).toBe(5);
    expect(idx.findIndexAtOffset(160)).toBe(6);
  });
});
