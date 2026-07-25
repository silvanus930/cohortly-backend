import { button, layout, paragraph, type RenderedEmail } from './layout';

export function organizationInviteEmail(
  appName: string,
  organizationName: string,
  inviterName: string,
  acceptUrl: string,
  expiresInDays: number,
): RenderedEmail {
  const subject = `${inviterName} invited you to ${organizationName} on ${appName}`;
  const intro = `${inviterName} has invited you to join ${organizationName} on ${appName}. Sign in with this email address and accept the invitation to get access to the courses your organization has arranged for you.`;
  const outro = `The invitation expires in ${expiresInDays} days.`;
  return {
    subject,
    html: layout(
      appName,
      subject,
      paragraph(intro) + button('Accept invitation', acceptUrl) + paragraph(outro),
    ),
    text: `${intro}\n\nAccept the invitation: ${acceptUrl}\n\n${outro}`,
  };
}
