/** Escapes the wildcard characters of a SQL LIKE pattern so user input matches literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

export function containsPattern(value: string): string {
  return `%${escapeLike(value.trim())}%`;
}
