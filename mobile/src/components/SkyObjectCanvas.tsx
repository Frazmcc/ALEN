import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Canvas,
  Circle,
  Fill,
  LinearGradient,
  Path,
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
import { CONSTELLATION_LINES } from '@/sky/constellations';

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
  targetKind,
  targetId,
  horizonY,
  skyColors,
}: Props) {
  const projectedStars = useMemo(
    () =>
      stars.flatMap((star) => {
        if (!showStars || star.el < 0 || starVisibility <= 0.02) return [];

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
    [showStars, starVisibility, stars, targetId, targetKind, viewport],
  );

  const projectedConstellations = useMemo(() => {
    if (!showConstellations || starVisibility <= 0.02) return [];

    const byId = new Map(stars.map((star) => [star.id, star]));

    return CONSTELLATION_LINES.flatMap((chain, index) => {
      const commands: string[] = [];
      let penDown = false;
      let segmentCount = 0;

      for (const id of chain) {
        const star = byId.get(id);
        if (!star || star.el < 0) {
          penDown = false;
          continue;
        }

        const point = projectAltAz(star.az, star.el, viewport);
        if (!point) {
          penDown = false;
          continue;
        }

        if (penDown) {
          commands.push(`L ${point.x} ${point.y}`);
          segmentCount += 1;
        } else {
          commands.push(`M ${point.x} ${point.y}`);
          penDown = true;
        }
      }

      return segmentCount > 0
        ? [{ id: `constellation-${index}`, path: commands.join(' ') }]
        : [];
    });
  }, [showConstellations, starVisibility, stars, viewport]);

  const projectedPlanets = useMemo(
    () =>
      planets.flatMap((planet) => {
        if (!showPlanets || planet.el < 0) return [];

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
    [planets, showPlanets, targetId, targetKind, viewport],
  );

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Canvas style={StyleSheet.absoluteFill}>
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

        {projectedConstellations.map((constellation) => (
          <Path
            key={constellation.id}
            path={constellation.path}
            color="#73a0be"
            opacity={clamp(starVisibility * 0.42, 0, 0.34)}
            style="stroke"
            strokeWidth={0.9}
          />
        ))}

        {projectedStars.map((star) => (
          <Circle
            key={star.id}
            cx={star.x}
            cy={star.y}
            r={star.radius}
            color={star.color}
            opacity={star.opacity}
          />
        ))}

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

        {projectedPlanets.map((planet) => (
          <Circle
            key={planet.id}
            cx={planet.x}
            cy={planet.y}
            r={planet.radius}
            color={planet.color}
          />
        ))}

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

        <Rect
          x={0}
          y={Math.max(0, horizonY)}
          width={Math.max(1, viewport.width)}
          height={Math.max(0, viewport.height - horizonY)}
          color="#03080b"
        />
        <Rect
          x={0}
          y={Math.max(0, horizonY - 1)}
          width={Math.max(1, viewport.width)}
          height={2}
          color={skyColors.horizon}
          opacity={0.7}
        />
      </Canvas>
    </View>
  );
});
