import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Canvas,
  Circle,
  Fill,
  LinearGradient,
  Line,
  Rect,
  vec,
} from '@shopify/react-native-skia';
import type { Star } from '@/sky/catalog';
import type { PlanetPosition } from '@/sky/astronomy';
import {
  projectAltAz,
  type Viewport,
} from '@/sky/projection';
import { clamp } from '@/sky/astronomy';
import { colors } from '@/theme/colors';
import { CONSTELLATIONS } from '@/sky/constellations';

export type RenderedStar = Star & {
  az: number;
  el: number;
};

type Props = {
  stars: RenderedStar[];
  planets: PlanetPosition[];
  viewport: Viewport;
  starVisibility: number;
  showStars: boolean;
  showConstellations: boolean;
  showPlanets: boolean;
  showAtmosphere: boolean;
  showLandscape: boolean;
  targetKind?: string;
  targetId?: string;
  horizonY: number;
  skyColors: {
    top: string;
    middle: string;
    horizon: string;
  };
};

export const SkyObjectCanvas = memo(function SkyObjectCanvas({
  stars,
  planets,
  viewport,
  starVisibility,
  showStars,
  showConstellations,
  showPlanets,
  showAtmosphere,
  showLandscape,
  targetKind,
  targetId,
  horizonY,
  skyColors,
}: Props) {
  const projectedStars = useMemo(
    () =>
      stars.flatMap((star) => {
        if (star.el < 0 || starVisibility <= 0.02) return [];

        const point = projectAltAz(star.az, star.el, viewport);
        if (!point) return [];

        const isTarget =
          targetKind === 'star' && targetId === star.id;
        const diameter = isTarget
          ? 9
          : clamp(4.5 - star.mag, 1.5, 5.5);

        return [
          {
            ...point,
            id: star.id,
            radius: diameter / 2,
            color: star.color,
            opacity: clamp(starVisibility, 0, 1),
            isTarget,
          },
        ];
      }),
    [starVisibility, stars, targetId, targetKind, viewport],
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

        const point = projectAltAz(
          planet.az,
          planet.el,
          viewport,
        );
        if (!point) return [];

        const isTarget =
          targetKind === 'planet' && targetId === planet.id;
        const isSun = planet.id === 'sun';

        return [
          {
            ...point,
            id: planet.id,
            radius: isTarget ? 8 : isSun ? 7 : 4.5,
            color: planet.color,
            isTarget,
          },
        ];
      }),
    [planets, targetId, targetKind, viewport],
  );

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Canvas style={StyleSheet.absoluteFill}>
        {showAtmosphere ? (
          <Fill>
            <LinearGradient
              start={vec(0, 0)}
              end={vec(0, Math.max(1, horizonY))}
              colors={[
                skyColors.top,
                skyColors.middle,
                skyColors.horizon,
              ]}
              positions={[0, 0.58, 1]}
            />
          </Fill>
        ) : (
          <Fill color="#020711" />
        )}

        {showConstellations
          ? constellationSegments.map((segment) => (
              <Line
                key={segment.id}
                p1={vec(segment.from.x, segment.from.y)}
                p2={vec(segment.to.x, segment.to.y)}
                color="#6f9bd1"
                opacity={clamp(starVisibility * 0.58, 0, 0.5)}
                strokeWidth={1}
              />
            ))
          : null}

        {showStars ? projectedStars.map((star) => (
          <Circle
            key={star.id}
            cx={star.x}
            cy={star.y}
            r={star.radius}
            color={star.color}
            opacity={star.opacity}
          />
        )) : null}

        {projectedStars
          .filter((star) => star.isTarget)
          .map((star) => (
            <Circle
              key={`target-star-${star.id}`}
              cx={star.x}
              cy={star.y}
              r={star.radius + 5}
              color={colors.accent}
              opacity={0.38}
              style="stroke"
              strokeWidth={2}
            />
          ))}

        {showPlanets ? projectedPlanets.map((planet) => (
          <Circle
            key={planet.id}
            cx={planet.x}
            cy={planet.y}
            r={planet.radius}
            color={planet.color}
          />
        )) : null}

        {projectedPlanets
          .filter((planet) => planet.isTarget)
          .map((planet) => (
            <Circle
              key={`target-planet-${planet.id}`}
              cx={planet.x}
              cy={planet.y}
              r={planet.radius + 5}
              color={colors.accent}
              opacity={0.45}
              style="stroke"
              strokeWidth={2}
            />
          ))}

        {showLandscape ? (
          <>
            <Rect
              x={0}
              y={Math.max(0, horizonY)}
              width={Math.max(1, viewport.width)}
              height={Math.max(
                1,
                Math.min(
                  96,
                  Math.max(1, viewport.height - horizonY),
                ),
              )}
            >
              <LinearGradient
                start={vec(0, Math.max(0, horizonY))}
                end={vec(
                  0,
                  Math.min(
                    viewport.height,
                    Math.max(0, horizonY) + 96,
                  ),
                )}
                colors={[
                  skyColors.horizon,
                  '#081116',
                  '#03080b',
                ]}
                positions={[0, 0.42, 1]}
              />
            </Rect>
            <Rect
              x={0}
              y={Math.min(
                viewport.height,
                Math.max(0, horizonY) + 96,
              )}
              width={Math.max(1, viewport.width)}
              height={Math.max(
                0,
                viewport.height -
                  Math.min(
                    viewport.height,
                    Math.max(0, horizonY) + 96,
                  ),
              )}
              color="#03080b"
            />
          </>
        ) : null}
      </Canvas>
    </View>
  );
});
