# Aircraft Image Policy

This policy is a hard acceptance rule for ALEN's aircraft inspector.

## Normal aircraft

1. Prefer a photo of the exact airframe, matched by ICAO hex and/or registration.
2. Never substitute a photograph of a different aircraft just because it is the same family or type.
3. If no exact-airframe photograph is available, show ALEN's exact ICAO-model neutral reference only when that exact model exists in the model library.
4. The neutral model reference must use a plain single-colour paint scheme with no airline livery, branding or logos.
5. If ALEN has no exact model reference for that ICAO type, show an explicit "Exact model artwork unavailable" state. Do not show a similar model.

## Police, air ambulance and coastguard exception

If no exact-airframe photograph is available for an aircraft identified as police, air ambulance/HEMS or coastguard/SAR:

1. Prefer a representative aircraft image from the same operational region.
2. The inspector must label it clearly as "regional service representative" and "not the exact airframe".
3. Regional representative imagery must never be presented as the exact aircraft.
4. If no suitable regional service image is available, fall back to the exact ICAO-model neutral reference described above.
5. If no exact model reference is available, show the explicit unavailable state rather than a substitute model.

## Required order

Normal aircraft:

Exact airframe photo -> exact-model plain single-colour reference -> unavailable state

Police / air ambulance / coastguard:

Exact airframe photo -> regional service representative -> exact-model plain single-colour reference -> unavailable state

## Acceptance criteria

- A type-only photograph of another registration must never be shown as the selected aircraft.
- A regional emergency-service image must be visibly identified as representative.
- Unknown ICAO models must never inherit a generic or visually similar aircraft model.
- Image-load failures must continue down the same ordered fallback chain.
- Automated tests must protect all of the rules above.
