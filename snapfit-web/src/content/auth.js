import { PAGES, contactEmailLink as supportEmail } from './site';
import { withLink } from './links';

// Login and register page content. Edit text here -- the content pages only
// render it, in this order: the H1, the Log In / Sign Up buttons, the intro,
// the account section, then `sections`. The buttons open the bare form
// screens (signIn, signUp at the end).
//
// A paragraph is a string, or an array of strings and inline links
// ({ text, to, live? }) when part of the sentence should link somewhere.
// Each section's `layout` picks how it renders: prose | steps | cards | faq |
// cta (see AuthShell).

const pricingPage = { text: 'Pricing page', ...PAGES.pricing };
// The auth pages link the legal pages directly: they ship together.
const privacyPolicy = { text: 'Privacy Policy', to: PAGES.privacy.to };
const termsOfService = { text: 'Terms of Service', to: PAGES.terms.to };

export const login = {
  meta: {
    title: 'Log In to SnapFit | AI Clothing Size Estimation',
    description:
      'Log in to your SnapFit account to manage your subscription, access your sizing integration, and continue setting up your online store.',
  },
  title: 'Log In to Your SnapFit Account',
  intro: [
    withLink('Welcome back to SnapFit. Log in to access your account and continue managing your AI clothing size estimation setup.', 'AI clothing size estimation', PAGES.home.to),
    'SnapFit helps online clothing retailers introduce photo-based body measurement estimation and product-specific size recommendations into their e-commerce websites. Through its API-driven approach, the platform is designed to connect sizing assistance with the existing product shopping experience.',
    "Whether you are configuring your integration, reviewing your subscription, or maintaining your store's sizing workflow, your account is the starting point for accessing the features available to you.",
  ],
  formSection: {
    id: 'access-account',
    eyebrow: 'Merchant Sign-In',
    title: 'Access Your SnapFit Account',
    intro: ['Enter the email address and password associated with your registered account.'],
    notes: [
      'Make sure you use the correct email address and enter your password carefully. If you use a password manager, confirm that it has selected the credentials associated with your SnapFit account.',
      'For security, avoid sharing your password with other people. Use a unique password that you do not use for unrelated websites.',
    ],
  },
  // Buttons right under the H1 (no form here): they open the bare form screens.
  actions: [
    { label: 'Log In', to: PAGES.signin.to },
    { label: 'Sign Up', to: PAGES.signup.to, variant: 'outline' },
  ],
  sections: [
    {
      id: 'manage-setup',
      layout: 'cards',
      columns: 2,
      eyebrow: 'After Signing In',
      title: 'Manage Your SnapFit Setup',
      intro: ['After signing in, use the available account features to manage your subscription and continue the setup process.'],
      items: [
        {
          icon: 'gauge',
          title: 'Review Your Subscription',
          paragraphs: [
            'Check the plan associated with your account and review its available features and usage limits. SnapFit offers Small, Medium, and Enterprise subscription options, subject to the current plan terms.',
          ],
        },
        {
          icon: 'code',
          title: 'Access Your Integration Information',
          paragraphs: [
            'Use the available account interface to access the integration information provided by SnapFit. Keep secret API credentials secure and follow the official documentation when connecting your website.',
          ],
        },
        {
          icon: 'table',
          title: 'Configure Your Store',
          paragraphs: [
            "Prepare the product categories and size charts required for your sizing workflow. Accurate product information is important because the recommendation engine compares estimated measurements with the retailer's configured sizing data.",
          ],
        },
        {
          icon: 'listChecks',
          title: 'Maintain Your Sizing Experience',
          paragraphs: [
            'Test your integration when you change relevant product settings or website components. Confirm that the Size Estimation button, photo submission workflow, and recommendation display continue to work correctly.',
          ],
        },
      ],
    },
    {
      id: 'forgot-password',
      layout: 'prose',
      eyebrow: 'Password Recovery',
      title: 'Forgot Your Password?',
      paragraphs: [
        'If you cannot remember your password, select the password recovery option on the login form, if available. Follow the instructions provided through the account recovery process.',
        'Use the email address associated with your account and check your inbox for any recovery instructions. If you do not receive an expected message, check your spam folder and verify that you entered the correct address.',
        'Never share a password reset link or verification code with someone you do not trust.',
      ],
    },
    {
      id: 'troubleshooting',
      layout: 'cards',
      columns: 2,
      eyebrow: 'Common Access Issues',
      title: 'Troubleshooting Login Problems',
      items: [
        {
          icon: 'userCheck',
          title: 'Incorrect Email or Password',
          paragraphs: [
            'Check your spelling, capitalization, and saved credentials. If you recently changed your password, make sure you are using the updated version.',
          ],
        },
        {
          icon: 'help',
          title: 'Account Access Issues',
          paragraphs: [
            'If you cannot access your account after checking your credentials, use the available recovery process or contact SnapFit support.',
          ],
        },
        {
          icon: 'code',
          title: 'Integration Problems',
          paragraphs: [
            'If you can log in but your website integration is not working, review the integration documentation. Check your API configuration, authentication method, and implementation for errors.',
          ],
        },
        {
          icon: 'gauge',
          title: 'Subscription Questions',
          paragraphs: [
            'For questions about plan details, billing, or account access, contact SnapFit using the support email listed below.',
          ],
        },
      ],
    },
    {
      id: 'faq',
      layout: 'faq',
      eyebrow: 'Login Questions',
      title: 'Frequently Asked Questions',
      items: [
        {
          question: 'How Do I Log In to SnapFit?',
          answer: ['Open the SnapFit login page, enter your registered email address and password, and submit the form.'],
        },
        {
          question: 'What If I Forget My Password?',
          answer: ['Use the password recovery option if available and follow the instructions to regain access.'],
        },
        {
          question: 'Can I Change My Subscription After Logging In?',
          answer: [
            "Plan changes depend on SnapFit's subscription rules. Review the current billing terms or contact support for assistance.",
          ],
        },
        {
          question: 'Where Can I Find My API Credentials?',
          answer: [
            'Use the account interface and official integration instructions to locate the credentials made available to your account. Never expose secret API keys in public code.',
          ],
        },
        {
          question: 'How Can I Contact SnapFit Support?',
          answer: [
            [
              'Email ',
              supportEmail,
              ' and explain the issue you are experiencing. Avoid including passwords, secret API keys, or other sensitive credentials in your message.',
            ],
          ],
        },
      ],
    },
    {
      id: 'continue-with-snapfit',
      layout: 'cta',
      eyebrow: 'Back to Setup',
      title: 'Continue with SnapFit',
      paragraphs: [
        'Your SnapFit account helps you manage the available features and continue configuring AI-powered clothing size estimation for your store.',
        'Log in to your account to continue your setup and keep your sizing experience ready for your customers.',
        [
          'New to SnapFit? Visit the ',
          { text: 'Register page', to: '/register' },
          ' to create an account or explore the available plans on the ',
          pricingPage,
          '.',
        ],
      ],
      actions: [
        { label: 'Log in now', to: PAGES.signin.to, variant: 'primary' },
        { label: 'Create an account', to: PAGES.signup.to, variant: 'outlineInverse' },
      ],
    },
  ],
};

