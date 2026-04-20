import { describe, expect, it } from 'vitest';
import {
  getDocumentKeywordsFromLocation,
  getDocumentTitleFromLocation,
} from '../namuwiki';

const loc = (pathname: string, search = ''): Location =>
  ({ pathname, search }) as unknown as Location;

describe('getDocumentTitleFromLocation', () => {
  it('extracts and decodes the document title', () => {
    expect(getDocumentTitleFromLocation(loc('/w/%EC%86%90%ED%9D%A5%EB%AF%BC'))).toBe(
      '손흥민',
    );
  });

  it('strips hash and query', () => {
    expect(getDocumentTitleFromLocation(loc('/w/Foo?rev=1'))).toBe('Foo');
    expect(getDocumentTitleFromLocation(loc('/w/Foo#s-1'))).toBe('Foo');
  });

  it('returns null for non-document paths', () => {
    expect(getDocumentTitleFromLocation(loc('/'))).toBeNull();
    expect(getDocumentTitleFromLocation(loc('/RecentChanges'))).toBeNull();
  });
});

describe('getDocumentKeywordsFromLocation', () => {
  it('returns the primary title when no from= alias', () => {
    expect(
      getDocumentKeywordsFromLocation(loc('/w/%EC%86%90%ED%9D%A5%EB%AF%BC')),
    ).toEqual(['손흥민']);
  });

  it('puts the ?from= alias first, then the primary title', () => {
    expect(
      getDocumentKeywordsFromLocation(
        loc(
          '/w/BIG%20Naughty',
          '?from=' + encodeURIComponent('빅나티'),
        ),
      ),
    ).toEqual(['빅나티', 'BIG Naughty']);
  });

  it('dedupes when alias equals primary title', () => {
    expect(
      getDocumentKeywordsFromLocation(
        loc('/w/Foo', '?from=Foo'),
      ),
    ).toEqual(['Foo']);
  });

  it('returns empty array on non-document paths', () => {
    expect(getDocumentKeywordsFromLocation(loc('/', '?from=bar'))).toEqual(['bar']);
    expect(getDocumentKeywordsFromLocation(loc('/', ''))).toEqual([]);
  });
});
