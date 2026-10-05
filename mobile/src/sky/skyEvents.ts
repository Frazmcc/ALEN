import {
  BRIGHT_STARS,
  PLANET_INFO,
  type PlanetId,
} from '@/sky/catalog';
import {
  currentPlanetPositions,
  norm360,
  raDecToAltAz,
  type AltAz,
  type Observer,
} from '@/sky/astronomy';

export type VisibleSkyObject = {
  id: string;
  kind: 'star' | 'planet';
  name: string;
  color: string;
  altitude: number;
  azimuth: number;
  detail: string;
};

export type HorizonEvent = {
  id: string;
  objectId: string;
  objectKind: 'star' | 'planet';
  name: string;
  color: string;
  type: 'rise' | 'set';
  time: number;
  azimuth: number;
};

type TimedAltAz = AltAz & {
  time: number;
};

const EVENT_HOURS = 18;
const EVENT_STEP_MINUTES = 10;
const BRIGHT_EVENT_STAR_LIMIT = 1.5;

function interpolateAngle(a: number, b: number, ratio: number) {
  const delta = ((b - a + 540) % 360) - 180;
  return norm360(a + delta * ratio);
}

function firstHorizonCrossing(
  samples: TimedAltAz[],
): Pick<HorizonEvent, 'type' | 'time' | 'azimuth'> | null {
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];

    const rising = previous.el < 0 && current.el >= 0;
    const setting = previous.el >= 0 && current.el < 0;
    if (!rising && !setting) continue;

    const denominator = current.el - previous.el;
    const ratio =
      Math.abs(denominator) < 1e-8
        ? 0
        : Math.max(
            0,
            Math.min(1, (0 - previous.el) / denominator),
          );

    return {
      type: rising ? 'rise' : 'set',
      time:
        previous.time +
        (current.time - previous.time) * ratio,
      azimuth: interpolateAngle(
        previous.az,
        current.az,
        ratio,
      ),
    };
  }

  return null;
}

export function visibleSkyObjects(
  observer: Observer,
  now: number,
): VisibleSkyObject[] {
  const planets: VisibleSkyObject[] = currentPlanetPositions(
    now,
    observer,
  )
    .filter((planet) => planet.id !== 'sun' && planet.el >= 0)
    .map((planet) => ({
      id: planet.id,
      kind: 'planet' as const,
      name: planet.name,
      color: planet.color,
      altitude: planet.el,
      azimuth: planet.az,
      detail:
        planet.id === 'moon'
          ? 'Moon'
          : 'Solar System planet',
    }));

  const stars: VisibleSkyObject[] = BRIGHT_STARS
    .filter((star) => star.mag <= BRIGHT_EVENT_STAR_LIMIT)
    .map((star) => ({
      star,
      horizontal: raDecToAltAz(
        star.ra,
        star.dec,
        now,
        observer,
      ),
    }))
    .filter(({ horizontal }) => horizontal.el >= 0)
    .sort((a, b) => a.star.mag - b.star.mag)
    .slice(0, 14)
    .map(({ star, horizontal }) => ({
      id: star.id,
      kind: 'star' as const,
      name: star.name,
      color: star.color,
      altitude: horizontal.el,
      azimuth: horizontal.az,
      detail: `Star · mag ${star.mag.toFixed(2)}`,
    }));

  return [...planets, ...stars].sort(
    (a, b) => b.altitude - a.altitude,
  );
}

export function upcomingHorizonEvents(
  observer: Observer,
  startTime: number,
): HorizonEvent[] {
  const stepMs = EVENT_STEP_MINUTES * 60_000;
  const sampleCount = Math.ceil(
    (EVENT_HOURS * 60) / EVENT_STEP_MINUTES,
  );
  const times = Array.from(
    { length: sampleCount + 1 },
    (_, index) => startTime + index * stepMs,
  );

  const events: HorizonEvent[] = [];

  const planetSamples = times.map((time) => ({
    time,
    positions: currentPlanetPositions(time, observer),
  }));

  const planetIds = Object.keys(PLANET_INFO) as PlanetId[];

  for (const id of planetIds) {
    const samples: TimedAltAz[] = planetSamples.map(
      ({ time, positions }) => {
        const position = positions.find(
          (item) => item.id === id,
        );

        return {
          time,
          az: position?.az ?? 0,
          el: position?.el ?? -90,
        };
      },
    );

    const crossing = firstHorizonCrossing(samples);
    if (!crossing) continue;

    const info = PLANET_INFO[id];
    events.push({
      id: `planet:${id}:${crossing.type}`,
      objectId: id,
      objectKind: 'planet',
      name: info.name,
      color: info.color,
      ...crossing,
    });
  }

  const eventStars = BRIGHT_STARS.filter(
    (star) => star.mag <= BRIGHT_EVENT_STAR_LIMIT,
  );

  for (const star of eventStars) {
    const samples: TimedAltAz[] = times.map((time) => ({
      time,
      ...raDecToAltAz(
        star.ra,
        star.dec,
        time,
        observer,
      ),
    }));

    const crossing = firstHorizonCrossing(samples);
    if (!crossing) continue;

    events.push({
      id: `star:${star.id}:${crossing.type}`,
      objectId: star.id,
      objectKind: 'star',
      name: star.name,
      color: star.color,
      ...crossing,
    });
  }

  return events
    .filter((event) => event.time >= startTime)
    .sort((a, b) => a.time - b.time)
    .slice(0, 18);
}

export function eventTitle(event: HorizonEvent) {
  if (event.objectId === 'sun') {
    return event.type === 'set' ? 'Sunset' : 'Sunrise';
  }

  return `${event.name} ${event.type === 'rise' ? 'rises' : 'sets'}`;
}
