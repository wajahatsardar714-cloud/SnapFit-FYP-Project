import { PAGES } from './site';
import { withLink } from './links';

// Pricing page content. Edit text here -- PricingPage only renders it, in this order.
//
// A paragraph is a string, or an array of strings and inline links
// ({ text, to, live? }) when part of the sentence should link somewhere.
// Each section's `layout` picks how it renders: plans | table | features |
// steps | faq | cta. Its `id` is the anchor the table of contents links to.
//
// Plan prices and limits are not written here: the page reads them from the
// public GET /subscription/plans endpoint and adds them to each plan card.

export const meta = {
  title: 'SnapFit Pricing Plans | AI Clothing Size Estimation',
  description:
    'Explore SnapFit pricing plans for AI clothing size estimation. Find the right plan for your online store and simplify clothing size recommendations.',
  keywords: [
    'AI clothing size estimation pricing',
    'AI size estimation pricing',
    'clothing size recommendation software',
    'AI body measurement software',
    'e-commerce size recommendation',
    'clothing size estimation API',
    'AI sizing solution for online stores',
  ],
};

export const header = {
  title: 'SnapFit Pricing Plans for AI Clothing Size Estimation',
  description:
    'Explore SnapFit pricing plans for AI clothing size estimation. Find the right plan for your online store and simplify clothing size recommendations.',
};

export const intro = [
  withLink('Choosing the right sizing solution can make a difference in how customers shop at your online clothing store. SnapFit offers an AI-powered clothing size estimation and recommendation platform that helps retailers provide personalized sizing guidance through their existing e-commerce websites.', 'AI-powered clothing size estimation and recommendation platform', PAGES.home.to),
  'Our subscription plans are designed to support different business requirements, from smaller online stores to growing retailers and enterprise businesses. With SnapFit, you can introduce photo-based body measurement, product-specific size chart matching, and AI-assisted clothing size recommendations through an API-driven integration.',
  "Whether you operate a Shopify store or a custom e-commerce website, the right plan depends on your store's needs, expected usage, and integration requirements. Explore the SnapFit pricing plans below to understand your options and choose a suitable starting point for your business.",
];

export const tableOfContents = { title: 'Table of contents' };

const PLANS_ANCHOR = '#plans';

