import { codeBlock, layout, paragraph, type RenderedEmail } from './layout';

export function welcomeEmail(appName: string, firstName: string, appUrl: string): RenderedEmail {
  const subject = `Welcome to ${appName}`;
  const lines = [
    `Hi ${firstName}, your account is ready.`,
    'Browse the catalog, join a cohort and start learning with a group that keeps you accountable.',
    `You can sign in any time at ${appUrl}.`,
  ];
  return {
    subject,
    html: layout(appName, subject, lines.map(paragraph).join('')),
    text: lines.join('\n\n'),
  };
}

export function passwordResetEmail(
  appName: string,
  firstName: string,
  code: string,
  ttlMinutes: number,
): RenderedEmail {
  const subject = `${appName} password reset code`;
  const intro = `Hi ${firstName}, use the code below to reset your password. It expires in ${ttlMinutes} minutes.`;
  const outro = 'If you did not request a reset you can safely ignore this email.';
  return {
    subject,
    html: layout(appName, subject, paragraph(intro) + codeBlock(code) + paragraph(outro)),
    text: `${intro}\n\n${code}\n\n${outro}`,
  };
}
