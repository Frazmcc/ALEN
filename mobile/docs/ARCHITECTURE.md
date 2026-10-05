# ALEN Mobile Architecture

ALEN Mobile is a companion to the existing ALEN website, not a replacement for it.

## Principles

- One Android and iOS codebase using React Native and Expo.
- Keep the existing ALEN API and astronomical data sources shared.
- Do not ship a simple full-site WebView wrapper.
- Reuse or extract the live-sky renderer where practical, but surround it with a native mobile application shell.
- Native device integrations will include foreground location, compass, gyroscope, accelerometer, camera/AR, haptics, sharing and notifications.
- Store-sensitive permissions are added only when the feature that needs them is implemented.
- The app must continue to offer manual location entry when precise location permission is declined.

## Renderer strategy

Phase 1 creates the native navigation and application shell.
Phase 2 connects the current ALEN sky engine.
Phase 3 bridges native location and orientation into the renderer.
Phase 4 adds camera-based AR and native object interactions.

The renderer is treated as an engine, not as the whole application.