export const sections = [
  {
    id: 'plans',
    layout: 'plans',
    eyebrow: 'Three Subscription Tiers',
    title: 'Choose the Right SnapFit Pricing Plan',
    intro: [
      'Every online clothing store has different requirements. A small retailer may need a straightforward sizing solution for a limited product catalog, while a growing business may need greater capacity as more customers use its sizing tool.',
      'SnapFit offers three subscription options: Small, Medium, and Enterprise. These plans give businesses a starting point for evaluating an AI clothing size estimation solution based on their operational needs.',
      'Before subscribing, consider how many customers may use the sizing tool, which product categories you want to support, and whether your website requires a standard or custom integration.',
    ],
    // Shown after a number price from the API ("$29" + priceNote).
    priceNote: '/ month',
    badge: 'Recommended',
    // Muted note under the cards when the prices could not be loaded.
    unavailableNote: 'Current prices and limits could not be loaded. They are shown in your account after you sign up.',
    // `plan` is the id the API uses (src/utils/plans.js); the recommended
    // plan is RECOMMENDED_PLAN there.
    plans: [
      {
        plan: 'small',
        name: 'Small Plan',
        description: [
          'The Small plan is intended for retailers who want to introduce AI clothing size estimation to their online store. It can be a suitable starting point for businesses evaluating photo-based sizing and personalized recommendations as part of their shopping experience.',
          "With SnapFit, the sizing workflow uses customer photo information to estimate supported body measurements and match them with the store's product size charts. This gives shoppers additional guidance when selecting clothing sizes.",
          "Before choosing the Small plan, review its current usage allowance, supported functionality, and integration requirements. Select this plan if its published limits and features match your store's needs.",
          'Best for: Smaller online retailers looking for an entry-level sizing solution.',
          'Get started: Create your SnapFit account and review the available Small plan details.',
        ],
        cta: { label: 'Get started', to: `${PAGES.signup.to}?plan=small` },
      },
      {
        plan: 'medium',
        name: 'Medium Plan',
        description: [
          'The Medium plan is designed for businesses whose sizing requirements may be greater than those of a smaller store. As product catalogs and customer activity grow, retailers may need to review their expected usage and choose a subscription that accommodates their requirements.',
          "SnapFit's API-driven architecture allows supported integrations to connect the sizing service with an online store. The actual capacity, feature availability, and usage limits depend on the current plan specifications.",
          'When comparing the Medium plan with the Small plan, consider the included API allowance, supported product categories, and any differences in service or support.',
          'Best for: Growing online clothing businesses that need a sizing solution suited to their expected activity.',
          'Get started: Compare the published Medium plan features and choose the option that fits your store.',
        ],
        cta: { label: 'Get started', to: `${PAGES.signup.to}?plan=medium` },
      },
      {
        plan: 'enterprise',
        name: 'Enterprise Plan',
        description: [
          'The Enterprise plan is intended for businesses with more extensive integration, operational, or scaling requirements. Larger retailers may need to evaluate their technical environment, product catalog, expected sizing requests, and support needs before selecting a plan.',
          'SnapFit is built around an API-based approach, which can support integration with compatible e-commerce platforms and custom websites. Enterprise customers should review the available integration options and confirm that the service meets their technical requirements.',
          'Before purchasing, discuss any specific requirements that are not covered by the published plan details. This helps establish whether the available service is appropriate for your business.',
          'Best for: Larger retailers and businesses with more demanding integration or usage requirements.',
          'Get started: Review the Enterprise plan details and contact SnapFit for clarification about available options.',
        ],
        cta: { label: 'Get started', to: `${PAGES.signup.to}?plan=enterprise` },
      },
    ],
  },
  {
    id: 'compare',
    layout: 'table',
    eyebrow: 'Side by Side',
    title: 'Compare SnapFit Pricing Plans',
    intro: [
      'Comparing plans side by side makes it easier to identify the option that suits your business. The most important factors include API usage, supported functionality, integration requirements, and the level of service included.',
      "The table below provides a framework for comparing SnapFit's three subscription tiers. Check the current pricing page or account interface for confirmed prices and plan limits before subscribing.",
    ],
    columns: [
      { key: 'feature', label: 'Feature' },
      { key: 'small', label: 'Small' },
      { key: 'medium', label: 'Medium' },
      { key: 'enterprise', label: 'Enterprise' },
    ],
    rows: [
      { feature: 'Intended business size', small: 'Smaller stores', medium: 'Growing stores', enterprise: 'Larger businesses' },
      { feature: 'AI clothing size estimation', small: 'Check plan details', medium: 'Check plan details', enterprise: 'Check plan details' },
      { feature: 'API integration', small: 'Check plan details', medium: 'Check plan details', enterprise: 'Check plan details' },
      { feature: 'Supported product categories', small: 'Check plan details', medium: 'Check plan details', enterprise: 'Check plan details' },
      { feature: 'API usage allowance', small: 'Published plan limit', medium: 'Published plan limit', enterprise: 'Published plan limit' },
      { feature: 'Custom integration requirements', small: 'Confirm compatibility', medium: 'Confirm compatibility', enterprise: 'Discuss requirements' },
      { feature: 'Support options', small: 'Check plan details', medium: 'Check plan details', enterprise: 'Check plan details' },
      { feature: 'Pricing', small: 'See current pricing', medium: 'See current pricing', enterprise: 'See current pricing' },
    ],
  },
  {
    id: 'whats-included',
    layout: 'features',
    columns: 2,
    eyebrow: 'Sizing Workflow',
    title: 'What Is Included in an AI Clothing Size Estimation Solution?',
    intro: [
      'When evaluating AI clothing size estimation pricing, it is important to look beyond the subscription fee. Retailers should understand how the sizing workflow operates and what is required to make it useful on their website.',
      'SnapFit combines photo-based body measurement estimation with product size chart matching. This approach is intended to help customers make more informed size choices while shopping online.',
    ],
    items: [
      {
        icon: 'scan',
        title: 'Photo-Based Body Measurement',
        paragraphs: [
          'SnapFit uses MediaPipe BlazePose to detect relevant body landmarks from a customer photo. The measurement engine processes the available information to estimate supported body measurements.',
          'The quality of the image and the limitations of single-photo estimation can affect the results. Retailers should understand these factors when assessing the service.',
        ],
      },
      {
        icon: 'target',
        title: 'Product-Specific Size Recommendations',
        paragraphs: [
          "A size recommendation is useful when it relates to the product the customer wants to purchase. SnapFit compares estimated measurements with the relevant retailer's configured size chart to identify a suitable size.",
          'Accurate product data is important because sizing standards can differ between brands, garments, and categories.',
        ],
      },
      {
        icon: 'code',
        title: 'E-Commerce API Integration',
        paragraphs: [
          'SnapFit uses an API-driven integration model. After subscribing and obtaining the required credentials, a retailer can connect the service to a compatible website.',
          'The exact setup depends on the e-commerce platform and implementation. Retailers should review the relevant integration documentation before beginning development.',
        ],
      },
      {
        icon: 'shirt',
        title: 'Support for Tops and Bottoms',
        paragraphs: [
          'SnapFit is designed to support top and bottom product categories through the appropriate measurement and size chart configuration.',
          "The measurements used for each category should reflect the garment's sizing requirements and the functionality supported by the implementation.",
        ],
      },
    ],
  },
  {
    id: 'choose-a-plan',
    layout: 'features',
    eyebrow: 'Selection Checklist',
    title: 'How to Choose the Right SnapFit Plan',
    intro: ['The best plan is the one that matches your actual requirements without paying for capacity or features you do not need.'],
    items: [
      {
        icon: 'shirt',
        title: 'Consider Your Store Size',
        paragraphs: [
          'Start by reviewing your product catalog and expected customer activity. A smaller store may have different requirements from a retailer serving a larger customer base across many products.',
          'Store size alone should not determine your choice. Expected usage and the capabilities included in each plan are equally important.',
        ],
      },
      {
        icon: 'gauge',
        title: 'Estimate Your Expected Usage',
        paragraphs: [
          'Consider how many sizing requests your store may receive during a typical month. Promotions, seasonal demand, and product launches can change customer activity.',
          'Compare your estimates with the published API allowance for each plan. If your usage is uncertain, ask SnapFit how limits are calculated and what happens when you reach them.',
        ],
      },
      {
        icon: 'code',
        title: 'Review Your Integration Requirements',
        paragraphs: [
          'Your website platform affects how you implement an API-based sizing tool. A Shopify store and a custom-built e-commerce website may require different integration steps.',
          'Before subscribing, confirm that the relevant platform is supported and identify any additional development work your store may require.',
        ],
      },
      {
        icon: 'listChecks',
        title: 'Check the Available Features',
        paragraphs: [
          "Review each plan's documented features, supported categories, usage limits, and service options. This is particularly important if you need specific integration capabilities or operational support.",
          'A clear understanding of the included functionality helps you avoid unexpected costs and select a plan that suits your workflow.',
        ],
      },
      {
        icon: 'growth',
        title: 'Plan for Future Growth',
        paragraphs: [
          'If you expect your business to grow, consider whether the plan can accommodate increased usage and whether changing plans is straightforward.',
          'Check the actual upgrade process, billing terms, and any usage restrictions before making a long-term decision.',
        ],
      },
    ],
  },
  {
    id: 'how-pricing-works',
    layout: 'steps',
    eyebrow: 'Signup to Launch',
    title: 'How SnapFit Pricing Works',
    intro: ['Getting started with SnapFit involves selecting a subscription and connecting the sizing service to your e-commerce website.'],
    items: [
      {
        title: 'Choose a Subscription Plan',
        paragraphs: [
          'Review the Small, Medium, and Enterprise options. Compare their published prices, usage limits, and features to identify the right plan for your business.',
        ],
      },
      {
        title: 'Create Your SnapFit Account',
        paragraphs: [
          'Register with your business information and complete the required account setup. Make sure your details are accurate so you can manage your subscription and integration.',
        ],
      },
      {
        title: 'Access Your API Credentials',
        paragraphs: [
          'After completing the required subscription steps, access the API credentials provided by SnapFit. Keep any secret keys secure and follow the documented authentication process.',
        ],
      },
      {
        title: 'Integrate SnapFit with Your Website',
        paragraphs: [
          'Connect your store using the supported API workflow. Your development requirements may vary depending on your website platform and the integration components available.',
        ],
      },
      {
        title: 'Configure Product Size Charts',
        paragraphs: [
          'Set up the relevant product categories and size charts so the sizing engine can compare estimated measurements with appropriate product data.',
        ],
      },
      {
        title: 'Test the Customer Experience',
        paragraphs: [
          'Before launching, test the photo upload process, recommendation output, error handling, and product-page button. Confirm that customers receive clear guidance throughout the sizing workflow.',
        ],
      },
    ],
  },
  {
    id: 'why-snapfit',
    layout: 'features',
    eyebrow: 'Retailer Benefits',
    title: 'Why Choose SnapFit for Clothing Size Recommendations?',
    intro: [
      'Online clothing retailers need a practical way to help customers navigate sizing differences. SnapFit is designed to bring AI-assisted sizing into the existing shopping journey instead of requiring customers to rely only on generic size charts.',
    ],
    items: [
      {
        icon: 'click',
        title: 'Make Size Selection More Convenient',
        paragraphs: [
          'A photo-based sizing workflow can provide another way for customers to receive sizing guidance. This may be useful for shoppers who find manual measurements or complex size charts difficult to interpret.',
        ],
      },
      {
        icon: 'table',
        title: "Use Your Store's Size Charts",
        paragraphs: [
          "SnapFit matches estimated body measurements with the retailer's configured product size charts. This helps make the recommendation relevant to the product rather than relying solely on a general size label.",
        ],
      },
      {
        icon: 'code',
        title: 'Integrate with Your Existing Website',
        paragraphs: [
          'The API-driven architecture is designed to support integration without requiring a complete website redevelopment. The actual implementation depends on your platform and the available integration method.',
        ],
      },
      {
        icon: 'userCheck',
        title: 'Support a Personalized Shopping Experience',
        paragraphs: [
          'Customers can receive sizing guidance related to their available measurement information and the product they are viewing. Retailers can use this capability to make the sizing process more informative.',
        ],
      },
      {
        icon: 'listChecks',
        title: 'Start with a Suitable Subscription',
        paragraphs: [
          'The Small, Medium, and Enterprise plans provide options for different business requirements. Comparing the actual features and limits helps you select a suitable plan for your store.',
        ],
      },
    ],
  },
  {
    id: 'faq',
    layout: 'faq',
    eyebrow: 'Pricing Questions',
    title: 'Frequently Asked Questions About SnapFit Pricing',
    items: [
      {
        question: 'How Much Does SnapFit Cost?',
        answer: [
          [
            'SnapFit offers Small, Medium, and Enterprise subscription plans. The price of each plan should be confirmed on the current ',
            { text: 'pricing page', to: PLANS_ANCHOR },
            ', along with its included features, usage allowances, and billing terms.',
          ],
        ],
      },
      {
        question: 'Which SnapFit Plan Should I Choose?',
        answer: [
          'Choose the plan that matches your expected usage, website integration requirements, and required features. Smaller retailers may begin by evaluating the Small plan, while growing and larger businesses should compare the Medium and Enterprise options against their needs.',
        ],
      },
      {
        question: 'Does SnapFit Offer a Free Trial?',
        answer: [
          [
            'Check the current ',
            { text: 'pricing page', to: PLANS_ANCHOR },
            ' or contact SnapFit to confirm whether a free trial or introductory offer is available. Do not assume a trial is included unless it is explicitly offered.',
          ],
        ],
      },
      {
        question: 'Can I Change My Subscription Plan Later?',
        answer: [
          "Plan changes depend on SnapFit's subscription and billing rules. Before subscribing, review the upgrade and downgrade process, effective dates, and any billing adjustments that may apply.",
        ],
      },
      {
        question: 'Does SnapFit Charge Based on API Usage?',
        answer: [
          'API usage allowances and any usage-based charges depend on the published plan terms. Review the current limits and ask how additional usage is handled before choosing a subscription.',
        ],
      },
      {
        question: 'Can I Use SnapFit with Shopify?',
        answer: [
          'SnapFit is designed for API-based e-commerce integration, including Shopify where the required integration is supported. Confirm the available implementation method and any platform-specific requirements before subscribing.',
        ],
      },
      {
        question: 'Can SnapFit Work with a Custom E-Commerce Website?',
        answer: [
          'SnapFit is designed to support custom website integrations through its API-driven architecture. Your developer should review the documentation to confirm compatibility and implementation requirements.',
        ],
      },
      {
        question: 'Does Every Plan Include the Same Features?',
        answer: [
          'Not necessarily. The actual differences between the Small, Medium, and Enterprise plans should be documented in the pricing comparison. Review the current feature list before purchasing.',
        ],
      },
      {
        question: 'Does SnapFit Guarantee the Correct Clothing Size?',
        answer: [
          "No sizing solution should be presented as a guarantee of perfect fit. Recommendations depend on estimated measurements, image quality, the product's size chart, and garment characteristics.",
        ],
      },
      {
        question: 'Is Technical Knowledge Required to Integrate SnapFit?',
        answer: [
          'API integration generally requires following technical setup instructions. The amount of development work depends on the website platform and the integration tools available. Review the documentation or contact SnapFit for guidance.',
        ],
      },
      {
        question: 'How Can I Get Help Choosing a Plan?',
        answer: [
          'Review the available plans and compare their features with your requirements. If you need clarification about API limits, integration compatibility, or Enterprise requirements, contact SnapFit before subscribing.',
        ],
      },
    ],
  },
  {
    id: 'find-your-plan',
    layout: 'prose',
    eyebrow: 'Ready to Start',
    title: 'Find the Right SnapFit Plan for Your Business',
    paragraphs: [
      'Adding AI clothing size estimation to your online store can give customers another source of guidance when choosing what to buy. SnapFit combines photo-based measurement estimation, product size chart matching, and API-driven integration to support a more personalized sizing experience.',
      'The right subscription depends on your expected usage, technical requirements, and the features available in each plan. Compare the Small, Medium, and Enterprise options carefully before making your decision.',
      'Ready to explore SnapFit? Review the available pricing plans, create your account, and take the next step toward introducing AI-powered clothing size recommendations to your online store.',
    ],
  },
];
