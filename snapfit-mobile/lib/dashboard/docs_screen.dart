import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/app_settings.dart';
import '../core/plans.dart';
import '../core/toast.dart';
import '../core/json.dart';
import '../theme/app_theme.dart';
import '../theme/snap_colors.dart';
import '../widgets/ui.dart';

const _sections = [
  ('getting-started', 'Getting Started'),
  ('authentication', 'Authentication'),
  ('endpoints', 'Endpoints'),
  ('code-examples', 'Code Examples'),
  ('widget-integration', 'Widget Integration'),
  ('error-codes', 'Error Codes'),
  ('rate-limits', 'Rate Limits'),
  ('try-it-out', 'Try It Out'),
];

typedef _Param = ({String field, String type, bool required, String description});
typedef _ErrorRow = ({String code, int status, String meaning, String? internal});

_ErrorRow _err(String code, int status, String meaning, [String? internal]) =>
    (code: code, status: status, meaning: meaning, internal: internal);

final _authErrors = [
  _err('No API key provided', 401, 'The x-api-key header is missing from the request.'),
  _err('Invalid API key', 401, 'No merchant matches this key.'),
  _err('Subscription is not active', 403, 'No plan has been selected, or it was cancelled.'),
  _err('Subscription has expired', 403, "The plan's billing period has ended."),
  _err('Monthly request limit reached', 403, "The plan's request quota is used up — upgrade to continue."),
];

final _recommendErrors = [
  _err('An image file is required', 400, 'The multipart body is missing the image field.'),
  _err('productId is required', 400, 'The productId field was empty or missing.'),
  _err('userHeight is required', 400, 'The userHeight field was empty or missing.'),
  _err('userHeight must be between 100 and 230 cm', 400, 'userHeight is not a number, or is outside 100–230 cm.'),
  _err(
    'clothingFit must be fitted, regular or loose',
    400,
    'clothingFit was sent with a value other than fitted, regular or loose.',
  ),
  _err(
    'Only image files are allowed',
    400,
    'The uploaded file is not an image — rejected by content type before reaching the AI service.',
  ),
  _err(
    'File too large',
    400,
    'The image or one of the frames exceeds the 10MB per-file upload limit — rejected before reaching the AI service.',
  ),
  _err('At most 4 extra frames are allowed', 400, 'More than 4 frames fields were sent with the image.'),
  _err(
    'No size chart is mapped to product "…"',
    404,
    'This productId has no size chart mapped yet — map it from Product Mapping first.',
  ),
];

final _photoErrors = [
  _err(
    'This file could not be read as an image. Please upload a JPG or PNG photo.',
    400,
    "The file isn't decodable as an image.",
    'INVALID_IMAGE',
  ),
  _err(
    'This image resolution is too low. Please upload a higher-resolution photo.',
    400,
    'The image is smaller than 200×200 pixels.',
    'RESOLUTION_TOO_LOW',
  ),
  _err(
    'We could not detect a person in this photo. Please upload a clear, full-body photo.',
    422,
    'No person could be detected in the photo.',
    'NO_BODY_DETECTED',
  ),
  _err(
    'We need a better photo: <first instruction>.',
    422,
    'The photo fails the pose rules (whole body visible, facing the camera, standing straight, arms slightly away from the body, feet hip-width apart, reasonable lighting). The response also has code: "POSE_INVALID" and poseChecks: [{ id, message }] listing every failed check.',
    'POSE_INVALID',
  ),
];

const _aiGenericMessage =
    'We could not process your photo right now. Please try again with a clear, front-facing full-body photo.';

final _aiFailureCauses = [
  _err('AI_SERVICE_NOT_CONFIGURED', 500, "The AI service URL isn't configured on the server."),
  _err('AI_SERVICE_UNREACHABLE', 502, 'The AI service could not be reached — safe to retry.'),
  _err('AI_SERVICE_TIMEOUT', 504, 'The AI service took longer than 30s to respond — safe to retry.'),
  _err('EMPTY_SIZE_CHART', 422, 'The mapped size chart has no sizes defined yet.'),
  _err(
    'NO_COMPARABLE_MEASUREMENTS',
    422,
    "None of the photo's estimated measurements overlap the size chart's fields.",
  ),
  _err(
    'INVALID_SIZE_CHART_JSON',
    400,
    "The size chart couldn't be parsed — an integration bug on our side, not the shopper's photo.",
  ),
];

