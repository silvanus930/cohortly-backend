export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Wraps a body fragment in the shared email chrome. */
export function layout(appName: string, title: string, bodyHtml: string): string {
  return [
    '<!doctype html>',
    '<html><body style="margin:0;padding:24px;background:#f4f5f7;font-family:Helvetica,Arial,sans-serif;color:#1f2933">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">',
    '<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:8px;padding:32px">',
    `<tr><td style="font-size:20px;font-weight:bold;padding-bottom:16px">${escapeHtml(appName)}</td></tr>`,
    `<tr><td style="font-size:18px;padding-bottom:12px">${escapeHtml(title)}</td></tr>`,
    `<tr><td style="font-size:15px;line-height:1.5">${bodyHtml}</td></tr>`,
    '</table></td></tr></table></body></html>',
  ].join('');
}

export function paragraph(text: string): string {
  return `<p style="margin:0 0 12px">${escapeHtml(text)}</p>`;
}

export function button(label: string, href: string): string {
  return `<p style="margin:20px 0"><a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px">${escapeHtml(label)}</a></p>`;
}

export function codeBlock(code: string): string {
  return `<p style="margin:20px 0;font-size:28px;letter-spacing:6px;font-weight:bold">${escapeHtml(code)}</p>`;
}
