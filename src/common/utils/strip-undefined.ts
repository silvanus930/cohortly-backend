/** Returns a shallow copy without keys whose value is undefined. */
export function stripUndefined<T extends object>(value: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key of Object.keys(value) as (keyof T)[]) {
    if (value[key] !== undefined) {
      result[key] = value[key];
    }
  }
  return result;
}