final _feedbackErrors = [
  _err('A valid recommendationId is required', 400, 'recommendationId is missing or not a valid id.'),
  _err(
    'fitResult must be one of: too_small, slightly_small, perfect, slightly_large, too_large',
    400,
    'fitResult was missing or not one of the five accepted values.',
  ),
  _err('Recommendation not found', 404, "The recommendationId doesn't belong to this merchant."),
];

const List<_Param> _recommendParams = [
  (field: 'image', type: 'file', required: true, description: 'JPG or PNG photo, up to 10MB.'),
  (
    field: 'frames',
    type: 'file',
    required: false,
    description: 'Up to 4 extra JPEG frames taken a moment after image from a live camera — repeat the frames field for each. Body landmarks are combined across all the photos, which steadies the measurements. Leave it out for an uploaded photo; image is still the photo used for the try-on.',
  ),
  (field: 'productId', type: 'string', required: true, description: 'Must already be mapped to a size chart.'),
  (
    field: 'userHeight',
    type: 'number',
    required: true,
    description: "Shopper's height in centimeters, between 100 and 230. Scales the photo to real measurements.",
  ),
  (
    field: 'clothingFit',
    type: 'string',
    required: false,
    description: 'What the shopper is wearing in the photo: fitted, regular (default) or loose. Fitted clothes give the most accurate size.',
  ),
  (
    field: 'includeTryOn',
    type: 'boolean',
    required: false,
    description: 'Send "true" to also get a virtual try-on of this product on the photo in the same call (one upload, billed as one request). Only rendered when the product has an image and anchor points.',
  ),
];

const List<_Param> _feedbackParams = [
  (
    field: 'recommendationId',
    type: 'string',
    required: true,
    description: 'Id of the recommendation this feedback is about.',
  ),
  (
    field: 'fitResult',
    type: 'string',
    required: true,
    description: 'One of: too_small, slightly_small, perfect, slightly_large, too_large.',
  ),
  (field: 'comment', type: 'string', required: false, description: 'Optional free-text note from the shopper.'),
];

const List<_Param> _widgetParams = [
  (field: 'apiKey', type: 'string', required: true, description: 'Your live API key.'),
  (field: 'productId', type: 'string', required: true, description: 'The product being viewed.'),
  (
    field: 'apiUrl',
    type: 'string',
    required: true,
    description: 'Base URL of the SnapFit API (no trailing /recommend).',
  ),
  (field: 'buttonLabel', type: 'string', required: false, description: 'Defaults to "Check My Size".'),
  (
    field: 'autoCapture',
    type: 'boolean',
    required: false,
    description: 'Defaults to true: once the shopper holds a valid pose, a 2-second countdown captures the photo automatically. The manual Capture button is always available once the pose is valid; set false to use it only.',
  ),
];

const _recommendSuccessExample = '''{
  "success": true,
  "recommendation": {
    "size": "M",
    "confidence": 0.95,
    "bodyType": "average",
    "notes": "Based on your proportions, M is the best fit. L may also work if you prefer a looser fit.",
    "fitScores": { "S": 0.1, "M": 0.95, "L": 0.6 },
    "alternativeSize": "L",
    "measurements": {
      "chest": { "value": 100.8, "unit": "cm", "estimated": true },
      "shoulderWidth": { "value": 44.2, "unit": "cm", "estimated": false }
    },
    "sizeComparison": [
      {
        "label": "M",
        "score": 0.95,
        "perMeasurement": [
          { "name": "chest", "userValue": 100.8, "min": 94, "max": 102, "status": "within" }
        ]
      }
    ],
    "fitNotes": ["Chest is near the top of M; consider L for a looser fit."],
    "photoTips": [
      { "id": "dim_light", "message": "Your photo is quite dark. Retake it in brighter, even light for a more accurate size." }
    ],
    "warnings": [],
    "framesUsed": 5
  },
  "product": { "productId": "SKU-1029", "productName": "Classic Crew Tee", "imageUrl": "https://…/uploads/products/…png", "tryOnReady": true },
  "tryOn": { "status": "success", "image": "data:image/jpeg;base64,…" }
}''';

