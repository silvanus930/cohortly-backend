import { button, layout, paragraph, type RenderedEmail } from './layout';

export function gradePostedEmail(
  appName: string,
  firstName: string,
  assignmentTitle: string,
  courseTitle: string,
  score: number,
  maxPoints: number,
  passed: boolean,
  courseUrl: string,
): RenderedEmail {
  const subject = `Your grade for "${assignmentTitle}" is in`;
  const intro = `Hi ${firstName}, your submission for "${assignmentTitle}" in ${courseTitle} has been graded: ${score} of ${maxPoints} points.`;
  const outro = passed
    ? 'Nice work, this assignment is complete.'
    : 'Read the feedback from your instructor and resubmit when you are ready.';
  return {
    subject,
    html: layout(
      appName,
      subject,
      paragraph(intro) + paragraph(outro) + button('Open the course', courseUrl),
    ),
    text: `${intro}\n\n${outro}\n\nOpen the course: ${courseUrl}`,
  };
}

export function certificateIssuedEmail(
  appName: string,
  firstName: string,
  courseTitle: string,
  verifyUrl: string,
): RenderedEmail {
  const subject = `Your ${courseTitle} certificate`;
  const intro = `Congratulations ${firstName}, you completed ${courseTitle}. Your certificate is ready and can be shared with anyone using the link below.`;
  return {
    subject,
    html: layout(appName, subject, paragraph(intro) + button('View certificate', verifyUrl)),
    text: `${intro}\n\n${verifyUrl}`,
  };
}

export function payoutThresholdEmail(
  appName: string,
  partnerName: string,
  amountCents: number,
  currency: string,
  thresholdCents: number,
  dashboardUrl: string,
): RenderedEmail {
  const subject = `${partnerName} reached the payout threshold`;
  const format = (cents: number): string => `${(cents / 100).toFixed(2)} ${currency}`;
  const intro = `${partnerName} has ${format(amountCents)} in unpaid referral commissions, above the ${format(thresholdCents)} payout threshold.`;
  const outro = 'Review the commission ledger and mark the payout as paid once it has been sent.';
  return {
    subject,
    html: layout(
      appName,
      subject,
      paragraph(intro) + paragraph(outro) + button('Open referrals', dashboardUrl),
    ),
    text: `${intro}\n\n${outro}\n\n${dashboardUrl}`,
  };
}
