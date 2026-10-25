import { PAGES } from './site';

// Homepage content. Edit text here -- HomePage only renders it, in this order.
//
// A paragraph is a string, or an array of strings and inline links
// ({ text, to, live? }) when part of the sentence should link somewhere.
// Each section's `layout` picks how it renders: prose | steps | features |
// prosCons | pricing | faq | cta. Its `id` is the anchor the header and the
// table of contents link to.

export const meta = {
  title: 'AI Clothing Size Estimation for Online Stores | SnapFit',
  description:
    'Help shoppers find the right clothing size with SnapFit AI clothing size estimation. Integrate photo-based sizing into your online store.',
  keywords: [
    'AI clothing size estimation',
    'AI body measurement',
    'clothing size recommendation',
    'AI size estimation',
    'body measurement from photo',
    'online clothing size estimator',
    'clothing size recommendation software',
    'e-commerce size estimation',
    'size recommendation API',
  ],
};

export const hero = {
  title: 'AI Clothing Size Estimation and Recommendation for Online Stores',
  description:
    'Help shoppers find the right clothing size with SnapFit AI clothing size estimation. Integrate photo-based sizing into your online store.',
  actions: [
    { label: 'Get Started', to: '/register', variant: 'primary' },
    { label: 'Log In', to: '/login', variant: 'outlineInverse' },
  ],
  // Text drawn inside the decorative hero animation.
  visualLabels: { title: 'Size check', chest: 'Chest', waist: 'Waist', size: 'Size M · High confidence' },
};

export const intro = [
  'Finding the right clothing size online can be difficult. Every clothing brand uses different size charts, and a medium in one store may fit differently from a medium in another. Customers often struggle to choose the correct size because they cannot try on clothes before buying them. This uncertainty can affect their shopping experience and make purchasing decisions harder.',
  "SnapFit helps online clothing stores address this challenge with AI clothing size estimation and personalized size recommendations. Our platform uses a customer's photo to estimate supported body measurements, compare those estimates with the retailer's product size chart, and recommend a suitable clothing size.",
  'Designed for online retailers, fashion brands, and e-commerce businesses, SnapFit provides an API-driven solution that integrates into existing shopping websites. Store owners can add a Size Estimation button to relevant product pages, allowing customers to access sizing assistance during their shopping journey.',
  'Whether you operate a Shopify store or a custom e-commerce website, SnapFit is designed to make AI-powered sizing easier to integrate. Instead of relying only on generic size charts, your store can offer customers a more personalized way to understand which size may suit them.',
];

export const tableOfContents = { title: 'Table of contents' };