const _recommendErrorExample = '''{
  "success": false,
  "message": "We could not detect a person in this photo. Please upload a clear, full-body photo."
}''';

const _feedbackRequestExample = '''{
  "recommendationId": "66f1a2b3c4d5e6f7a8b9c0d1",
  "fitResult": "perfect",
  "comment": "True to size, fits great."
}''';

const _feedbackResponseExample = '''{
  "success": true,
  "feedback": {
    "_id": "66f1a2b3c4d5e6f7a8b9c0d2",
    "recommendationId": "66f1a2b3c4d5e6f7a8b9c0d1",
    "merchantId": "66f0...",
    "fitResult": "perfect",
    "comment": "True to size, fits great.",
    "createdAt": "2026-08-25T18:00:00.000Z"
  }
}''';

const _iframeExample = '''<iframe
  src="https://your-storefront.com/product/123"
  allow="camera"
></iframe>''';

class DocsScreen extends StatefulWidget {
  const DocsScreen({super.key});

  @override
  State<DocsScreen> createState() => _DocsScreenState();
}

class _DocsScreenState extends State<DocsScreen> {
  final _keys = {for (final (id, _) in _sections) id: GlobalKey()};
  List<dynamic> _plans = const [];

  @override
  void initState() {
    super.initState();
    context
        .read<ApiClient>()
        .get('/subscription/plans')
        .then((res) {
          if (mounted) setState(() => _plans = asList(res['plans']));
        })
        .catchError((Object e) {
          showToast(errorMessage(e, 'Failed to load plan limits'), kind: ToastKind.error);
        });
  }

  void _jump(String id) {
    final target = _keys[id]?.currentContext;
    if (target != null) Scrollable.ensureVisible(target, duration: const Duration(milliseconds: 300));
  }

