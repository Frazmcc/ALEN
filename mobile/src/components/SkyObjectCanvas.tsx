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
import type { LiveAircraft, LiveSatellite } from '@/live/liveObjects';

export type RenderedStar = Star & {
  az: number;
  el: number;
};

type Props = {
  stars: RenderedStar[];
  planets: PlanetPosition[];
  aircraft: LiveAircraft[];
  satellites: LiveSatellite[];
  viewport: Viewport;
  starVisibility: number;
  showStars: boolean;
  showConstellations: boolean;
  showPlanets: boolean;
  showAtmosphere: boolean;
  showLandscape: boolean;
  showAircraft: boolean;
  showSatellites: boolean;
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
  aircraft,
  satellites,
  viewport,
  starVisibility,
  showStars,
  showConstellations,
  showPlanets,
  showAtmosphere,
  showLandscape,
  showAircraft,
  showSatellites,
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


  const projectedSatellites = useMemo(
    () =>
      satellites.flatMap((satellite) => {
        if (!showSatellites || satellite.el < 0) return [];

        const point = projectAltAz(
          satellite.az,
          satellite.el,
          viewport,
        );
        if (!point) return [];

        return [{
          ...point,
          id: satellite.id,
          color: satellite.color,
          radius: satellite.radius,
          halo: satellite.halo,
          opacity: satellite.opacity,
        }];
      }),
    [satellites, showSatellites, viewport],
  );

  const projectedAircraft = useMemo(
    () =>
      aircraft.flatMap((item) => {
        if (!showAircraft || item.el < 0) return [];

        const point = projectAltAz(item.az, item.el, viewport);
        if (!point) return [];

        const ahead = projectAltAz(item.nextAz, item.nextEl, viewport);
        let headingX = point.x;
        let headingY = point.y - 7;

        if (ahead) {
          const dx = ahead.x - point.x;
          const dy = ahead.y - point.y;
          const length = Math.hypot(dx, dy);
          if (length > 0.001) {
            headingX = point.x + (dx / length) * 8;
            headingY = point.y + (dy / length) * 8;
          }
        }

        const near = 1 - clamp(item.slantRangeKm / 85, 0, 1);

        return [{
          ...point,
          id: item.id,
          color: item.color,
          headingX,
          headingY,
          radius: 2.1 + near * 1.2,
        }];
      }),
    [aircraft, showAircraft, viewport],
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


        {projectedSatellites.map((satellite) => (
          <Circle
            key={`satellite-halo-${satellite.id}`}
            cx={satellite.x}
            cy={satellite.y}
            r={satellite.halo}
            color={satellite.color}
            opacity={satellite.opacity * 0.2}
          />
        ))}
        {projectedSatellites.map((satellite) => (
          <Circle
            key={satellite.id}
            cx={satellite.x}
            cy={satellite.y}
            r={satellite.radius}
            color={satellite.color}
            opacity={satellite.opacity}
          />
        ))}

        {projectedAircraft.map((item) => (
          <Line
            key={`aircraft-heading-${item.id}`}
            p1={vec(item.x, item.y)}
            p2={vec(item.headingX, item.headingY)}
            color={item.color}
            opacity={0.9}
            strokeWidth={1.4}
          />
        ))}
        {projectedAircraft.map((item) => (
          <Circle
            key={item.id}
            cx={item.x}
            cy={item.y}
            r={item.radius}
            color={item.color}
            opacity={0.96}
          />
        ))}

        {showLandscape ? (
          <>
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
          </>
        ) : null}
      </Canvas>
    </View>
  );
});
