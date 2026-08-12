import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { escapeHtml } from '../mail/templates/layout';

export const CERTIFICATE_TEMPLATE_VERSION = 1;

/** Characters that are easy to read aloud: no 0/O or 1/I confusion. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface CertificateFields {
  appName: string;
  recipientName: string;
  courseTitle: string;
  instructorName: string;
  completedAt: Date;
  code: string;
  verifyUrl: string;
}

let cachedTemplate: string | null = null;

export function loadTemplate(): string {
  if (cachedTemplate === null) {
    cachedTemplate = readFileSync(join(__dirname, 'templates', 'certificate.template.svg'), 'utf8');
  }
  return cachedTemplate;
}

export function generateCertificateCode(): string {
  const bytes = randomBytes(8);
  const chars = Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]);
  return `CHT-${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}`;
}

export function formatCompletionDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Fills the SVG template, escaping every value so names cannot inject markup. */
export function renderCertificateSvg(fields: CertificateFields, template = loadTemplate()): string {
  const replacements: Record<string, string> = {
    APP_NAME: fields.appName.toUpperCase(),
    RECIPIENT: fields.recipientName,
    COURSE: fields.courseTitle,
    COMPLETED_ON: formatCompletionDate(fields.completedAt),
    INSTRUCTOR: fields.instructorName,
    CODE: fields.code,
    VERIFY_URL: fields.verifyUrl,
  };
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (match, key: string) =>
    key in replacements ? escapeHtml(replacements[key]) : match,
  );
}