  Widget _section(String id, String title, List<Widget> children) {
    final c = context.colors;
    return Padding(
      key: _keys[id],
      padding: const EdgeInsets.only(top: 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            title,
            style: snapText(size: 18, weight: FontWeight.w600, color: c.foreground),
          ),
          for (final child in children) ...[gap12, child],
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final api = context.read<ApiClient>().baseUrl;
    final jsExample =
        '''async function checkSize(apiKey, productId, imageFile) {
  const formData = new FormData();
  formData.append('image', imageFile);
  formData.append('productId', productId);
  formData.append('userHeight', '178'); // cm, 100–230
  formData.append('clothingFit', 'fitted'); // fitted | regular | loose
  // From a live camera, optionally add up to 4 extra frames:
  // extraFrames.forEach((frame) => formData.append('frames', frame));

  const res = await fetch('$api/recommend', {
    method: 'POST',
    headers: { 'x-api-key': apiKey },
    body: formData,
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message);
  }
  return data.recommendation; // { size, confidence, alternativeSize, measurements, sizeComparison, fitNotes, photoTips, warnings, ... }
}''';
    final pythonExample =
        '''import requests

API_KEY = "sk_live_..."

with open("photo.jpg", "rb") as image_file:
    response = requests.post(
        "$api/recommend",
        headers={"x-api-key": API_KEY},
        files={"image": image_file},
        data={"productId": "SKU-1029", "userHeight": "178", "clothingFit": "fitted"},
    )

result = response.json()
if response.ok and result["success"]:
    print(result["recommendation"]["size"])
else:
    print("Error:", result["message"])''';
    final curlExample = '''curl -X POST $api/recommend \\
  -H "x-api-key: sk_live_..." \\
  -F "image=@photo.jpg" \\
  -F "productId=SKU-1029" \\
  -F "userHeight=178" \\
  -F "clothingFit=fitted"''';
    final widgetExample =
        '''import SnapFitWidget from './SnapFitWidget';

<SnapFitWidget
  apiKey="sk_live_..."
  productId="SKU-1029"
  apiUrl="$api"
  buttonLabel="Check My Size"
  autoCapture={true} // optional — false turns off the 2s auto-capture countdown (manual button only)
/>''';

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
      children: [
        const PageIntro(
          title: 'Integration Docs',
          description: 'Everything you need to call the SnapFit API from your storefront.',
        ),
        gap12,
        SizedBox(
          height: 36,
          child: ListView(
            scrollDirection: Axis.horizontal,
            children: [
              for (final (id, label) in _sections)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ActionChip(
                    label: Text(label, style: snapText(size: 13, color: c.foreground)),
                    backgroundColor: c.surface,
                    side: BorderSide(color: c.border),
                    onPressed: () => _jump(id),
                  ),
                ),
            ],
          ),
        ),
        _section('getting-started', 'Getting Started', [
          const DocText(
            "SnapFit has three moving parts: your storefront calls the SnapFit API, which forwards the shopper's photo to our computer-vision service and returns a recommended size for one of your mapped products.",
          ),
          const _Numbered([
            '[Create a size chart](/dashboard/size-charts/new) with the measurement ranges for each size you sell.',
            '[Map a product](/dashboard/product-mapping) (your own product ID) to that size chart.',
            '[Generate an API key](/dashboard/api-key) to authenticate requests.',
            'Call `POST /api/recommend` from your storefront — either with the [embeddable widget](#widget-integration) or your own code (see [Code Examples](#code-examples)).',
            'Optionally, submit `POST /api/feedback` to track fit accuracy over time.',
          ]),
        ]),
        _section('authentication', 'Authentication', [
          const DocText(
            'Customer-facing endpoints (`/api/recommend` and `/api/feedback`) are authenticated with a single API key sent in the `x-api-key` header. This is separate from the session token your dashboard login uses.',
          ),
          const CodeBlock('x-api-key: sk_live_a1b2c3d4e5f6...', label: 'Header'),
          const SnapAlert(
            variant: AlertVariant.warning,
            description: "Because this key is called directly from the shopper's browser (for example, by the embeddable widget), treat it as a storefront-scoped key rather than a secret — SnapFit doesn't yet support a separate publishable/secret key pair. Every accepted call counts against your plan's request limit.",
          ),
          const DocText(
            'Get your key from the [API Key page](/dashboard/api-key). A missing or invalid key returns `401`; an inactive or expired plan returns `403` — see [Error Codes](#error-codes).',
          ),
        ]),
        _section('endpoints', 'Endpoints', [
          const _EndpointHeader('POST', '/api/recommend'),
          const DocText("Analyzes a shopper's photo against a product's size chart and returns a recommended size."),
          const _Label('Request body (multipart/form-data)'),
          const _ParamsTable(_recommendParams),
          const DocText(
            '`measurements` are in cm; chest, waist and hip are circumferences estimated from the photo (`estimated: true`). Size chart ranges are compared in cm whatever unit the chart uses. `tryOn` is present only when `includeTryOn` was sent: status `success` (with `image`), `unavailable` (product not set up for try-on) or `failed` (with a `message`) — a try-on problem never fails the size recommendation.',
          ),
          const DocText(
            "`photoTips` and `warnings` are always present (empty when there's nothing to say), each a list of `{ id, message }` with a shopper-ready message to show as-is. Photo tips (`dim_light`, `glare`, `cluttered_background`) suggest how a retake could improve accuracy; the `possible_child` warning is added when `userHeight` is under 145 cm.",
          ),
          const DocText(
            '`framesUsed` is how many photos the measurements were combined from: `1` for a single photo, more when `frames` were sent.',
          ),
          const _Label('Success response — 200'),
          const CodeBlock(_recommendSuccessExample),
          const _Label('Error response — 4xx/5xx'),
          const CodeBlock(_recommendErrorExample),
          const SnapAlert(
            variant: AlertVariant.warning,
            description: "The success response does not currently include the created recommendation's id, so there is no way for the storefront to reference it in a later /api/feedback call yet — this is a known gap, not something to build around.",
          ),
          Divider(color: c.border, height: 24),
          const _EndpointHeader('POST', '/api/feedback'),
          const DocText(
            'Records how a size recommendation actually fit, for accuracy reporting on the Analytics page.',
          ),
          const _Label('Request body (application/json)'),
          const _ParamsTable(_feedbackParams),
          const _Label('Example request'),
          const CodeBlock(_feedbackRequestExample),
          const _Label('Success response — 201'),
          const CodeBlock(_feedbackResponseExample),
        ]),
        _section('code-examples', 'Code Examples', [
          const DocText(
            "All three examples send the same request: a photo, a product ID, the shopper's height and what they're wearing, and your API key.",
          ),
          CodeBlock(jsExample, label: 'JavaScript'),
          CodeBlock(pythonExample, label: 'Python'),
          CodeBlock(curlExample, label: 'cURL'),
        ]),
        _section('widget-integration', 'Widget Integration', [
          const DocText(
            'The fastest way to add SnapFit to a React storefront is the `SnapFitWidget` component — it handles the upload UI, loading/result/error states, and calls `/api/recommend` for you.',
          ),
          CodeBlock(widgetExample, label: 'React'),
          const _ParamsTable(_widgetParams),
          const DocText(
            'See it running in the [Size Check](/dashboard/size-check) screen, which runs the same flow a real product page would.',
          ),
          const SnapAlert(
            variant: AlertVariant.warning,
            description: "A drop-in script-tag/iframe embed for non-React storefronts isn't published yet. Until then, any stack can integrate directly against the REST API using the snippets in Code Examples above.",
          ),
          Divider(color: c.border, height: 24),
          Text(
            'Live camera capture',
            style: snapText(size: 14, weight: FontWeight.w600, color: c.foreground),
          ),
          const DocText(
            'Alongside file upload, the widget offers guided live camera capture: a client-side pose model gives the shopper real-time framing feedback (a colored border and status text) before they take the photo, so blurry, cropped, or badly-angled photos never reach your size-matching pipeline in the first place.',
          ),
          const _Label('Performance'),
          const DocText(
            'The live pose model (`@mediapipe/tasks-vision`, ~150KB gzipped of JS plus a WASM binary) is dynamically imported only when a shopper opens the "Take a Photo" tab — it is never fetched on initial widget load, so merchants whose shoppers only use file upload pay nothing extra.',
          ),
          const _Label('HTTPS & iframe embeds'),
          const DocText(
            'Camera access requires a secure context — your storefront must be served over HTTPS (or `localhost` during development). `getUserMedia` is blocked outright on plain HTTP, and the widget automatically falls back to the upload-only flow in that case. If your storefront is itself embedded in an `<iframe>` (for example inside a page builder or app store), that iframe also needs an explicit `allow="camera"` attribute — without it, the browser blocks camera access inside the frame even on HTTPS, before the shopper is ever asked for permission:',
          ),
          const CodeBlock(_iframeExample, label: 'HTML'),
          const _Label('Low-end devices'),
          const DocText(
            'If the live pose model fails to load, or is still loading 6 seconds after the camera opens (a reasonable proxy for a device too slow to run it smoothly), the widget automatically falls back to ungated manual capture — a static frame guide with no live red/green validation — rather than blocking camera use entirely. The Capture button stays enabled throughout this fallback.',
          ),
        ]),
        _section('error-codes', 'Error Codes', [
          const DocText(
            '`/api/recommend` errors include `success: false` alongside `message`. Auth-layer errors (the x-api-key check) and every `/api/feedback` error return just `{ "message": "..." }`, with no `success` field.',
          ),
          _ErrorTable(caption: 'Authentication & Quota', rows: _authErrors),
          _ErrorTable(caption: 'Request Validation — /api/recommend', rows: _recommendErrors),
          _ErrorTable(caption: 'Photo Validation', rows: _photoErrors),
          _ErrorTable(
            caption: 'AI Service & Size-Matching Failures',
            intro:
                'Several distinct backend-side conditions all return the same message — `"$_aiGenericMessage"` — so use the HTTP status (and, if you\'re inspecting your own recommendation logs, the internal cause below) to tell them apart.',
            rows: _aiFailureCauses,
            codeLabel: 'Internal cause',
          ),
          _ErrorTable(caption: 'Request Validation — /api/feedback', rows: _feedbackErrors),
        ]),
        _section('rate-limits', 'Rate Limits', [
          const DocText(
            "Every request that passes API key validation counts against your plan's monthly limit — once it's reached, `/api/recommend` and `/api/feedback` return `403 Monthly request limit reached` until you [upgrade your plan](/dashboard/subscription/plans).",
          ),
          if (_plans.isNotEmpty)
            SnapCard(
              padding: EdgeInsets.zero,
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: DataTable(
                  headingRowColor: WidgetStatePropertyAll(c.surface2),
                  headingTextStyle: snapText(size: 11, weight: FontWeight.w500, color: c.mutedForeground),
                  dataTextStyle: snapText(size: 14, color: c.foreground),
                  columns: const [
                    DataColumn(label: Text('PLAN')),
                    DataColumn(label: Text('PRICE')),
                    DataColumn(label: Text('REQUESTS / MO')),
                    DataColumn(label: Text('SIZE CHARTS')),
                  ],
                  rows: [
                    for (final p in _plans)
                      DataRow(
                        cells: [
                          DataCell(
                            Text(
                              '${p['name']}',
                              style: snapText(size: 14, weight: FontWeight.w500, color: c.foreground),
                            ),
                          ),
                          DataCell(Text(formatPlanPrice(p['price'] as num?))),
                          DataCell(Text(formatLimit(p['requestsLimit'] as num?))),
                          DataCell(Text(formatLimit(p['chartsLimit'] as num?))),
                        ],
                      ),
                  ],
                ),
              ),
            ),
        ]),
        _section('try-it-out', 'Try It Out', [
          const DocText("Send a real request to your account's API using a photo from this device."),
          const _TryItOut(),
        ]),
      ],
    );
  }
}

