import { contactEmailLink } from './site';

// Legal page content: the Privacy Policy, Terms of Service and Cookie Policy.
// Edit text here -- LegalPage only renders it. Each page is
//   meta         SEO title and description (the description also sits under
//                the H1)
//   title        the H1
//   lastUpdated  the line shown under the H1
//   sections     [{ title, paragraphs }] -- each title is an H2, in order
// A paragraph is a string, or an array of strings and inline links
// ({ text, to }) when part of the sentence should link somewhere.

const LAST_UPDATED = 'Last Updated: October 25, 2026';

export const privacy = {
  meta: {
    title: 'Privacy Policy | SnapFit',
    description:
      'Read the SnapFit Privacy Policy to understand how account information, customer photos, body measurements, and personal data are handled.',
  },
  title: 'SnapFit Privacy Policy',
  lastUpdated: LAST_UPDATED,
  sections: [
    {
      title: 'Introduction',
      paragraphs: [
        'SnapFit respects your privacy and aims to handle personal information responsibly. This Privacy Policy explains how information may be collected, used, stored, and shared when you use our AI-based clothing size estimation and recommendation platform.',
      ],
    },
    {
      title: 'Information We Collect',
      paragraphs: [
        'Depending on how you use SnapFit, information may include account details, business information, subscription records, technical logs, API usage information, uploaded photos, and estimated body measurements.',
      ],
    },
    {
      title: 'How We Use Information',
      paragraphs: [
        'Information may be used to operate SnapFit, provide photo-based measurement estimation, generate clothing size recommendations, manage subscriptions, maintain security, and provide customer support.',
      ],
    },
    {
      title: 'Photos and Measurement Data',
      paragraphs: [
        "Customer photos and estimated measurements are handled according to the platform's actual processing, storage, and retention practices. Users should review the applicable product instructions before submitting photos.",
      ],
    },
    {
      title: 'Data Sharing and Security',
      paragraphs: [
        'Information may be shared with necessary service providers or when required by law. Appropriate security measures should be applied to protect information against unauthorized access or disclosure.',
      ],
    },
    {
      title: 'Your Privacy Choices',
      paragraphs: [
        'Depending on applicable law, you may have rights to access, correct, or request deletion of personal information.',
      ],
    },
    {
      title: 'Contact Us',
      paragraphs: [['For privacy questions or requests, email ', contactEmailLink, '.']],
    },
  ],
};

export const terms = {
  meta: {
    title: 'Terms of Service | SnapFit',
    description:
      'Review the SnapFit Terms of Service covering account use, subscriptions, API integration, AI size recommendations, and service limitations.',
  },
  title: 'SnapFit Terms of Service',
  lastUpdated: LAST_UPDATED,
  sections: [
    {
      title: 'Acceptance of Terms',
      paragraphs: [
        'By accessing or using SnapFit, you agree to comply with these Terms of Service and applicable laws. If you do not agree, do not use the service.',
      ],
    },
    {
      title: 'Our Services',
      paragraphs: [
        'SnapFit provides AI-based clothing size estimation and recommendation functionality for compatible online clothing stores. Features and availability may vary according to your subscription and integration.',
      ],
    },
    {
      title: 'Accounts and Subscriptions',
      paragraphs: [
        'Users must provide accurate registration information and protect their account credentials. Subscription prices, usage limits, billing conditions, and cancellation rules are governed by the applicable plan terms.',
      ],
    },
    {
      title: 'API Usage',
      paragraphs: [
        'Users must protect their API credentials and must not misuse the service, bypass usage limits, or attempt unauthorized access.',
      ],
    },
    {
      title: 'AI Estimates and Limitations',
      paragraphs: [
        'SnapFit uses image-based estimation and product size chart matching to provide sizing guidance. Recommendations are estimates, not guarantees of garment fit or measurement accuracy. Results may depend on image quality, product data, and other factors.',
      ],
    },
    {
      title: 'Service Availability',
      paragraphs: [
        'We may update or modify features when reasonably necessary, subject to applicable law and contractual obligations.',
      ],
    },
    {
      title: 'Contact Us',
      paragraphs: [['For questions about these Terms, email ', contactEmailLink, '.']],
    },
  ],
};

export const cookies = {
  meta: {
    title: 'Cookie Policy | SnapFit',
    description:
      'Learn how SnapFit may use cookies and similar technologies to support account access, website functionality, preferences, and analytics.',
  },
  title: 'SnapFit Cookie Policy',
  lastUpdated: LAST_UPDATED,
  sections: [
    {
      title: 'What Are Cookies?',
      paragraphs: [
        'Cookies are small files stored on your device when you visit a website. Similar technologies may also be used to support website functionality and understand how a service is used.',
      ],
    },
    {
      title: 'How SnapFit May Use Cookies',
      paragraphs: [
        'Depending on the technologies implemented, SnapFit may use cookies for account sessions, authentication, security, user preferences, and website performance. Analytics or advertising cookies should be described here only if they are actually used.',
      ],
    },
    {
      title: 'Managing Cookies',
      paragraphs: [
        'You may be able to manage cookies through your browser settings. Disabling certain cookies may affect features that depend on them.',
        'Where required by applicable law, SnapFit should provide appropriate consent controls for non-essential cookies and similar technologies.',
      ],
    },
    {
      title: 'Third-Party Services',
      paragraphs: [
        'Some integrated services may use their own cookies or tracking technologies. Their use should be disclosed where applicable, based on the services actually implemented on the website.',
      ],
    },
    {
      title: 'Policy Updates',
      paragraphs: [
        'SnapFit may update this policy when its technologies or legal requirements change. The latest version should be published on this page.',
      ],
    },
    {
      title: 'Contact Us',
      paragraphs: [['For questions about this Cookie Policy, email ', contactEmailLink, '.']],
    },
  ],
};
