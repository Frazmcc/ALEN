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
- [x] Constellation guide lines and native sky-layer controls
- [~] Live satellite and aircraft Skia overlays
- [x] Native tap selection in the sky
- [~] Seamless horizon-anchored atmosphere gradient
- [ ] Full website terrain fidelity
- [~] Background/foreground resume resynchronisation baseline; real-device validation pending
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
- [x] Known-object phone-aim calibration baseline
- [ ] Real-device sensor calibration tuning
- [x] Orientation handling for portrait/landscape device rotations

## M3 - Mobile Object Experience
- [x] Full 2,887-star catalogue search
- [x] Sun, Moon and planet search
- [x] Live observer-relative altitude/azimuth details
- [x] Show in Sky handoff
- [x] Native object detail presentation
- [x] Single-selection/deselect and centre action across stars, planets and live objects
- [x] Rich satellite and aircraft facts with proxied imagery
- [~] Distance/depth cues
- [x] Search filters/categories
- [~] Satellites
- [~] Aircraft

## M4 - AR
- [~] Camera sky mode baseline with rear-camera preview
- [~] Real-world star/planet alignment using observer position and device pointing
- [~] Drift/calibration correction
- [x] Camera permission requested only from the AR screen
- [x] Camera preview does not capture or persist photos/video
- [x] AR field-of-view adjustment baseline for device-lens calibration
- [ ] Real-device camera/sensor alignment validation
- [x] Lens-specific calibration profiles with locally persisted FOV tuning

## M5 - Reliability and Offline
- [~] Local star catalogue
- [x] Local settings/cache policy and in-app reset controls
- [~] Network-loss handling with stale/error states and bounded retry backoff; real-device validation pending
- [~] Exponential API retry backoff for live satellite/aircraft feeds; broader cache integration pending
- [~] Resume without elastic banding; lifecycle resync implemented, real-device validation pending
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