/// Docs prose with `code` spans and [links](/path) -- in-page links (#id)
/// scroll to that section.
class DocText extends StatefulWidget {
  const DocText(this.text, {super.key});

  final String text;

  @override
  State<DocText> createState() => _DocTextState();
}

class _DocTextState extends State<DocText> {
  final _recognizers = <TapGestureRecognizer>[];

  void _clear() {
    for (final r in _recognizers) {
      r.dispose();
    }
    _recognizers.clear();
  }

  @override
  void dispose() {
    _clear();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    _clear();
    final c = context.colors;
    final base = snapText(size: 14, color: c.foreground, height: 1.6);
    final spans = <InlineSpan>[];
    final pattern = RegExp(r'`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)');
    var last = 0;
    for (final m in pattern.allMatches(widget.text)) {
      if (m.start > last) spans.add(TextSpan(text: widget.text.substring(last, m.start)));
      if (m.group(1) != null) {
        spans.add(
          TextSpan(
            text: m.group(1),
            style: TextStyle(fontFamily: 'monospace', fontSize: 13, color: c.foreground, backgroundColor: c.surface2),
          ),
        );
      } else {
        final to = m.group(3)!;
        final recognizer = TapGestureRecognizer()
          ..onTap = () {
            if (to.startsWith('#')) {
              final state = context.findAncestorStateOfType<_DocsScreenState>();
              state?._jump(to.substring(1));
            } else {
              context.go(to);
            }
          };
        _recognizers.add(recognizer);
        spans.add(
          TextSpan(
            text: m.group(2),
            recognizer: recognizer,
            style: snapText(size: 14, weight: FontWeight.w500, color: c.primary, decoration: TextDecoration.underline),
          ),
        );
      }
      last = m.end;
    }
    if (last < widget.text.length) spans.add(TextSpan(text: widget.text.substring(last)));
    return Text.rich(TextSpan(style: base, children: spans));
  }
}

