import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Canvas,
  Circle,
  Line,
  vec,
} from '@shopify/react-native-skia';
import type { Star } from '@/sky/catalog';
import type { PlanetPosition } from '@/sky/astronomy';
import { CONSTELLATIONS } from '@/sky/constellations';
import {
  projectAltAz,
  type Viewport,
} from '@/sky/projection';

export type ArStar = Star & {
  az: number;
  el: number;
};

type Props = {
  stars: ArStar[];
  planets: PlanetPosition[];
  viewport: Viewport;
};

export const ArOverlayCanvas = memo(function ArOverlayCanvas({
  stars,
  planets,
  viewport,
}: Props) {
  const projectedStars = useMemo(
    () =>
      stars.flatMap((star) => {
        if (star.el < 0) return [];
        const point = projectAltAz(star.az, star.el, viewport);
        if (!point) return [];

        return [{
          ...point,
          id: star.id,
          mag: star.mag,
          color: star.color,
        }];
      }),
    [stars, viewport],
  );

  const constellationSegments = useMemo(() => {
    const byId = new Map(
      projectedStars.map((star) => [star.id, star] as const),
    );

    return CONSTELLATIONS.flatMap((constellation) =>
      constellation.segments.flatMap(([fromId, toId], index) => {
        const from = byId.get(fromId);
        const to = byId.get(toId);
        if (!from || !to) return [];

        return [{
          id: `${constellation.id}-${index}`,
          from,
          to,
        }];
      }),
    );
  }, [projectedStars]);

  const projectedPlanets = useMemo(
    () =>
      planets.flatMap((planet) => {
        if (planet.el < 0) return [];
        const point = projectAltAz(planet.az, planet.el, viewport);
        if (!point) return [];

        return [{
          ...point,
          id: planet.id,
          color: planet.color,
          isSun: planet.id === 'sun',
        }];
      }),
    [planets, viewport],
  );

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Canvas style={StyleSheet.absoluteFill}>
        {constellationSegments.map((segment) => (
          <Line
            key={segment.id}
            p1={vec(segment.from.x, segment.from.y)}
            p2={vec(segment.to.x, segment.to.y)}
            color="#8db8ee"
            opacity={0.34}
            strokeWidth={1}
          />
        ))}

        {projectedStars.map((star) => (
          <Circle
            key={star.id}
            cx={star.x}
            cy={star.y}
            r={Math.max(1.5, 4.8 - Math.max(-1.5, star.mag))}
            color={star.color}
            opacity={0.9}
          />
        ))}

        {projectedPlanets.map((planet) => (
          <Circle
            key={planet.id}
            cx={planet.x}
            cy={planet.y}
            r={planet.isSun ? 9 : 6}
            color={planet.color}
            opacity={0.95}
          />
        ))}
      </Canvas>
    </View>
  );
});
