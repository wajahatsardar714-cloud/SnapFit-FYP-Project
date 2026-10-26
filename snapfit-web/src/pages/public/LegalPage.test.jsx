import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../../App';
import { paragraph } from '../../test/text';

// Each page as the user wrote it: SEO title and description, the H1, every H2
// in order and a sentence from each part of the text.
const PAGES = [
  {
    path: '/privacy',
    title: 'Privacy Policy | SnapFit',
    description:
      'Read the SnapFit Privacy Policy to understand how account information, customer photos, body measurements, and personal data are handled.',
    h1: 'SnapFit Privacy Policy',
    h2s: [
      'Introduction',
      'Information We Collect',
      'How We Use Information',
      'Photos and Measurement Data',
      'Data Sharing and Security',
      'Your Privacy Choices',
      'Contact Us',
    ],
    sentences: [
      'SnapFit respects your privacy and aims to handle personal information responsibly. This Privacy Policy explains how information may be collected, used, stored, and shared when you use our AI-based clothing size estimation and recommendation platform.',
      "Customer photos and estimated measurements are handled according to the platform's actual processing, storage, and retention practices. Users should review the applicable product instructions before submitting photos.",
      'Depending on applicable law, you may have rights to access, correct, or request deletion of personal information.',
    ],
    contact: 'For privacy questions or requests, email wajahatsardar714@gmail.com.',
  },
  {
    path: '/terms',
    title: 'Terms of Service | SnapFit',
    description:
      'Review the SnapFit Terms of Service covering account use, subscriptions, API integration, AI size recommendations, and service limitations.',
    h1: 'SnapFit Terms of Service',
    h2s: [
      'Acceptance of Terms',
      'Our Services',
      'Accounts and Subscriptions',
      'API Usage',
      'AI Estimates and Limitations',
      'Service Availability',
      'Contact Us',
    ],
    sentences: [
      'By accessing or using SnapFit, you agree to comply with these Terms of Service and applicable laws. If you do not agree, do not use the service.',
      'SnapFit uses image-based estimation and product size chart matching to provide sizing guidance. Recommendations are estimates, not guarantees of garment fit or measurement accuracy. Results may depend on image quality, product data, and other factors.',
      'We may update or modify features when reasonably necessary, subject to applicable law and contractual obligations.',
    ],
    contact: 'For questions about these Terms, email wajahatsardar714@gmail.com.',
  },
  {
    path: '/cookies',
    title: 'Cookie Policy | SnapFit',
    description:
      'Learn how SnapFit may use cookies and similar technologies to support account access, website functionality, preferences, and analytics.',
    h1: 'SnapFit Cookie Policy',
    h2s: [
      'What Are Cookies?',
      'How SnapFit May Use Cookies',
      'Managing Cookies',
      'Third-Party Services',
      'Policy Updates',
      'Contact Us',
    ],
    sentences: [
      'Cookies are small files stored on your device when you visit a website. Similar technologies may also be used to support website functionality and understand how a service is used.',
      'You may be able to manage cookies through your browser settings. Disabling certain cookies may affect features that depend on them.',
      'Where required by applicable law, SnapFit should provide appropriate consent controls for non-essential cookies and similar technologies.',
      'SnapFit may update this policy when its technologies or legal requirements change. The latest version should be published on this page.',
    ],
    contact: 'For questions about this Cookie Policy, email wajahatsardar714@gmail.com.',
  },
];

async function renderAt(path) {
  localStorage.clear();
  window.history.pushState({}, '', path);
  render(<App />);
  return screen.findByRole('heading', { level: 1 });
}

describe.each(PAGES)('legal page at $path', (page) => {
  it('sets the SEO title and description', async () => {
    await renderAt(page.path);
    expect(document.title).toBe(page.title);
    expect(document.head.querySelector('meta[name="description"]').getAttribute('content')).toBe(page.description);
  });

  it('opens with the H1, the last-updated date and the description in the navy header', async () => {
    const h1 = await renderAt(page.path);
    expect(h1.textContent).toBe(page.h1);
    const header = screen.getByRole('region', { name: page.h1 });
    expect(header.className).toContain('bg-navy');
    expect(within(header).getByText('Last Updated: October 25, 2026')).toBeTruthy();
    expect(within(header).getByText(page.description)).toBeTruthy();
  });

  it('renders every H2 in order with the text verbatim', async () => {
    await renderAt(page.path);
    const main = screen.getByRole('main');
    expect(within(main).getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(page.h2s);
    for (const sentence of page.sentences) expect(within(main).getByText(paragraph(sentence))).toBeTruthy();
  });

  it('links the contact email without changing the words', async () => {
    await renderAt(page.path);
    const main = screen.getByRole('main');
    const email = within(main).getByRole('link', { name: 'wajahatsardar714@gmail.com' });
    expect(email.getAttribute('href')).toBe('mailto:wajahatsardar714@gmail.com');
    expect(email.parentElement.textContent).toBe(page.contact);
  });
});
