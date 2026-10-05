export type Star = {
  id: string;
  name: string;
  ra: number;
  dec: number;
  mag: number;
  color: string;
};

export const BRIGHT_STARS: Star[] = [
  { id: 'sirius', name: 'Sirius', ra: 101.2871553, dec: -16.7161159, mag: -1.46, color: '#eef6ff' },
  { id: 'canopus', name: 'Canopus', ra: 95.9879, dec: -52.6957, mag: -0.74, color: '#fff3dc' },
  { id: 'arcturus', name: 'Arcturus', ra: 213.9153002, dec: 19.1824092, mag: -0.05, color: '#ffd6a0' },
  { id: 'vega', name: 'Vega', ra: 279.23473479, dec: 38.78368896, mag: 0.03, color: '#dcecff' },
  { id: 'capella', name: 'Capella', ra: 79.1723279, dec: 45.9979915, mag: 0.08, color: '#fff0c4' },
  { id: 'rigel', name: 'Rigel', ra: 78.6344671, dec: -8.2016384, mag: 0.13, color: '#d7e8ff' },
  { id: 'procyon', name: 'Procyon', ra: 114.8254935, dec: 5.2249931, mag: 0.34, color: '#fff5db' },
  { id: 'betelgeuse', name: 'Betelgeuse', ra: 88.792939, dec: 7.407064, mag: 0.42, color: '#ffad83' },
  { id: 'altair', name: 'Altair', ra: 297.6958273, dec: 8.8683212, mag: 0.77, color: '#f3f5ff' },
  { id: 'aldebaran', name: 'Aldebaran', ra: 68.980163, dec: 16.509302, mag: 0.87, color: '#ffb07a' },
  { id: 'spica', name: 'Spica', ra: 201.298247, dec: -11.161322, mag: 0.98, color: '#dce8ff' },
  { id: 'antares', name: 'Antares', ra: 247.3519157, dec: -26.4320023, mag: 0.96, color: '#ff9d7a' },
  { id: 'pollux', name: 'Pollux', ra: 116.328957, dec: 28.026199, mag: 1.14, color: '#ffd7a6' },
  { id: 'deneb', name: 'Deneb', ra: 310.35797912, dec: 45.28033881, mag: 1.25, color: '#d9e8ff' },
  { id: 'regulus', name: 'Regulus', ra: 152.092962, dec: 11.967209, mag: 1.35, color: '#eaf1ff' },
];

export const PLANET_INFO = {
  sun: { name: 'Sun', color: '#ffd76a', glyph: '☉' },
  moon: { name: 'Moon', color: '#e8edf2', glyph: '◐' },
  mercury: { name: 'Mercury', color: '#c6b69b', glyph: '☿' },
  venus: { name: 'Venus', color: '#ffe0a3', glyph: '♀' },
  mars: { name: 'Mars', color: '#ff8a66', glyph: '♂' },
  jupiter: { name: 'Jupiter', color: '#f0c29a', glyph: '♃' },
  saturn: { name: 'Saturn', color: '#f5d889', glyph: '♄' },
  uranus: { name: 'Uranus', color: '#9fe8eb', glyph: '⛢' },
  neptune: { name: 'Neptune', color: '#759cff', glyph: '♆' },
} as const;

export type PlanetId = keyof typeof PLANET_INFO;
