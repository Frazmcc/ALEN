# ALEN — Astronomical Live Environment & Navigation

ALEN is a browser-first immersive live-sky website for exploring the night sky, planets, stars, satellites and live aircraft from an observer-relative point of view.

## Product principles

- **Website first** — no desktop install required.
- **Immersive sky** — the sky is the primary interface, not a dashboard.
- **One selected object at a time** — select, inspect, deselect naturally.
- **Live + astronomical data** — stars, planets, satellites and aircraft share one visual environment.
- **Modular data sources** — public astronomy data can be added without coupling the renderer to one provider.
- **Independent implementation** — ALEN uses its own rendering and data architecture.

## Status

Early development.

## Visual fidelity

ALEN is an observer-first sky simulation. The target experience is the view from the selected location, date, time and eye height while looking in the same direction.

- Sky-object angular position, motion, horizon, terrain, atmospheric effects, field of view and orientation are derived from observer geometry.
- Objects that are point-like to the unaided eye, including most satellites, remain visually compact in the main sky view.
- Distance and depth information is preserved where source data allows it and is exposed on object selection.
- Labels and overlays remain secondary to the sky geometry and can be reduced or disabled.
- Long-term visual validation is based on camera-overlay alignment using location, time, camera orientation, field of view and calibration.

## Horizon and terrain

The landscape renderer separates the local geometric horizon from the distant terrain profile.

- The foreground ground plane is anchored to the local 0° geometric horizon.
- Distant hills and mountains are derived from sampled terrain elevation by azimuth.
- Observer eye height and Earth curvature are included in terrain-angle calculations.
- Terrain remains part of sky-object occlusion, so objects below the local skyline are hidden naturally.

## Aircraft imagery

Aircraft imagery is resolved from public aircraft identifiers and displayed in the inspector.

- Exact-airframe photographs are matched by ICAO hex and registration.
- PlaneSpotters is the primary live photo source.
- A photograph of a different registration is not used as the selected aircraft merely because it is the same type.
- Police, air-ambulance/HEMS and coastguard/SAR aircraft can use a clearly labelled regional service representative image when an exact-airframe photo is unavailable.
- Other aircraft fall back to a neutral, single-colour reference for the exact ICAO model where that model is supported.
- If no exact-model reference exists, the inspector shows an explicit unavailable state rather than substituting a similar aircraft.
- Regional representative imagery is identified in the inspector as representative rather than as the exact airframe.

## Satellite sky integrity

Satellite rendering distinguishes a complete live-sky snapshot from a partial upstream catalogue response.

- A requested satellite snapshot is treated as complete only when every requested orbital group has loaded successfully.
- If a refresh is incomplete, the website keeps the last complete satellite sky instead of replacing it with a misleading partial distribution.
- When a response exceeds the display limit, sampling preserves the measured density across azimuth and equal-solid-angle elevation cells rather than selecting by catalogue-number order alone.
- Priority objects such as stations and bright visual satellites are favoured within each sky cell without flattening or artificially spreading the real orbital distribution.
- Runtime diagnostics expose requested groups, missing groups, completeness and before/after sky-distribution counts for validation.

## API traffic resilience

The public API applies layered overload protection before expensive live-data work begins.

- Per-client burst and per-minute request limits apply to every `/api/v1/` endpoint, with tighter limits for image and metadata proxy routes.
- Service-wide request ceilings provide a second guard against distributed application-layer floods.
- Limits are shared through Redis/Valkey when configured and fall back to bounded in-process counters if the distributed cache is unavailable.
- Expensive satellite propagation, live aircraft work, metadata lookups and image proxying use bounded concurrency slots so queued traffic cannot occupy every worker.
- Overloaded requests fail fast with HTTP `429 Too Many Requests`, `Retry-After` and `Cache-Control: no-store`.
- Cloudflare/forwarded client addresses are used for request identity, and rate-limit events include the Cloudflare request identifier when present.
- Wide-radius aircraft requests remain geographically quantised so small coordinate changes cannot create an unlimited stream of unique ADS-B upstream requests.
- Existing stale-cache and request-coalescing behaviour remains active so normal traffic spikes reuse recent data rather than stampeding upstream providers.

Rate limiting is enabled by default. Deployments can tune all limits together with the `ALEN_RATE_LIMIT_MULTIPLIER` environment variable or disable the application limiter with `ALEN_RATE_LIMITS_ENABLED=false` when an equivalent trusted edge policy is in place.

## Satellite imagery

Satellite images are resolved independently from orbital-position data.

- ISS Tracker is the primary satellite-image source and is resolved by NORAD catalogue number.
- SatNOGS is the next image source when an ISS Tracker image is unavailable.
- Wikimedia Commons is used as a further fallback.
- If no verified public image is available, ALEN keeps its local satellite illustration.
- CelesTrak remains an orbital/catalogue data source rather than a photo source.

## Data and image sources

Current public sources include:

- CelesTrak for satellite orbital/catalogue data.
- SatNOGS for satellite metadata and fallback imagery.
- ISS Tracker for primary satellite imagery.
- PlaneSpotters for aircraft imagery.
- Wikimedia Commons for selected fallback imagery.
- ADS-B data for live aircraft position and movement.

Source availability can vary. ALEN keeps local visual fallbacks so object selection remains usable when an external image source has no matching asset or is temporarily unavailable.
