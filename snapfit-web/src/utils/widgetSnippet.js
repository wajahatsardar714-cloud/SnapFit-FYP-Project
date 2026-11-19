// The SnapFitWidget embed snippet, shared by the Integration Docs page and the
// "Copy widget code" action on Product Mapping so the two can never drift.
// It never holds a real API key -- the merchant pastes their own over the
// placeholder.
export const API_BASE = import.meta.env.VITE_API_URL || 'https://your-api-domain.com/api';
export const API_KEY_PLACEHOLDER = 'sk_live_...';
export const EXAMPLE_PRODUCT_ID = 'SKU-1029';

// A plain JSX string attribute cannot hold a double quote or a backslash, so
// such an ID is written as a JS string expression instead.
function jsxStringAttr(value) {
  return /["\\]/.test(value) ? `{${JSON.stringify(value)}}` : `"${value}"`;
}

export function buildWidgetSnippet(productId = EXAMPLE_PRODUCT_ID) {
  return `import SnapFitWidget from './SnapFitWidget';

<SnapFitWidget
  apiKey="${API_KEY_PLACEHOLDER}"
  productId=${jsxStringAttr(productId)}
  apiUrl="${API_BASE}"
  buttonLabel="Check My Size"
  autoCapture={true} // optional — false turns off the 2s auto-capture countdown (manual button only)
/>`;
}