export const sections = [
  {
    id: 'what-is-snapfit',
    layout: 'prose',
    eyebrow: 'The Platform',
    title: 'What Is SnapFit AI Clothing Size Estimation?',
    paragraphs: [
      'SnapFit is an AI-based size estimation and recommendation platform built for online clothing stores. It helps retailers estimate customer body measurements from a photo and use those estimates to recommend a suitable size from their own product size charts.',
      'Traditional clothing size charts provide general measurements for each size. Although these charts are useful, customers must usually measure themselves or guess which size matches their body. SnapFit adds an AI-assisted process to help customers make a more informed choice.',
      "The platform uses MediaPipe BlazePose, an open-source machine learning solution for detecting body landmarks in images. These landmarks help identify relevant body positions and proportions. SnapFit's measurement engine processes the detected information to estimate supported body measurements, which can then be compared with a retailer's configured sizing information.",
      'The resulting recommendation depends on the available image information, the supported measurements, and the quality of the product size chart. It is an estimate rather than a guarantee of how a garment will fit.',
      'For store owners, SnapFit provides a practical way to introduce personalized sizing assistance without rebuilding an entire e-commerce website.',
    ],
  },
  {
    id: 'how-it-works',
    layout: 'steps',
    eyebrow: 'Workflow',
    title: 'How SnapFit Works',
    intro: [
      'SnapFit follows a simple workflow that connects customer photos, estimated measurements, and product-specific size recommendations. The aim is to make sizing assistance available directly within the online shopping experience.',
    ],
    items: [
      {
        title: 'Upload a Single Photo',
        paragraphs: [
          "When a shopper opens a supported product page, they can select the Size Estimation button. The interface guides them through the photo upload process according to the image requirements provided by the store's SnapFit integration.",
          'A suitable photo helps the system identify visible body landmarks. Image quality, camera angle, body position, lighting, and clothing can affect how clearly those landmarks appear.',
        ],
      },
      {
        title: 'Detect Body Landmarks with MediaPipe BlazePose',
        paragraphs: [
          'After receiving the photo, the pose-detection component identifies relevant body landmarks. MediaPipe BlazePose provides pose-estimation technology that can detect key points associated with the human body.',
          'These points help the measurement engine understand body positioning and proportions. However, pose landmarks do not directly reveal every body circumference or hidden dimension. SnapFit must estimate supported measurements using its measurement logic and available information.',
        ],
      },
      {
        title: 'Estimate Body Measurements',
        paragraphs: [
          'SnapFit processes the detected landmarks to estimate supported body measurements. The system can present measurements in centimeters or inches, depending on the configured experience.',
          'The estimated values provide useful inputs for the next stage of the sizing process. Their reliability depends on the quality of the image, the measurement method, and the suitability of the estimation model for the customer and use case.',
        ],
      },
      {
        title: 'Match Measurements with Product Size Charts',
        paragraphs: [
          'After estimating the relevant measurements, SnapFit compares them with the size chart configured for the selected product or category.',
          'This step matters because different retailers and garments can use different sizing standards. A size chart for a fitted shirt may not use the same measurements or fit preferences as one for trousers.',
          'Matching estimated measurements with the correct product chart helps the system produce a recommendation that is relevant to the item being purchased.',
        ],
      },
      {
        title: 'Receive a Clothing Size Recommendation',
        paragraphs: [
          'The final stage provides the shopper with a recommended size and a confidence result, where supported by the implementation.',
          "The recommendation helps customers make a more informed decision before checkout. It should be presented as guidance rather than a promise of perfect fit, especially when the garment's fabric, cut, stretch, or personal fit preferences may affect the final result.",
        ],
      },
    ],
  },
  {
    id: 'features',
    layout: 'features',
    eyebrow: 'Sizing Toolkit',
    title: 'Key Features of SnapFit',
    intro: [
      'SnapFit combines AI-assisted measurement, product size chart matching, and e-commerce integration in one platform. These features are designed to help online retailers provide a more personalized sizing experience.',
    ],
    items: [
      {
        icon: 'scan',
        title: 'AI-Powered Body Measurement',
        paragraphs: [
          'SnapFit uses photo-based pose detection to identify body landmarks and estimate supported measurements. This approach can help customers who find manual measurement difficult or inconvenient.',
          'By introducing measurement assistance into the shopping journey, retailers can give customers another source of information when choosing clothing sizes.',
        ],
      },
      {
        icon: 'target',
        title: 'Personalized Clothing Size Recommendations',
        paragraphs: [
          'Generic size charts often require shoppers to interpret several measurements themselves. SnapFit uses estimated measurements and the relevant product size chart to recommend a suitable size.',
          'The goal is to make size selection easier without requiring every shopper to understand detailed measurement tables.',
        ],
      },
      {
        icon: 'shirt',
        title: 'Support for Tops and Bottoms',
        paragraphs: [
          'Clothing categories may require different measurement inputs. Tops and upper-body garments can depend on measurements such as chest, shoulder, or waist dimensions, while bottoms may require waist, hip, or other lower-body measurements.',
          'SnapFit is designed to support top and bottom product categories through the appropriate configuration and sizing logic. The specific measurements available depend on what the implemented measurement engine supports.',
        ],
      },
      {
        icon: 'table',
        title: 'Product-Specific Size Chart Matching',
        paragraphs: [
          "Different products can have different sizing requirements, even within the same store. SnapFit uses the retailer's configured product size charts to help match estimated measurements with relevant sizes.",
          'This makes accurate size chart configuration an important part of the process. Retailers should ensure that their measurements, size labels, and product-category settings reflect the actual garments they sell.',
        ],
      },
      {
        icon: 'gauge',
        title: 'Confidence Results for Recommendations',
        paragraphs: [
          'A confidence result can help communicate how strongly the system supports a recommendation based on its available inputs.',
          'Retailers should ensure that this result is clearly defined and validated. A confidence score should not be presented as a guaranteed probability of a perfect fit unless testing supports that interpretation.',
          'When customers understand the recommendation and its limitations, they can make more informed decisions.',
        ],
      },
      {
        icon: 'code',
        title: 'API-Based E-Commerce Integration',
        paragraphs: [
          'SnapFit is built around an API-driven architecture. Store owners subscribe to a suitable plan and receive unique API credentials for integrating the service with their website.',
          'This approach can support custom e-commerce websites and compatible platforms such as Shopify, provided the required integration is implemented. The integration process should follow the actual API documentation and the technical requirements of each store.',
        ],
      },
      {
        icon: 'click',
        title: 'Simple Product Page Experience',
        paragraphs: [
          'Customers should be able to access sizing assistance without navigating away from the product they want to purchase.',
          'With the appropriate integration, a Size Estimation button can appear on supported product pages. The shopper can then follow the sizing workflow and return to the purchase decision with a recommendation.',
        ],
      },
    ],
  },
  {
    id: 'benefits',
    layout: 'features',
    eyebrow: 'Retailer Value',
    title: 'Benefits of AI Clothing Size Estimation for Online Stores',
    intro: [
      "Adding AI clothing size estimation can improve how shoppers interact with size information. The practical value depends on the retailer's products, integration quality, and the accuracy of the estimation process.",
    ],
    items: [
      {
        icon: 'listChecks',
        title: 'Make Size Selection Easier',
        paragraphs: [
          'Customers may find it difficult to compare their body measurements with multiple rows in a size chart. An assisted recommendation can simplify this process by presenting a suggested size based on the available information.',
          'A clearer sizing journey can help shoppers understand their options before adding a product to their cart.',
        ],
      },
      {
        icon: 'userCheck',
        title: 'Support a More Personalized Shopping Experience',
        paragraphs: [
          'Personalization is useful when it helps customers make decisions that are relevant to their needs. SnapFit can use estimated measurements and product-specific size charts to provide sizing guidance for supported garments.',
          'This offers a more individualized experience than presenting the same generic size chart without additional assistance.',
        ],
      },
      {
        icon: 'ruler',
        title: 'Address Inconsistent Clothing Sizes',
        paragraphs: [
          'Clothing sizes are not universally standardized. A customer who usually wears a medium may need a different size from another brand or product.',
          "By matching measurements against the relevant retailer's size chart, SnapFit helps account for differences between product sizing systems. The result still depends on the accuracy and completeness of each chart.",
        ],
      },
      {
        icon: 'help',
        title: 'Reduce Sizing Uncertainty',
        paragraphs: [
          'Customers may hesitate to purchase clothing when they are unsure which size to choose. An additional sizing tool can provide useful information at the point of decision.',
          'Although this may help reduce uncertainty, retailers should measure their own conversion rates, customer feedback, and return reasons before claiming specific business improvements.',
        ],
      },
      {
        icon: 'growth',
        title: 'Support E-Commerce Growth',
        paragraphs: [
          'As an online store expands, maintaining a consistent sizing experience across products can become more complicated. An API-based sizing service can help retailers incorporate sizing assistance into their existing customer journey.',
          "SnapFit's subscription plans are intended to serve different business requirements, with plan selection based on the actual features, usage allowances, and integration needs offered.",
        ],
      },
    ],
  },
  {
    id: 'pros-and-cons',
    layout: 'prosCons',
    eyebrow: 'Trade-offs',
    title: 'SnapFit Pros and Cons',
    intro: [
      'AI clothing size estimation offers useful benefits, but retailers should also understand its limitations before implementing it.',
    ],
    labels: { pro: 'Pros', con: 'Cons' },
    rows: [
      { pro: 'Provides photo-based sizing assistance', con: 'Estimates may be affected by image quality' },
      { pro: 'Matches measurements with product size charts', con: 'Results depend on accurate size chart data' },
      { pro: 'Offers personalized size recommendations', con: 'Cannot guarantee a perfect fit' },
      { pro: 'Can support an in-page sizing experience', con: 'Requires technical integration and testing' },
      { pro: 'Uses API-based integration architecture', con: 'Compatibility depends on the website implementation' },
      { pro: 'Can support different clothing categories', con: 'Each category may require suitable measurement logic' },
      { pro: 'Helps customers make more informed decisions', con: 'Some customers may prefer manual size selection' },
      { pro: 'Can scale with business requirements', con: 'Higher usage or enterprise needs may require a larger plan' },
    ],
    outro: [
      'SnapFit is most useful when retailers combine the technology with accurate product data, clear instructions, appropriate privacy practices, and a well-tested integration.',
    ],
  },
  {
    id: 'integration',
    layout: 'steps',
    eyebrow: 'Store Setup',
    title: 'How to Integrate SnapFit with Your Online Store',
    intro: [
      "SnapFit is designed to help retailers introduce AI size estimation without rebuilding their entire website. The integration process connects the merchant's e-commerce environment with the SnapFit sizing service.",
    ],
    items: [
      {
        title: 'Choose a Subscription Plan',
        paragraphs: [
          'Start by reviewing the available Small, Medium, and Enterprise plans. Select the option that matches your expected usage, store requirements, and available integration features.',
          'Check the current plan details before subscribing so you understand the applicable limits and included services.',
        ],
      },
      {
        title: 'Create Your SnapFit Account',
        paragraphs: [
          'Register for an account using your business information. After completing the required setup and subscription steps, access the account area where your integration credentials are provided.',
        ],
      },
      {
        title: 'Obtain Your Unique API Key',
        paragraphs: [
          'SnapFit issues API credentials for connecting the store to its service. These credentials should be handled securely and used according to the API documentation.',
          'Do not expose secret credentials in public code, customer-facing pages, or repositories. Use the recommended authentication method for the integration.',
        ],
      },
      {
        title: 'Integrate the API',
        paragraphs: [
          'Connect your website to SnapFit using the supported API workflow. Shopify stores and custom websites may require different implementation steps, depending on their architecture and the integration components available.',
          'Developers should follow the official documentation for authentication, requests, responses, error handling, and any applicable usage limits.',
        ],
      },
      {
        title: 'Add the Size Estimation Button',
        paragraphs: [
          'Place the Size Estimation button on supported product pages so customers can access the tool while shopping.',
          'The integration should identify the correct product category and use the appropriate size chart. Test the button across relevant devices and product templates before launching it to customers.',
        ],
      },
      {
        title: 'Test Before Launching',
        paragraphs: [
          'Check the complete workflow using representative photos and product charts. Confirm that the system processes requests correctly, displays recommendations clearly, and handles invalid images or API errors appropriately.',
          'Testing also helps identify usability issues before the sizing feature becomes available to all customers.',
        ],
      },
    ],
  },
  {
    id: 'pricing',
    layout: 'pricing',
    eyebrow: 'Subscription Tiers',
    title: 'SnapFit Pricing Plans',
    intro: [
      'SnapFit offers three subscription tiers designed for different business requirements. Each plan should clearly explain its intended audience, available functionality, and usage limits.',
    ],
    plans: [
      {
        name: 'Small Plan',
        description: [
          'The Small plan can be positioned for retailers who are beginning to introduce AI sizing into their online shopping experience.',
          'Before selecting this plan, review the included API allowance, supported features, and integration requirements. It is important to match the plan to actual store usage rather than choosing solely by the monthly price.',
        ],
        cta: { label: 'View pricing', to: PAGES.pricing.to },
      },
      {
        name: 'Medium Plan',
        recommended: true,
        badge: 'Recommended',
        description: [
          'The Medium plan can suit businesses with greater sizing activity or broader operational needs, depending on the features and limits included in the plan.',
          'Retailers should compare the available usage allowance, supported categories, and other included services with their expected demand.',
        ],
        cta: { label: 'View pricing', to: PAGES.pricing.to },
      },
      {
        name: 'Enterprise Plan',
        description: [
          'The Enterprise plan is intended for businesses with more extensive integration or scaling requirements, according to the services SnapFit actually provides.',
          'Enterprise customers may need to review API usage, technical support, integration needs, and account requirements before making a decision.',
        ],
        cta: { label: 'View pricing', to: PAGES.pricing.to },
      },
    ],
    subsections: [
      {
        title: 'Choose the Right Plan for Your Store',
        paragraphs: [
          'Compare the plans based on actual usage limits, included functionality, support, and total cost. Clear pricing information helps merchants understand what they are purchasing and makes it easier to choose a suitable subscription.',
          'For current prices and plan details, review the SnapFit pricing page.',
        ],
      },
    ],
  },
  {
    id: 'accuracy',
    layout: 'prose',
    eyebrow: 'Know the Limits',
    title: 'Measurement Accuracy and Limitations',
    intro: [
      'AI clothing size estimation can help with sizing decisions, but its results should be interpreted with care. A photo does not directly reveal every physical measurement, and the reliability of an estimate depends on the available image information and the estimation method.',
    ],
    subsections: [
      {
        title: 'Photo Quality and Body Position',
        paragraphs: [
          'Poor lighting, low image resolution, unusual camera angles, or unclear body positioning can make landmark detection more difficult.',
          'Providing clear photo instructions can help customers submit more suitable images. SnapFit should also handle unsuitable inputs gracefully and explain when a usable recommendation cannot be generated.',
        ],
      },
      {
        title: 'Clothing and Body Shape',
        paragraphs: [
          'Loose clothing can hide body contours, while fitted garments may make some visible proportions easier to identify. Pose estimation can also be affected by occlusion, body positioning, and the visibility of relevant landmarks.',
          'These factors should be considered when interpreting estimated measurements.',
        ],
      },
      {
        title: 'The Importance of Accurate Size Charts',
        paragraphs: [
          "Even a useful body measurement estimate cannot produce a reliable product recommendation if the retailer's size chart is incorrect or incomplete.",
          'Store owners should verify the measurements for each supported product category and keep size information updated when garment specifications change.',
        ],
      },
      {
        title: 'Understanding Confidence Results',
        paragraphs: [
          "A confidence result should communicate the system's assessment according to its defined methodology. Retailers should not treat it as proof that a garment will fit perfectly.",
          'If the system has insufficient information, the customer experience should communicate uncertainty clearly rather than present an unsupported recommendation.',
        ],
      },
    ],
  },
  {
    id: 'privacy',
    layout: 'prose',
    eyebrow: 'Photo Privacy',
    title: 'Privacy and Customer Photo Handling',
    paragraphs: [
      'Customer photos and body-related estimates require responsible handling. Retailers should explain why a photo is requested and how the sizing service uses it.',
      "SnapFit's privacy information should describe the actual data collected, how photos are processed, whether images or measurements are retained, and which service providers may receive the information.",
      'Store owners should also ensure that their own customer notices and consent mechanisms are appropriate for their business and the locations in which they operate.',
      'Security measures should match the sensitivity of the information being processed. Clear privacy disclosures and secure integration practices help customers and retailers understand how the sizing experience works.',
    ],
  },
  {
    id: 'size-estimation-vs-virtual-try-on',
    layout: 'prose',
    eyebrow: 'Sizing vs. Try-On',
    title: 'AI Clothing Size Estimation vs. Virtual Try-On',
    paragraphs: [
      'AI clothing size estimation and virtual try-on are related fashion technologies, but they solve different problems.',
      'Virtual try-on generally helps customers visualize how clothing might look on a person or image. AI clothing size estimation focuses on using available measurements and product size charts to recommend a size.',
      'A visual preview does not automatically provide reliable physical measurements or guarantee garment fit. Likewise, a size recommendation does not necessarily generate an image showing the customer wearing a garment.',
      "SnapFit's core functionality is measurement-based size estimation and recommendation. If a store wants both visual garment previews and personalized sizing, it should evaluate whether the two experiences are available through compatible tools.",
    ],
  },
  {
    id: 'faq',
    layout: 'faq',
    eyebrow: 'Questions',
    title: 'Frequently Asked Questions',
    items: [
      {
        question: 'What Is AI Clothing Size Estimation?',
        answer: [
          'AI clothing size estimation uses artificial intelligence and available customer information to estimate body measurements or recommend a clothing size. SnapFit uses photo-based body landmark detection and product size chart matching to support its sizing workflow.',
        ],
      },
      {
        question: 'How Does SnapFit Estimate Body Measurements from a Photo?',
        answer: [
          'SnapFit uses MediaPipe BlazePose to detect body landmarks in a submitted photo. Its measurement engine processes the available landmark information to estimate supported measurements, which are then used in the size recommendation process.',
          'The accuracy of those estimates depends on the image, the supported measurements, and the underlying estimation method.',
        ],
      },
      {
        question: 'Can SnapFit Recommend a Clothing Size from One Photo?',
        answer: [
          'SnapFit is designed around a single-photo workflow. The system uses the available image information to estimate supported body measurements and compare them with the relevant product size chart.',
          'A single photo has limitations because some dimensions cannot be observed directly. The resulting size should therefore be treated as an estimate rather than a guaranteed fit.',
        ],
      },
      {
        question: 'Does SnapFit Work with Shopify?',
        answer: [
          'SnapFit is designed for API-based integration with e-commerce websites, including Shopify where the required integration is supported. Store owners should follow the available integration documentation to confirm compatibility and implementation requirements.',
        ],
      },
      {
        question: 'Can SnapFit Integrate with a Custom Website?',
        answer: [
          'Yes, SnapFit is designed to support custom e-commerce integrations through its API-driven architecture. Developers need to implement the supported API workflow, handle credentials securely, and configure the relevant product categories and size charts.',
        ],
      },
      {
        question: 'How Does SnapFit Match Measurements with Size Charts?',
        answer: [
          "The sizing engine compares estimated body measurements with the size information configured for the relevant product or category. This allows the recommendation to reflect the retailer's sizing standards rather than relying only on a generic size label.",
          'The usefulness of the recommendation depends on the quality of the estimated measurements and the product chart.',
        ],
      },
      {
        question: 'Does SnapFit Support Tops and Bottoms?',
        answer: [
          'SnapFit is designed to support top and bottom product categories. The measurements and recommendation logic should match the requirements of each category and the features available in the implemented system.',
        ],
      },
      {
        question: 'Does SnapFit Guarantee the Perfect Fit?',
        answer: [
          'No AI-based size estimate should be presented as a guarantee of perfect fit. Garment cut, fabric stretch, personal preferences, image quality, and size chart accuracy can affect the result.',
          'SnapFit provides sizing guidance to help customers make more informed choices.',
        ],
      },
      {
        question: 'What Does the Confidence Result Mean?',
        answer: [
          "A confidence result communicates the system's assessment according to its defined methodology. Its meaning should be explained in the product interface and documentation.",
          'It should not be interpreted as a probability of perfect fit unless that interpretation has been validated through appropriate testing.',
        ],
      },
      {
        question: 'Is AI Clothing Size Estimation the Same as Virtual Try-On?',
        answer: [
          'No. Size estimation focuses on measurements and clothing size recommendations, while virtual try-on focuses on visualizing clothing on a person or image. The two technologies can complement one another, but they are not interchangeable.',
        ],
      },
      {
        question: 'How Much Does SnapFit Cost?',
        answer: [
          [
            'SnapFit offers Small, Medium, and Enterprise subscription plans. Pricing and included features depend on the current plan details. Visit the ',
            { text: 'Pricing page', ...PAGES.pricing },
            ' to compare the available options.',
          ],
        ],
      },
      {
        question: 'Is Customer Photo Information Kept Private?',
        answer: [
          [
            "Photo handling depends on the implemented data-processing and retention policies. Store owners and shoppers should review SnapFit's ",
            { text: 'Privacy Policy', ...PAGES.privacy },
            ' for details about processing, storage, access, and deletion.',
          ],
        ],
      },
    ],
  },
  {
    id: 'get-started',
    layout: 'cta',
    eyebrow: 'Next Steps',
    title: 'Get Started with SnapFit',
    paragraphs: [
      'Choosing the right clothing size should be easier for customers shopping online. SnapFit helps online clothing stores introduce AI-assisted body measurement and personalized size recommendations through a photo-based workflow and product-specific size chart matching.',
      'With API-driven integration, support for configured product categories, and subscription plans for different business requirements, SnapFit provides a practical foundation for retailers who want to improve their sizing experience.',
      "Explore the available plans, review the integration requirements, and see how SnapFit can fit into your store's shopping journey.",
      'Get started with SnapFit today and bring AI clothing size estimation to your online store.',
    ],
    actions: [
      { label: 'Get Started', to: '/register', variant: 'primary' },
      { label: 'View pricing', to: PAGES.pricing.to, variant: 'outlineInverse' },
    ],
  },
];