class _Numbered extends StatelessWidget {
  const _Numbered(this.items);

  final List<String> items;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      children: [
        for (var i = 0; i < items.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 22,
                  child: Text('${i + 1}.', style: snapText(size: 14, color: c.foreground, height: 1.6)),
                ),
                Expanded(child: DocText(items[i])),
              ],
            ),
          ),
      ],
    );
  }
}

class _Label extends StatelessWidget {
  const _Label(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Text(
    text.toUpperCase(),
    style: snapText(size: 11, weight: FontWeight.w600, color: context.colors.mutedForeground, letterSpacing: 0.8),
  );
}

class _EndpointHeader extends StatelessWidget {
  const _EndpointHeader(this.method, this.path);

  final String method;
  final String path;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        SnapBadge(method, variant: BadgeVariant.success),
        const SizedBox(width: 8),
        Text(
          path,
          style: TextStyle(
            fontFamily: 'monospace',
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: context.colors.foreground,
          ),
        ),
      ],
    );
  }
}

/// Request fields as stacked rows (field, type, description).
class _ParamsTable extends StatelessWidget {
  const _ParamsTable(this.rows);

  final List<_Param> rows;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SnapCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++) ...[
            if (i > 0) Divider(height: 1, color: c.border),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Text(
                        rows[i].field,
                        style: TextStyle(fontFamily: 'monospace', fontSize: 12, color: c.foreground),
                      ),
                      if (rows[i].required) Text(' *', style: snapText(size: 12, color: c.danger)),
                      const Spacer(),
                      Text(rows[i].type, style: snapText(size: 12, color: c.mutedForeground)),
                    ],
                  ),
                  gap4,
                  Text(rows[i].description, style: snapText(size: 13, color: c.foreground, height: 1.5)),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

