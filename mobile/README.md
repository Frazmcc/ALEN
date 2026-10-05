# ALEN Mobile

Android and iOS companion application for ALEN.

The mobile app is intentionally separate from the existing website UI while sharing ALEN services, data and sky-engine work where appropriate.

## Technology

- Expo SDK 57
- React Native 0.86
- React 19.2
- TypeScript
- Expo Router

## Run locally

From the mobile directory:

1. Install Node.js 22 LTS.
2. Run npm install.
3. Copy .env.example to .env if a different API URL is needed.
4. Run npm start.
5. Open on Android, iOS simulator/device, or a development build.

Windows can develop and test Android directly. Final local iOS signing/building still requires Apple tooling on macOS, although cloud build services can be introduced later.

## Current milestone

M0 Bootstrap.

The current screens are a working native shell and visual direction, not the final sky renderer. The next engineering milestone is to connect the existing ALEN live-sky engine and then bridge native device position/orientation into it.

See:
- docs/ARCHITECTURE.md
- docs/ROADMAP.md
- docs/STORE_COMPLIANCE.md
