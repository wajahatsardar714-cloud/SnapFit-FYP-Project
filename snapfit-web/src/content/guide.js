import { PAGES, contactEmailLink } from './site';
import { withLink } from './links';

// Guide page content. Edit text here -- GuidePage only renders it, in this order.
//
// A paragraph is a string, or an array of strings and inline links
// ({ text, to, live? }) when part of the sentence should link somewhere.
// Each section's `layout` picks how it renders: prose | steps | cards | faq |
// cta. Its `id` is the anchor the table of contents links to.

// The guide links the Privacy Policy directly: the legal pages ship with it.
const privacyPolicy = { to: PAGES.privacy.to };

export const meta = {
  title: 'SnapFit Guide | Setup, API Integration and AI Sizing',
  description:
    'Learn how to set up SnapFit, integrate its AI clothing size estimation API, configure size charts, troubleshoot issues, and manage your account.',
  keywords: [
    'SnapFit guide',
    'AI clothing size estimation guide',
    'SnapFit API integration',
    'clothing size recommendation setup',
  ],
};

export const header = {
  title: 'SnapFit Guide: Setup, Integration, and AI Clothing Size Estimation',
  description: meta.description,
};

export const intro = [
  'Welcome to the SnapFit Guide. This resource helps online clothing retailers understand how SnapFit works, prepare their store for integration, configure product size charts, and provide AI-assisted clothing size recommendations to customers.',
  withLink('SnapFit is an AI-based size estimation and recommendation platform designed for online clothing stores. It uses a photo-based workflow to estimate supported body measurements and compare them with product size charts.', 'AI-based size estimation and recommendation platform', PAGES.home.to),
  'The platform uses MediaPipe BlazePose for body landmark detection and an API-driven integration model for connecting the sizing service with compatible e-commerce websites. This guide explains the main steps involved in setting up the service and maintaining a useful sizing experience.',
];

export const tableOfContents = { title: 'Table of contents' };

