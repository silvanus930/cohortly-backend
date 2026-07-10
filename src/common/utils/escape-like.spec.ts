import { containsPattern, escapeLike } from './escape-like';

describe('escapeLike', () => {
  it('escapes percent, underscore and backslash', () => {
    expect(escapeLike('100%_done')).toBe('100\\%\\_done');
    expect(escapeLike('a\\b')).toBe('a\\\\b');
  });

  it('leaves ordinary text untouched', () => {
    expect(escapeLike('plain text')).toBe('plain text');
  });

  it('wraps trimmed input in wildcards', () => {
    expect(containsPattern('  ada ')).toBe('%ada%');
  });
});
