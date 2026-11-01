import { describe, it, expect } from 'vitest';
import { localizeApiError } from './apiErrorUtils';

describe('apiErrorUtils', () => {
  const dummyT = (key: string) => {
    const translations: Record<string, string> = {
      api_error_session_expired: 'Session expired or authorization required. Please sign in again.',
      cannot_start_no_save: 'Cannot start without save',
    };
    return translations[key] || key;
  };

  it('maps "Missing bearer token" to localized session expired message', () => {
    expect(localizeApiError('Missing bearer token', dummyT)).toBe(
      'Session expired or authorization required. Please sign in again.',
    );
  });

  it('maps "Invalid token" and "session_expired" to session expired message', () => {
    expect(localizeApiError('Invalid token', dummyT)).toBe(
      'Session expired or authorization required. Please sign in again.',
    );
    expect(localizeApiError('session_expired', dummyT)).toBe(
      'Session expired or authorization required. Please sign in again.',
    );
    expect(localizeApiError('unauthorized', dummyT)).toBe(
      'Session expired or authorization required. Please sign in again.',
    );
  });

  it('maps other known aliases', () => {
    expect(localizeApiError('no_saves', dummyT)).toBe('Cannot start without save');
  });

  it('returns raw key when translation is missing', () => {
    expect(localizeApiError('unknown_error_key', dummyT)).toBe('unknown_error_key');
  });

  it('returns empty string for empty input', () => {
    expect(localizeApiError('', dummyT)).toBe('');
  });
});
