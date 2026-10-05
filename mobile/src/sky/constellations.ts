// Mirrors the current ALEN website constellation-line baseline.
// Keep these as lightweight canvas primitives; a full IAU guide-line dataset can
// replace this list without changing the renderer contract.
export const CONSTELLATION_LINES: readonly (readonly string[])[] = [
  ['vega', 'deneb', 'altair'],
  ['betelgeuse', 'rigel'],
  ['sirius', 'procyon', 'pollux'],
] as const;
