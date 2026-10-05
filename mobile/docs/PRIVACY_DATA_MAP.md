# ALEN Mobile Privacy Data Map

This file is the engineering source of truth for Google Play Data Safety, Apple App Privacy and the public privacy policy.

Update this file whenever a feature changes what data is collected, processed, stored or shared.

## Current implementation

| Data category | Used | Stored by ALEN | Sent to ALEN backend | Shared with third parties | Purpose | Retention |
|---|---|---|---|---|---|---|
| Precise device location | Optional | No | No | No | Calculate the observer's sky locally | Current app session/state only |
| Approximate device location | Optional | No | No | No | Same foreground sky calculation | Current app session/state only |
| Account data | No | No | No | No | N/A | N/A |
| Advertising ID | No | No | No | No | N/A | N/A |
| Contacts | No | No | No | No | N/A | N/A |
| Photos/media | No | No | No | No | N/A | N/A |
| Camera | No | No | No | No | Planned AR feature; not implemented yet | N/A |
| Motion/orientation | No | No | No | No | Planned sky alignment; not implemented yet | N/A |
| Crash diagnostics | No | No | No | No | Not configured yet | N/A |
| Analytics | No | No | No | No | Not configured yet | N/A |

## Location rules

- Location permission is not requested at launch.
- The user explicitly taps the current-location control before the OS permission dialog appears.
- Only foreground / while-in-use permission is requested.
- Background location is disabled on Android and iOS.
- No location foreground service is enabled on Android.
- If permission is denied, the application remains usable with the demo/manual-location path.
- The current native astronomy implementation performs star and planet calculations on-device and does not transmit device coordinates to the ALEN API.

## Future-change gate

Before aircraft, satellite, weather, terrain, reverse-geocoding or analytics features send coordinates or identifiers to a server, this data map must be updated first and the store privacy declarations must be reviewed.
