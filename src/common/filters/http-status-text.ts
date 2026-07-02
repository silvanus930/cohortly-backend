import { HttpStatus } from '@nestjs/common';

/** Converts an HTTP status code into its conventional reason phrase. */
export function httpStatusText(status: number): string {
  const name = HttpStatus[status];
  if (typeof name !== 'string') {
    return 'Error';
  }
  return name
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
