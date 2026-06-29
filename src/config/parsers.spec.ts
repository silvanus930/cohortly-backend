import { parseBoolean, parseFloatValue, parseInteger, parseList } from './parsers';

describe('config parsers', () => {
  describe('parseBoolean', () => {
    it.each(['1', 'true', 'TRUE', 'yes', 'on', ' On '])('treats %p as true', (value) => {
      expect(parseBoolean(value)).toBe(true);
    });

    it.each(['0', 'false', 'no', 'off', 'random'])('treats %p as false', (value) => {
      expect(parseBoolean(value)).toBe(false);
    });

    it('falls back when the value is missing', () => {
      expect(parseBoolean(undefined, true)).toBe(true);
      expect(parseBoolean('', false)).toBe(false);
    });
  });

  describe('parseInteger', () => {
    it('parses base ten integers', () => {
      expect(parseInteger('42', 0)).toBe(42);
      expect(parseInteger('007', 0)).toBe(7);
    });

    it('returns the fallback for empty or invalid input', () => {
      expect(parseInteger(undefined, 9)).toBe(9);
      expect(parseInteger('abc', 9)).toBe(9);
    });
  });

  describe('parseFloatValue', () => {
    it('parses decimals and keeps the fallback for junk', () => {
      expect(parseFloatValue('0.15', 1)).toBe(0.15);
      expect(parseFloatValue('nope', 1)).toBe(1);
    });
  });

  describe('parseList', () => {
    it('splits on commas and trims whitespace', () => {
      expect(parseList(' a, b ,c,, ')).toEqual(['a', 'b', 'c']);
    });

    it('uses the fallback for blank input', () => {
      expect(parseList(undefined, ['*'])).toEqual(['*']);
      expect(parseList('   ', ['*'])).toEqual(['*']);
    });
  });
});
