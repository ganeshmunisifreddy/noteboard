import { describe, expect, it } from 'vitest';
import { splitMatches } from './highlight';

describe('splitMatches', () => {
  it('splits around every case-insensitive match', () => {
    expect(splitMatches('Buy milk, MILK!', 'milk')).toEqual([
      { text: 'Buy ', match: false },
      { text: 'milk', match: true },
      { text: ', ', match: false },
      { text: 'MILK', match: true },
      { text: '!', match: false },
    ]);
  });

  it('treats the query literally and ignores blank queries', () => {
    expect(splitMatches('c++ and (a)', 'c++')).toEqual([
      { text: 'c++', match: true },
      { text: ' and (a)', match: false },
    ]);
    expect(splitMatches('text', '  ')).toEqual([{ text: 'text', match: false }]);
  });
});
