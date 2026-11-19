/// The React embed for the SnapFit widget, as shown on the Integration Docs
/// screen and copied from a product mapping. The API key is always a
/// placeholder: merchants paste their own key from the API Key page.
String widgetSnippet({required String apiUrl, String productId = 'SKU-1029'}) =>
    '''import SnapFitWidget from './SnapFitWidget';

<SnapFitWidget
  apiKey="sk_live_..."
  productId="$productId"
  apiUrl="$apiUrl"
  buttonLabel="Check My Size"
  autoCapture={true} // optional — false turns off the 2s auto-capture countdown (manual button only)
/>''';
