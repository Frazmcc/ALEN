# ALEN Mobile Roadmap

Status:
- [x] Complete baseline
- [~] In progress / functional baseline exists
- [ ] Not started

## M0 - Bootstrap
- [x] Shared Android/iOS project
- [x] Dark ALEN visual language
- [x] Welcome screen
- [x] Native navigation shell
- [x] CI type checking and Expo Doctor
- [x] Store-compliance baseline
- [x] Privacy data map

## M1 - Live Sky
- [x] Native astronomical coordinate engine
- [x] Real-time Sun, Moon and major planet positions
- [x] Shared Yale Bright Star Catalog source
- [x] Observer-relative Alt/Az projection
- [x] Sun-driven day/twilight/night palette baseline
- [x] Horizon tied to viewing direction
- [x] Manual drag-to-look
- [x] Centre sky on a selected catalogue object
- [x] High-performance Skia canvas for star/planet points
- [x] Pinch-to-zoom
- [x] Constellation lines and native sky-layer controls
- [~] Live aircraft and satellite Skia primitives with motion interpolation
- [ ] Native tap selection in the sky
- [~] Seamless horizon-anchored atmosphere gradient
- [ ] Full website terrain fidelity
- [ ] Smooth background/foreground resume validation on real devices
- [ ] Responsive landscape/tablet layout

## M2 - Device Position
- [x] User-triggered foreground location
- [x] Manual latitude/longitude observer
- [x] Locally persisted manual observer preference
- [x] Compass heading
- [x] Motion/gravity-driven elevation
- [x] True-north preference with magnetic fallback
- [x] Smoothed phone aiming
- [x] Permission-denial fallback to manual view
- [~] Calibration UX and real-device tuning
- [ ] Orientation handling for portrait/landscape device rotations

## M3 - Mobile Object Experience
- [x] Full 2,887-star catalogue search
- [x] Sun, Moon and planet search
- [x] Live observer-relative altitude/azimuth details
- [x] Show in Sky handoff
- [~] Native object detail presentation
- [ ] Object images and richer facts
- [ ] Distance/depth cues
- [ ] Search filters/categories
- [~] Satellites
- [~] Aircraft

## M4 - AR
- [ ] Camera sky mode
- [ ] Real-world alignment
- [ ] Drift/calibration correction
- [ ] Native privacy and camera permission flow

## M5 - Reliability and Offline
- [~] Local star catalogue
- [ ] Local settings/cache policy
- [ ] Network-loss handling
- [ ] API backoff and cache integration
- [ ] Resume without elastic banding
- [ ] Battery/memory profiling
- [ ] Long-session sensor stability tests

## M6 - Store Release
- [ ] Final production bundle/package identifiers
- [ ] Final icons and launch assets
- [~] Privacy policy/data map
- [ ] Play Data Safety
- [ ] Apple App Privacy and privacy manifest
- [ ] Android internal testing
- [ ] Google closed testing where required
- [ ] TestFlight
- [ ] Store screenshots and reviewer notes
- [ ] Production release candidate
