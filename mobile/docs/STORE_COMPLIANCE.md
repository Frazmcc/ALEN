# Store Compliance Gate

Nothing is released to production while an applicable item is FAIL.

Statuses:
- PASS: verified
- REVIEW: manual verification required
- FAIL: blocks submission
- N/A: genuinely not applicable

## Baseline gates

- Current supported Expo / React Native release.
- Android target SDK matches current Google Play requirement.
- iOS build SDK matches current App Store requirement.
- Release signing configured separately from development signing.
- Production Android package and iOS bundle identifiers frozen before store creation.
- Privacy policy published and linked in the app.
- Google Data Safety matches actual application and SDK behaviour.
- Apple App Privacy answers match actual application and SDK behaviour.
- Apple privacy manifest and required-reason APIs checked.
- No unnecessary sensitive permissions.
- Foreground location only unless a future core feature proves background access is essential.
- Manual location remains available when location permission is denied.
- Account deletion implemented before account creation is offered publicly.
- Reviewer access works without MFA, VPN or manual approval.
- Store screenshots show the actual shipping build.
- Crash, resume, offline, slow-network and permission-denial tests pass.
- Android internal/closed testing requirements completed where applicable.
- iOS TestFlight release candidate tested.
- Production API and review credentials remain available during review.

## Development IDs

The current IDs end in .dev and are deliberately temporary:
- Android: com.frazmcc.alen.dev
- iOS: com.frazmcc.alen.dev

Do not create production store listings with these IDs. The permanent production identifier will be chosen once and then treated as immutable.
