export type Constellation = {
  id: string;
  name: string;
  segments: Array<readonly [string, string]>;
};

export const CONSTELLATIONS: Constellation[] = [
  {
    id: 'orion',
    name: 'Orion',
    segments: [
      ['hr2061', 'hr1790'],
      ['hr1790', 'hr1852'],
      ['hr1852', 'hr1903'],
      ['hr1903', 'hr1948'],
      ['hr1948', 'hr2004'],
      ['hr2004', 'hr1713'],
      ['hr1713', 'hr1790'],
      ['hr2061', 'hr1948'],
      ['hr2061', 'hr1713'],
    ],
  },
  {
    id: 'ursa-major',
    name: 'Ursa Major',
    segments: [
      ['hr4301', 'hr4295'],
      ['hr4295', 'hr4554'],
      ['hr4554', 'hr4660'],
      ['hr4660', 'hr4301'],
      ['hr4660', 'hr4905'],
      ['hr4905', 'hr5054'],
      ['hr5054', 'hr5191'],
    ],
  },
  {
    id: 'cassiopeia',
    name: 'Cassiopeia',
    segments: [
      ['hr21', 'hr168'],
      ['hr168', 'hr403'],
      ['hr403', 'hr542'],
    ],
  },
  {
    id: 'summer-triangle',
    name: 'Summer Triangle',
    segments: [
      ['hr7001', 'hr7924'],
      ['hr7924', 'hr7557'],
      ['hr7557', 'hr7001'],
    ],
  },
];
