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

## Visual fidelity north star

ALEN is an observer-first sky simulation. The target experience is the view a human would have while standing outdoors at the selected location, date, time, and eye height, looking in the same direction.

- Sky-object angular position, motion, horizon, terrain, atmospheric effects, field of view, and orientation should be derived from the real observer geometry rather than arranged for convenience.
- Objects that are point-like to the unaided eye, including most satellites, should remain point-like in the main sky view. UI decoration must not make the sky materially less realistic.
- Distance/depth is a required part of the experience. Where human vision alone cannot recover physical range, ALEN should preserve a subtle visual depth cue and expose the accurate observer-relative distance immediately on selection.
- Labels and overlays are secondary information layers. They should default to the least intrusive state needed for a natural sky view and must not obscure the underlying geometry.
- The long-term validation target is camera-overlay alignment: after location, time, camera orientation, lens field of view, and calibration are known, a camera pointed at the real sky from that location should line up with ALEN as closely as the source data and sensor accuracy allow.

This is a product-level requirement for future rendering and data-source decisions, not just a satellite-display preference.

