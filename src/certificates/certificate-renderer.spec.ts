import {
  formatCompletionDate,
  generateCertificateCode,
  loadTemplate,
  renderCertificateSvg,
} from './certificate-renderer';

describe('certificate renderer', () => {
  const fields = {
    appName: 'Cohortly',
    recipientName: 'Ada <Lovelace>',
    courseTitle: 'Full Stack & TypeScript',
    instructorName: 'Ivo Teach',
    completedAt: new Date('2026-03-15T10:00:00Z'),
    code: 'CHT-AB23-CD45',
    verifyUrl: 'https://app.test/certificates/verify/CHT-AB23-CD45',
  };

  it('generates codes from the readable alphabet', () => {
    for (let i = 0; i < 20; i += 1) {
      expect(generateCertificateCode()).toMatch(/^CHT-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    }
    expect(new Set(Array.from({ length: 50 }, generateCertificateCode)).size).toBeGreaterThan(45);
  });

  it('formats completion dates in UTC', () => {
    expect(formatCompletionDate(fields.completedAt)).toBe('March 15, 2026');
  });

  it('loads the bundled template and fills every placeholder with escaping', () => {
    const svg = renderCertificateSvg(fields);

    expect(loadTemplate()).toContain('{{RECIPIENT}}');
    expect(svg).not.toContain('{{');
    expect(svg).toContain('Ada &lt;Lovelace&gt;');
    expect(svg).toContain('Full Stack &amp; TypeScript');
    expect(svg).toContain('COHORTLY');
    expect(svg).toContain('CHT-AB23-CD45');
    expect(svg).toContain('March 15, 2026');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(renderCertificateSvg(fields, '<svg>{{UNKNOWN}} {{CODE}}</svg>')).toBe(
      '<svg>{{UNKNOWN}} CHT-AB23-CD45</svg>',
    );
  });
});
