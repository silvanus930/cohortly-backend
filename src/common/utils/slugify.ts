import { randomBytes } from 'node:crypto';

/** Lowercases, strips accents and collapses non alphanumerics into single dashes. */
export function slugify(value: string, maxLength = 80): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return (slug || 'item').slice(0, maxLength).replace(/-+$/, '');
}

/** Appends a short random suffix, used when a slug collides. */
export function slugWithSuffix(base: string): string {
  return `${base}-${randomBytes(3).toString('hex')}`;
}

/**
 * Produces a slug that is unique according to the supplied predicate. The
 * first attempt is the plain slug; collisions get a random suffix.
 */
export async function uniqueSlug(
  value: string,
  exists: (candidate: string) => Promise<boolean>,
  attempts = 5,
): Promise<string> {
  const base = slugify(value);
  if (!(await exists(base))) {
    return base;
  }
  for (let i = 0; i < attempts; i += 1) {
    const candidate = slugWithSuffix(base);
    if (!(await exists(candidate))) {
      return candidate;
    }
  }
  throw new Error(`Could not find a unique slug for "${value}"`);
}
