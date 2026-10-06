# ALEN Mobile Local Data

ALEN Mobile keeps persistent on-device data intentionally small.

## Persisted on-device data

- Observer preference:
  - demo observer selection, or
  - preference to use current location again, or
  - manually entered latitude/longitude and its display label.
- Sky display preferences:
  - stars
  - constellations
  - planets
  - atmosphere
  - landscape
  - satellite subgroup choices
  - aircraft subgroup choices
- AR calibration preference:
  - selected lens calibration profile
  - adjusted field of view

## Not persisted on-device

- Current GPS coordinates.
- Motion, compass or calibration sensor samples.
- Camera frames.
- Live aircraft positions (same-observer stale tracks may remain in memory during a foreground reconnect, but are never written to persistent storage).
- Live satellite positions (same-observer stale tracks may remain in memory during a foreground reconnect, but are never written to persistent storage).
- Live route/object metadata responses.
- Account data.
- Advertising identifiers.

## Reset behaviour

The More screen exposes two local reset actions:

- Reset sky preferences removes persisted display/layer choices.
- Clear ALEN local data removes the saved observer preference, sky preferences and AR calibration preference, and immediately returns the active observer to the Greenwich demo.

Clearing ALEN local data does not revoke Android/iOS permissions. System permissions remain controlled by the operating system.
