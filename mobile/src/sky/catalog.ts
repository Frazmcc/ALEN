import brightStarData from '@/sky/bright-stars.json';

export type Star = {
  id: string;
  name: string;
  ra: number;
  dec: number;
  mag: number;
  color: string;
  designation: string;
  temperatureK: number | null;
};

type RawStar = {
  id: string;
  name: string;
  ra: number;
  dec: number;
  mag: number;
  temp?: number | null;
  designation?: string | null;
};

function starColor(temperature?: number | null) {
  const value = Math.max(2500, Math.min(30000, Number(temperature) || 6000));

  if (value < 3500) return '#ffb07a';
  if (value < 5000) return '#ffd2a1';
  if (value < 6500) return '#fff2d2';
  if (value < 9000) return '#eef4ff';
  return '#cfe1ff';
}

export const BRIGHT_STARS: Star[] = (brightStarData.stars as RawStar[])
  .map((star) => ({
    id: star.id,
    name: star.name || star.designation || star.id,
    ra: Number(star.ra),
    dec: Number(star.dec),
    mag: Number(star.mag),
    color: starColor(star.temp),
    designation: star.designation || star.name || star.id,
    temperatureK: Number.isFinite(Number(star.temp))
      ? Number(star.temp)
      : null,
  }))
  .filter(
    (star) =>
      Number.isFinite(star.ra) &&
      Number.isFinite(star.dec) &&
      Number.isFinite(star.mag),
  );

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
