import { slugify, slugWithSuffix, uniqueSlug } from './slugify';

describe('slugify', () => {
  it('normalises text into url safe slugs', () => {
    expect(slugify('  Intro to  TypeScript!  ')).toBe('intro-to-typescript');
    expect(slugify('Café Décor & Design')).toBe('cafe-decor-design');
    expect(slugify('---')).toBe('item');
  });

  it('truncates long titles without a trailing dash', () => {
    expect(slugify('a'.repeat(50) + ' ' + 'b'.repeat(50), 51)).toBe('a'.repeat(50));
  });

  it('appends a six character suffix', () => {
    expect(slugWithSuffix('course')).toMatch(/^course-[0-9a-f]{6}$/);
  });

  it('returns the plain slug when free and a suffixed one otherwise', async () => {
    await expect(uniqueSlug('Hello World', () => Promise.resolve(false))).resolves.toBe(
      'hello-world',
    );

    const taken = new Set(['hello-world']);
    const slug = await uniqueSlug('Hello World', (candidate) =>
      Promise.resolve(taken.has(candidate)),
    );
    expect(slug).toMatch(/^hello-world-[0-9a-f]{6}$/);
  });

  it('gives up after the configured attempts', async () => {
    await expect(uniqueSlug('x', () => Promise.resolve(true), 2)).rejects.toThrow('unique slug');
  });
});