export const sections = [
  {
    id: 'what-is-snapfit',
    layout: 'prose',
    eyebrow: 'Sizing Assistant',
    title: 'What Is SnapFit?',
    paragraphs: [
      'SnapFit helps online clothing retailers offer sizing guidance directly within their shopping experience. Customers can access a Size Estimation button on supported product pages, submit a photo, and receive a recommendation based on estimated body measurements and the relevant product size chart.',
      'Traditional size charts require customers to understand measurements and decide which size matches their body. SnapFit adds an AI-assisted step to help customers make a more informed decision.',
      'The service estimates supported measurements rather than directly observing every body dimension. Its recommendations should be treated as guidance, not a guarantee of perfect garment fit.',
    ],
  },
  {
    id: 'how-it-works',
    layout: 'steps',
    eyebrow: 'Photo to Size',
    title: 'How SnapFit Works',
    items: [
      {
        title: 'Customer Photo Submission',
        paragraphs: [
          'The shopper begins by opening the sizing tool and submitting a photo that meets the stated requirements. Clear instructions help customers understand the expected image quality and positioning.',
        ],
      },
      {
        title: 'Body Landmark Detection',
        paragraphs: [
          'MediaPipe BlazePose identifies relevant body landmarks in the image. These points provide information about visible body positioning and proportions.',
        ],
      },
      {
        title: 'Body Measurement Estimation',
        paragraphs: [
          'SnapFit processes the detected landmarks to estimate supported body measurements. The available outputs depend on the implemented measurement engine and the information that can reasonably be inferred from the image.',
        ],
      },
      {
        title: 'Product Size Chart Matching',
        paragraphs: [
          "The estimated measurements are compared with the retailer's configured size chart for the relevant product category. Accurate chart data is essential for meaningful recommendations.",
        ],
      },
      {
        title: 'Size Recommendation',
        paragraphs: [
          'The sizing engine returns a recommended size and a confidence result, where supported by the implementation. Customers should understand that the result is an estimate and may be affected by image quality, product construction, and personal fit preferences.',
        ],
      },
    ],
  },
  {
    id: 'get-started',
    layout: 'steps',
    eyebrow: 'Store Onboarding',
    title: 'How to Get Started with SnapFit',
    items: [
      {
        title: 'Create an Account and Select a Plan',
        paragraphs: [
          'Register for SnapFit and review the Small, Medium, and Enterprise plans. Choose a plan based on the published features, usage limits, and integration requirements.',
        ],
      },
      {
        title: 'Prepare Your E-Commerce Store',
        paragraphs: [
          'Identify the product pages and categories where you want to provide sizing assistance. Confirm that your product size charts contain accurate and relevant measurements.',
        ],
      },
      {
        title: 'Obtain Your API Credentials',
        paragraphs: [
          'Access the credentials provided for your account and follow the official authentication instructions. Keep secret keys secure and avoid exposing them in browser code or public repositories.',
        ],
      },
      {
        title: 'Integrate the Sizing Workflow',
        paragraphs: [
          'Connect your website to SnapFit using the documented API. The implementation may differ between Shopify and a custom-built website, so confirm the relevant integration requirements before development.',
        ],
      },
      {
        title: 'Add the Size Estimation Button',
        paragraphs: [
          'Place the button on the appropriate product pages. Ensure that the correct product and size chart are associated with each sizing request.',
        ],
      },
      {
        title: 'Test the Complete Experience',
        paragraphs: [
          'Use representative test cases to check photo submission, error handling, estimated measurements, size chart matching, and recommendation display. Confirm that the process works on desktop and mobile devices.',
        ],
      },
    ],
  },
  {
    id: 'api-integration',
    layout: 'prose',
    eyebrow: 'Developer Handbook',
    title: 'SnapFit API Integration Guide',
    paragraphs: [
      'SnapFit is designed around an API-driven architecture, which allows compatible websites to connect to its sizing service.',
      'Before beginning, review the official API documentation for supported endpoints, authentication requirements, request formats, response structures, and applicable usage limits.',
      'Your integration should handle unsuccessful requests appropriately. For example, an invalid image, a missing product size chart, or a failed API request should not leave customers with a misleading recommendation.',
      'Developers should also protect credentials, validate incoming information, and avoid logging customer photos or sensitive data unnecessarily.',
      'If you use Shopify, confirm which integration method is supported for your store. For custom websites, the implementation will depend on your technology stack and the API capabilities available.',
    ],
  },
  {
    id: 'size-charts',
    layout: 'prose',
    eyebrow: 'Chart Accuracy',
    title: 'Configure Product Categories and Size Charts',
    paragraphs: [
      'Product size charts are an important part of the SnapFit recommendation process. A sizing engine cannot provide useful product-specific guidance if the underlying chart is incorrect or does not match the garment.',
      'Start by organizing products into supported categories, such as tops and bottoms. Make sure each category uses the relevant measurements and size labels.',
      'Review the measurements for every supported product or size chart. Check that units are consistent and that the sizing data reflects the actual garments being sold.',
      'When product specifications change, update the associated size charts. Regular checks can help prevent outdated data from producing unsuitable recommendations.',
    ],
  },
  {
    id: 'photo-requirements',
    layout: 'prose',
    eyebrow: 'Image Quality',
    title: 'Photo Requirements and Measurement Limitations',
    paragraphs: [
      'Photo quality can affect body landmark detection and measurement estimates. Customers should receive clear instructions about image positioning, visibility, and any other requirements defined by the implemented system.',
      'Images with poor lighting, unusual camera angles, obstructed body landmarks, or loose clothing may provide less useful information.',
      'A single photo also has inherent limitations. Some dimensions are not directly visible, and estimating them requires assumptions and a validated measurement method.',
      'SnapFit should communicate uncertainty when the available information is insufficient. Retailers should avoid describing estimates as exact measurements or promising that every recommendation will produce a perfect fit.',
    ],
  },
  {
    id: 'privacy',
    layout: 'prose',
    eyebrow: 'Customer Photo Care',
    title: 'Privacy and Responsible Data Handling',
    paragraphs: [
      'Customer photos and body-related estimates should be handled carefully. Retailers should explain why the sizing tool requests a photo and how the information is used.',
      [
        "Review SnapFit's ",
        { text: 'Privacy Policy', ...privacyPolicy },
        ' for the actual data collection, processing, retention, and deletion practices. Do not assume that images are automatically deleted or that a particular security certification applies unless the service explicitly supports it.',
      ],
      'Retailers should also ensure that their own customer notices and consent practices are appropriate for their business and applicable legal requirements.',
    ],
  },
  {
    id: 'troubleshooting',
    layout: 'cards',
    eyebrow: 'Integration Fixes',
    title: 'Troubleshooting Common Issues',
    items: [
      {
        icon: 'click',
        title: 'The Size Estimation Button Does Not Appear',
        paragraphs: [
          'Check that the integration has been configured for the relevant product page and category. Review the implementation and any platform-specific requirements.',
        ],
      },
      {
        icon: 'code',
        title: 'The API Request Fails',
        paragraphs: [
          'Verify the API credentials, request format, authentication method, and response handling against the official documentation. Check error messages without exposing secret keys.',
        ],
      },
      {
        icon: 'scan',
        title: 'A Photo Cannot Be Processed',
        paragraphs: [
          "Confirm that the image meets the tool's requirements. Provide clear instructions and a suitable recovery message when the system cannot generate a usable estimate.",
        ],
      },
      {
        icon: 'ruler',
        title: 'The Recommended Size Seems Incorrect',
        paragraphs: [
          'Check the product size chart, measurement units, category configuration, and quality of the submitted image. Recommendations depend on both estimated measurements and accurate product data.',
        ],
      },
      {
        icon: 'listChecks',
        title: 'Integration Works on Desktop but Not Mobile',
        paragraphs: [
          'Test the button, upload interface, and results display on supported mobile browsers. Check responsive layout, file upload handling, and network-related failures.',
        ],
      },
    ],
  },
  {
    id: 'faq',
    layout: 'faq',
    eyebrow: 'Retailer Questions',
    title: 'Frequently Asked Questions',
    items: [
      {
        question: 'Does SnapFit Work with Shopify?',
        answer: [
          'SnapFit is designed for integration with compatible e-commerce platforms, including Shopify where the required integration is supported. Consult the official integration instructions for the current setup method.',
        ],
      },
      {
        question: 'Can I Use SnapFit on a Custom Website?',
        answer: [
          'SnapFit is designed to support API-based custom integrations. Your developer should review the documentation to confirm compatibility and implementation requirements.',
        ],
      },
      {
        question: 'Does SnapFit Guarantee the Correct Size?',
        answer: [
          'No. Recommendations are estimates based on available image information and configured product size charts. Garment design, material, image quality, and personal preferences can affect fit.',
        ],
      },
      {
        question: 'Where Can I Get Help?',
        answer: [
          [
            'For questions about registration, subscriptions, or integration, contact ',
            contactEmailLink,
            '. Do not send passwords or secret API credentials in support messages.',
          ],
        ],
      },
    ],
  },
  {
    id: 'start-using-snapfit',
    layout: 'prose',
    eyebrow: 'Ready to Launch',
    title: 'Start Using SnapFit',
    paragraphs: [
      'SnapFit brings photo-based measurement estimation and product size chart matching into the online shopping journey. With careful integration, accurate product data, and clear customer instructions, retailers can offer additional sizing guidance directly on supported product pages.',
      [
        'Use this guide alongside the official API documentation, ',
        { text: 'Pricing page', ...PAGES.pricing },
        ', and ',
        { text: 'legal policies', ...privacyPolicy },
        ' to prepare your store and maintain a reliable sizing experience.',
      ],
    ],
  },
];