BadgeVariant _statusVariant(int status) {
  if (status < 300) return BadgeVariant.success;
  if (status < 500) return BadgeVariant.warning;
  return BadgeVariant.danger;
}

class _ErrorTable extends StatelessWidget {
  const _ErrorTable({required this.caption, required this.rows, this.intro, this.codeLabel});

  final String caption;
  final List<_ErrorRow> rows;
  final String? intro;
  final String? codeLabel;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SnapCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            color: c.surface2,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Text(
              caption.toUpperCase(),
              style: snapText(size: 11, weight: FontWeight.w600, color: c.mutedForeground, letterSpacing: 0.8),
            ),
          ),
          if (intro != null) Padding(padding: const EdgeInsets.fromLTRB(12, 12, 12, 0), child: DocText(intro!)),
          for (var i = 0; i < rows.length; i++) ...[
            if (i > 0) Divider(height: 1, color: c.border),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SnapBadge('${rows[i].status}', variant: _statusVariant(rows[i].status)),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          rows[i].code,
                          style: TextStyle(fontFamily: 'monospace', fontSize: 12, color: c.foreground),
                        ),
                        if (rows[i].internal != null)
                          Text(
                            'internal code: ${rows[i].internal}',
                            style: snapText(size: 10, color: c.mutedForeground),
                          ),
                        gap4,
                        Text(rows[i].meaning, style: snapText(size: 13, color: c.foreground, height: 1.5)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Makes a real call against this account's live API.
class _TryItOut extends StatefulWidget {
  const _TryItOut();

  @override
  State<_TryItOut> createState() => _TryItOutState();
}

class _TryItOutState extends State<_TryItOut> {
  late final _apiKey = TextEditingController(text: context.read<AppSettings>().demoApiKey);
  final _productId = TextEditingController();
  final _height = TextEditingController();
  bool _showKey = false;
  String _fit = 'regular';
  XFile? _file;
  bool _sending = false;
  ({int status, bool ok, String body})? _response;

  @override
  void dispose() {
    _apiKey.dispose();
    _productId.dispose();
    _height.dispose();
    super.dispose();
  }

  bool get _canSend =>
      _apiKey.text.isNotEmpty && _productId.text.isNotEmpty && _height.text.isNotEmpty && _file != null && !_sending;

  Future<void> _send() async {
    setState(() {
      _sending = true;
      _response = null;
    });
    final api = context.read<ApiClient>();
    try {
      final form = FormData.fromMap({
        'image': await MultipartFile.fromFile(_file!.path, filename: _file!.name),
        'productId': _productId.text,
        'userHeight': _height.text,
        'clothingFit': _fit,
      });
      final res = await api.dio.post(
        '/recommend',
        data: form,
        options: Options(
          headers: {'x-api-key': _apiKey.text},
          extra: {'noAuth': true},
          validateStatus: (_) => true,
          receiveTimeout: const Duration(seconds: 90),
        ),
      );
      final body = res.data is Map || res.data is List
          ? const JsonEncoder.withIndent('  ').convert(res.data)
          : '{\n  "message": "Response was not valid JSON"\n}';
      final status = res.statusCode ?? 0;
      setState(() => _response = (status: status, ok: status >= 200 && status < 300, body: body));
    } catch (_) {
      setState(
        () => _response = (status: 0, ok: false, body: '{\n  "message": "Request failed — is the API reachable?"\n}'),
      );
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final response = _response;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SnapCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SnapField(
                label: 'API Key',
                controller: _apiKey,
                hint: 'sk_live_...',
                obscureText: !_showKey,
                monospace: true,
                onChanged: (_) => setState(() {}),
                suffix: IconButton(
                  tooltip: _showKey ? 'Hide key' : 'Show key',
                  icon: Icon(_showKey ? LucideIcons.eyeOff : LucideIcons.eye, size: 18, color: c.mutedForeground),
                  onPressed: () => setState(() => _showKey = !_showKey),
                ),
              ),
              gap4,
              const DocText('From your [API Key page](/dashboard/api-key). Sent straight from this phone to the API.'),
              gap16,
              SnapField(
                label: 'Product ID',
                controller: _productId,
                hint: 'e.g. SKU-1029',
                monospace: true,
                onChanged: (_) => setState(() {}),
              ),
              gap4,
              const DocText('Must already be [mapped to a size chart](/dashboard/product-mapping).'),
              gap16,
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: SnapField(
                      label: 'Height (cm)',
                      controller: _height,
                      hint: 'e.g. 178',
                      keyboardType: TextInputType.number,
                      onChanged: (_) => setState(() {}),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: SnapSelect<String>(
                      label: 'Clothing fit',
                      value: _fit,
                      options: const {'fitted': 'Fitted', 'regular': 'Regular', 'loose': 'Loose'},
                      onChanged: (v) => setState(() => _fit = v ?? 'regular'),
                    ),
                  ),
                ],
              ),
              gap16,
              const FieldLabel('Photo'),
              InkWell(
                borderRadius: BorderRadius.circular(8),
                onTap: () async {
                  final file = await ImagePicker().pickImage(source: ImageSource.gallery);
                  if (file != null) setState(() => _file = file);
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: c.border, width: 2),
                  ),
                  child: Row(
                    children: [
                      Icon(LucideIcons.cloudUpload, size: 16, color: c.muted),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _file?.name ?? 'Choose a full-body JPG or PNG',
                          overflow: TextOverflow.ellipsis,
                          style: snapText(size: 14, color: c.mutedForeground),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              gap16,
              SnapButton(
                label: 'Send Test Request',
                expand: true,
                loading: _sending,
                onPressed: _canSend ? _send : null,
              ),
            ],
          ),
        ),
        gap16,
        Text.rich(
          TextSpan(
            style: snapText(size: 11, weight: FontWeight.w500, color: c.mutedForeground, letterSpacing: 0.8),
            children: [
              const TextSpan(text: 'RESPONSE '),
              if (response != null)
                TextSpan(
                  text: '(${response.status})',
                  style: TextStyle(color: response.ok ? c.success : c.danger),
                ),
            ],
          ),
        ),
        gap8,
        if (response != null)
          CodeBlock(response.body, label: '${response.status} response')
        else
          Container(
            height: 140,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: c.border, width: 2),
            ),
            child: Text('Send a request to see the response here', style: snapText(size: 14, color: c.mutedForeground)),
          ),
      ],
    );
  }
}