export const register = {
  meta: {
    title: 'Create Your SnapFit Account | AI Size Estimation',
    description:
      'Register for SnapFit and bring AI-powered clothing size estimation and personalized size recommendations to your online store.',
  },
  title: 'Create Your SnapFit Account',
  intro: [
    withLink('Make clothing size selection easier for your customers with SnapFit. Our AI-powered size estimation platform helps online clothing stores estimate supported body measurements from a photo and recommend suitable sizes using product-specific size charts.', 'AI-powered size estimation platform', PAGES.home.to),
    'Create your account to get started with SnapFit, explore your subscription options, and prepare your store for an AI-assisted sizing experience.',
  ],
  formSection: {
    id: 'create-account',
    eyebrow: 'Merchant Sign-Up',
    title: 'Create Your Account',
    intro: [
      'Register with your business information to begin setting up your SnapFit account. Provide accurate details so you can manage your subscription, access the appropriate account features, and configure your integration.',
    ],
  },
  // Buttons right under the H1 (no form here): they open the bare form screens.
  actions: [
    { label: 'Sign Up', to: PAGES.signup.to },
    { label: 'Log In', to: PAGES.signin.to, variant: 'outline' },
  ],
  // What the sign-up form asks for, shown in the account section.
  fieldHelp: {
    lead: 'Your registration form may request the following information:',
    items: [
      { term: 'Full name', text: 'Identify the person responsible for the account.' },
      { term: 'Business email', text: 'Use an email address you can access for account notifications and recovery.' },
      { term: 'Store name', text: 'Identify the clothing store you want to connect with SnapFit.' },
      { term: 'Password', text: 'Create a strong, unique password to protect your account.' },
      { term: 'Subscription plan', text: 'Select a suitable plan when required by the registration process.' },
    ],
    notes: [
      [
        'Review your information before submitting the form. You should also read the ',
        privacyPolicy,
        ' and ',
        termsOfService,
        ' to understand how the service operates and how your account information is handled.',
      ],
    ],
  },
  sections: [
    {
      id: 'get-started',
      layout: 'prose',
      eyebrow: 'Online Fit Challenge',
      title: 'Get Started with AI Clothing Size Estimation',
      paragraphs: [
        'Choosing the right clothing size can be difficult when shopping online. Different brands use different size charts, and customers may struggle to understand which size is suitable for a particular product.',
        'SnapFit helps retailers address this challenge by combining photo-based body measurement estimation with product size chart matching. The platform is designed to integrate with compatible e-commerce websites through an API-driven workflow.',
        'Whether you operate a small clothing store or manage a growing retail business, SnapFit provides a starting point for introducing personalized sizing assistance into your shopping experience.',
      ],
    },
    {
      id: 'choose-plan',
      layout: 'prose',
      eyebrow: 'Small to Enterprise',
      title: 'Choose a SnapFit Subscription Plan',
      paragraphs: [
        'SnapFit offers Small, Medium, and Enterprise plans for different business requirements. Review the available pricing details before selecting an option.',
        'The right plan depends on your expected usage, integration needs, and the features included in each subscription. Check the published limits and billing terms rather than assuming that every plan includes the same functionality.',
        ['If you are unsure which plan fits your business, review the ', pricingPage, ' before completing your registration.'],
      ],
    },
    {
      id: 'after-registration',
      layout: 'steps',
      eyebrow: 'Account to Launch',
      title: 'What Happens After Registration?',
      items: [
        {
          title: 'Access Your Account',
          paragraphs: [
            'After completing the registration process, use your account credentials to access the available SnapFit dashboard or account interface.',
          ],
        },
        {
          title: 'Configure Your Store',
          paragraphs: [
            'Prepare your store information and identify the product categories you want to support. SnapFit is designed to provide sizing assistance for supported top and bottom categories.',
          ],
        },
        {
          title: 'Set Up Your Integration',
          paragraphs: [
            'Follow the available integration instructions for your e-commerce platform. Shopify and custom websites may require different implementation steps.',
          ],
        },
        {
          title: 'Configure Product Size Charts',
          paragraphs: [
            'Your product size charts are important to the recommendation process. Make sure the relevant measurements, size labels, and product categories are accurate and up to date.',
          ],
        },
        {
          title: 'Test Your Sizing Experience',
          paragraphs: [
            'Test the complete workflow before making it available to customers. Check photo submission, measurement estimates, size recommendations, and error handling.',
          ],
        },
      ],
    },
    {
      id: 'why-snapfit',
      layout: 'prose',
      eyebrow: 'BlazePose-Powered Sizing',
      title: 'Why Choose SnapFit?',
      paragraphs: [
        "SnapFit brings AI-assisted sizing into the online shopping journey. Its workflow uses MediaPipe BlazePose for body landmark detection, estimates supported body measurements, and matches the available measurements with a retailer's product size charts.",
        'This approach can help customers make more informed size choices without relying only on generic size labels. However, recommendations are estimates and cannot guarantee a perfect fit.',
        'The API-driven architecture is designed to make integration easier without requiring a complete website redevelopment, although the development work depends on your platform and implementation.',
      ],
    },
    {
      id: 'faq',
      layout: 'faq',
      eyebrow: 'Registration Questions',
      title: 'Frequently Asked Questions',
      items: [
        {
          question: 'Is Registration Free?',
          answer: [
            'Check the current SnapFit pricing and registration information for any free access or trial options. Do not assume that a free trial is available unless it is explicitly offered.',
          ],
        },
        {
          question: 'Can I Register My Shopify Store?',
          answer: [
            'SnapFit is designed for integration with compatible e-commerce platforms, including Shopify where the required integration is supported. Confirm the available setup requirements before proceeding.',
          ],
        },
        {
          question: 'Can I Use SnapFit on a Custom Website?',
          answer: [
            'SnapFit is designed to support API-based custom integrations. Your developer should review the integration documentation to confirm compatibility.',
          ],
        },
        {
          question: 'What Happens If I Have Trouble Registering?',
          answer: [
            [
              'Check that your information is entered correctly and that you can access your business email. If you still need assistance, contact ',
              supportEmail,
              '.',
            ],
          ],
        },
      ],
    },
    {
      id: 'start-with-snapfit',
      layout: 'cta',
      eyebrow: 'Ready to Register',
      title: 'Start with SnapFit Today',
      paragraphs: [
        'Create your account, review the available plans, and prepare to bring AI clothing size estimation to your online store. SnapFit gives retailers a way to introduce personalized sizing guidance into their existing shopping experience.',
        'Ready to get started? Register for SnapFit and take the first step toward a more informed clothing size selection process.',
      ],
      actions: [
        { label: 'Create your account', to: PAGES.signup.to, variant: 'primary' },
        { label: 'View pricing', to: PAGES.pricing.to, variant: 'outlineInverse' },
      ],
    },
  ],
};

// The bare form screens behind the buttons above (no page content: a heading
// and the form only).
export const signIn = {
  meta: { title: 'Log In | SnapFit', description: 'Log in to your SnapFit account.' },
  title: 'Log In',
  // There is no reset-email service: "Forgot password?" reveals this note.
  passwordHelp: [
    'Contact ',
    supportEmail,
    " from your account email and we'll help you reset your password.",
  ],
};

export const signUp = {
  meta: { title: 'Sign Up | SnapFit', description: 'Create your SnapFit account.' },
  title: 'Sign Up',
};
