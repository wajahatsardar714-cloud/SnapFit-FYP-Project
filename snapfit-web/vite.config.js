import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// Camera access (getUserMedia) requires a "secure context": HTTPS, or the special
// case of `localhost`. A phone reaching this dev server over the LAN sees neither
// (plain HTTP, non-localhost host), so its browser blocks the camera outright for
// the QR-code mobile-capture handoff. basicSsl gives the dev server a self-signed
// HTTPS certificate to satisfy that -- the phone's browser will show a one-time
// "not private" warning to click through (self-signed, no public CA), which is
// expected for local dev and unrelated to app correctness.
//
// The /api and /uploads proxy below then lets the frontend call the backend via a
// *relative* path (see .env's VITE_API_URL=/api) so everything the phone talks to
// stays on this one HTTPS origin -- avoiding "mixed content" blocking that would
// otherwise happen calling plain-HTTP :5000 from an HTTPS page, without needing a
// second certificate for the backend too.
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    port: 3001,
    // Bind to all interfaces (not just localhost) so a phone on the same LAN can
    // reach the dev server for the QR-code mobile-capture handoff.
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
