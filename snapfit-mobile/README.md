# SnapFit Mobile

The SnapFit Android app, built with Flutter. It talks to the same backend
(`snapfit-backend`) and AI pipeline as the web app. It contains only the
signed-in parts of SnapFit; the public marketing pages (home, pricing, guide,
legal) stay on the website.

- **Sign in / Sign up**: the app opens here when signed out.
- **Merchant dashboard**: home, subscription and plans, API key, size charts,
  product mapping and anchor points, analytics, size check (camera or upload,
  size result and try-on), integration docs, settings.
- **Super admin console**: overview, merchants and merchant detail, analytics,
  demo studio, audit log, settings.

The app uses the same colours, font (Manrope) and icons (Lucide) as the web app,
and the same routes and access rules (merchant vs super admin, and the
subscription gate).

## Run it

Start the backend first (`snapfit-backend`, port 5000). Then, from this folder:

```bash
flutter pub get
flutter run                      # on a connected phone or emulator
flutter test                     # unit and widget tests
flutter build apk --debug        # build/app/outputs/flutter-apk/app-debug.apk
```

## Reaching the backend from a phone

The app calls `http://10.0.2.2:5000/api` by default, which is the PC's
localhost as seen from the Android emulator. A real phone needs the PC's Wi-Fi
address instead:

1. Find the PC's address: `ipconfig` → "IPv4 Address", e.g. `192.168.1.10`.
2. Put the phone on the same Wi-Fi and allow port 5000 through the Windows
   firewall.
3. In the app, open **Server settings** on the sign-in screen (or Settings →
   Appearance → Server) and enter `http://192.168.1.10:5000/api`.

The address can also be set at build time:
`flutter run --dart-define=API_URL=http://192.168.1.10:5000/api`.

Plain HTTP is allowed for development (`usesCleartextTraffic` in
`android/app/src/main/AndroidManifest.xml`); serve the backend over HTTPS for a
release build.

## Layout

```
lib/
  core/        API client, sign-in state, settings, plan rules, formatting
  theme/       colour tokens and type scale (from the web's theme.css)
  widgets/     shared UI kit, charts, logo
  auth/        sign in, sign up, server settings
  dashboard/   merchant screens
  sizecheck/   camera capture with the pose guide, size result, try-on
  admin/       super admin screens
router.dart    routes and access guards
```
