# ALEN Mobile Privacy Data Map

This file is the engineering source of truth for Google Play Data Safety, Apple App Privacy and the public privacy policy.

Update this file whenever a feature changes what data is collected, processed, stored or shared.

## Current implementation

| Data category | Used | Stored by ALEN | Sent to ALEN backend | Shared with third parties | Purpose | Retention |
|---|---|---|---|---|---|---|
| Precise device location | Optional | No | Only while a live Satellites or Aircraft layer is enabled | No direct sharing of the exact observer coordinate | Calculate the local sky and filter observer-relative live objects | Foreground session; live API requests are processed transiently |
| Approximate device location | Optional | No | Only while a live Satellites or Aircraft layer is enabled | No direct sharing of the exact observer coordinate | Same observer-relative sky/live-object calculation | Foreground session; live API requests are processed transiently |
| Manual observer coordinates | Optional | Yes, on device only | Only while a live Satellites or Aircraft layer is enabled | No direct sharing of the exact observer coordinate | Reopen a user-selected observer and calculate live objects there | On device until changed/cleared; live API requests are processed transiently |
| Account data | No | No | No | No | N/A | N/A |
| Advertising ID | No | No | No | No | N/A | N/A |
| Contacts | No | No | No | No | N/A | N/A |
| Photos/media | No | No | No | No | N/A | N/A |
| Camera | No | No | No | No | Planned AR feature; not implemented yet | N/A |
| Motion/orientation | Optional | No | No | No | Align the live sky while Aim with phone is enabled | Current foreground session only |
| Crash diagnostics | No | No | No | No | Not configured yet | N/A |
| Analytics | No | No | No | No | Not configured yet | N/A |

## Location rules

- Location permission is not requested at launch.
- The user explicitly taps the current-location control before the OS permission dialog appears.
- Only foreground / while-in-use permission is requested.
- Background location is disabled on Android and iOS.
- No location foreground service is enabled on Android.
- If permission is denied, the application remains usable with the demo/manual-location path.
- Star and planet calculations remain on-device.
- The Satellites and Aircraft live layers are off by default.
- When the user enables Satellites, the active observer latitude/longitude is sent to the ALEN API to calculate which satellites are above that observer.
- The satellite API rounds observer coordinates into an approximately 0.005° cache cell and retains that application-level cache for up to 8 seconds.
- When the user enables Aircraft, the active observer latitude/longitude is sent to the ALEN API to filter nearby ADS-B aircraft.
- The aircraft backend shares upstream snapshots by an approximately 1° geographic cell and may retain those shared snapshots for up to 60 seconds; exact observer coordinates are used for per-request distance filtering.
- The mobile app does not send observer coordinates directly to CelesTrak, adsb.lol or another live-data provider.
- GPS coordinates themselves are not persisted. If the user selects current location, ALEN stores only the preference to use current location again.
- Manual coordinates may be persisted locally because they are explicitly entered as an observer location. They stay local unless the user enables Satellites or Aircraft, in which case the active manual observer coordinate is sent to the ALEN API for that live layer in the same way as a device-derived observer.

## Motion/orientation rules

- Motion access is requested only when the user enables Aim with phone.
- Motion and compass readings are processed locally on-device.
- Sensor readings are not stored by ALEN and are not sent to the ALEN API.
- Turning Aim with phone off removes the active sensor subscriptions.
- Manual drag remains available if motion access is denied or unavailable.
- Sensor sampling is intentionally below Android's high-sampling-rate permission threshold.

## Future-change gate

Before any additional feature such as weather, terrain, reverse-geocoding, analytics or future live-data integrations sends coordinates or identifiers to a server, this data map must be updated first and the store privacy declarations must be reviewed.
