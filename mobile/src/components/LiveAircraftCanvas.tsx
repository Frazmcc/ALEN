import {
  memo,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Canvas,
  Circle,
  Line,
  vec,
} from '@shopify/react-native-skia';
import type { Observer } from '@/sky/astronomy';
import type { Viewport } from '@/sky/projection';
import { projectAltAz } from '@/sky/projection';
import {
  airborneAltAz,
  aircraftDepthCue,
  destinationPoint,
  predictAircraft,
  type AircraftTrack,
  type AircraftVisualType,
} from '@/live/aircraftMotion';

type Props = {
  tracks: AircraftTrack[];
  observer: Observer;
  viewport: Viewport;
  visible: boolean;
};

type DrawAircraft = {
  id: string;
  x: number;
  y: number;
  angle: number;
  size: number;
  opacity: number;
  color: string;
  visualType: AircraftVisualType;
};

function aircraftShape(
  aircraft: DrawAircraft,
) {
  const forward = {
    x: Math.sin(aircraft.angle),
    y: -Math.cos(aircraft.angle),
  };
  const right = {
    x: Math.cos(aircraft.angle),
    y: Math.sin(aircraft.angle),
  };
  const size = aircraft.size;

  const point = (forwardScale: number, rightScale: number) =>
    vec(
      aircraft.x +
        forward.x * size * forwardScale +
        right.x * size * rightScale,
      aircraft.y +
        forward.y * size * forwardScale +
        right.y * size * rightScale,
    );

  if (aircraft.visualType === 'helicopter') {
    return {
      body: [point(-0.65, 0), point(0.65, 0)] as const,
      wing: [point(0, -0.85), point(0, 0.85)] as const,
      tail: [point(-0.65, -0.42), point(-0.65, 0.42)] as const,
    };
  }

  if (aircraft.visualType === 'glider') {
    return {
      body: [point(-0.55, 0), point(0.85, 0)] as const,
      wing: [point(0.05, -1.15), point(0.05, 1.15)] as const,
      tail: [point(-0.45, -0.35), point(-0.45, 0.35)] as const,
    };
  }

  if (aircraft.visualType === 'military') {
    return {
      body: [point(-0.6, 0), point(1, 0)] as const,
      wing: [point(-0.05, -0.8), point(-0.05, 0.8)] as const,
      tail: [point(-0.5, -0.42), point(-0.5, 0.42)] as const,
    };
  }

  if (aircraft.visualType === 'light') {
    return {
      body: [point(-0.6, 0), point(0.85, 0)] as const,
      wing: [point(0, -0.65), point(0, 0.65)] as const,
      tail: [point(-0.45, -0.28), point(-0.45, 0.28)] as const,
    };
  }

  if (
    aircraft.visualType === 'balloon' ||
    aircraft.visualType === 'drone'
  ) {
    return {
      body: [point(-0.45, 0), point(0.45, 0)] as const,
      wing: [point(0, -0.55), point(0, 0.55)] as const,
      tail: [point(-0.25, -0.3), point(0.25, 0.3)] as const,
    };
  }

  const wingScale =
    aircraft.visualType === 'turboprop' ? 0.78 : 0.95;

  return {
    body: [point(-0.7, 0), point(1, 0)] as const,
    wing: [point(0, -wingScale), point(0, wingScale)] as const,
    tail: [point(-0.52, -0.38), point(-0.52, 0.38)] as const,
  };
}

export const LiveAircraftCanvas = memo(function LiveAircraftCanvas({
  tracks,
  observer,
  viewport,
  visible,
}: Props) {
  const [frameNow, setFrameNow] = useState(Date.now());

  useEffect(() => {
    if (!visible || !tracks.length) return;

    let frame = 0;
    let lastUpdate = 0;

    const animate = (timestamp: number) => {
      if (timestamp - lastUpdate >= 33) {
        lastUpdate = timestamp;
        setFrameNow(Date.now());
      }
      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frame);
  }, [tracks.length, visible]);

  const aircraft = useMemo(() => {
    if (!visible) return [];

    return tracks.flatMap((track) => {
      const predicted = predictAircraft(track, frameNow);
      const horizontal = airborneAltAz(
        observer,
        predicted.lat,
        predicted.lon,
        predicted.altM,
      );

      if (horizontal.el < 0) return [];

      const point = projectAltAz(
        horizontal.az,
        horizontal.el,
        viewport,
      );
      if (!point) return [];

      const lookAheadKm = Math.max(
        0.8,
        Math.min(
          6,
          (Math.max(0, predicted.gs) * 1.852 * 18) / 3600,
        ),
      );
      const ahead = destinationPoint(
        predicted.lat,
        predicted.lon,
        predicted.track,
        lookAheadKm,
      );
      const aheadHorizontal = airborneAltAz(
        observer,
        ahead.lat,
        ahead.lon,
        predicted.altM,
      );
      const aheadPoint = projectAltAz(
        aheadHorizontal.az,
        aheadHorizontal.el,
        viewport,
      );

      const angle = aheadPoint
        ? Math.atan2(
            aheadPoint.x - point.x,
            -(aheadPoint.y - point.y),
          )
        : 0;
      const depth = aircraftDepthCue(horizontal.slantRangeKm);

      return [{
        id: track.id,
        x: point.x,
        y: point.y,
        angle,
        size: depth.size,
        opacity: depth.opacity,
        color: track.color,
        visualType: track.visualType,
      } satisfies DrawAircraft];
    });
  }, [frameNow, observer, tracks, viewport, visible]);

  if (!visible || !aircraft.length) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Canvas style={StyleSheet.absoluteFill}>
        {aircraft.map((item) => {
          const shape = aircraftShape(item);
          const width =
            item.visualType === 'military' ? 2 : 1.55;

          return (
            <>
              <Circle
                key={`halo-${item.id}`}
                cx={item.x}
                cy={item.y}
                r={item.size * 1.35}
                color={item.color}
                opacity={item.opacity * 0.1}
              />
              <Line
                key={`body-${item.id}`}
                p1={shape.body[0]}
                p2={shape.body[1]}
                color={item.color}
                opacity={item.opacity}
                strokeWidth={width}
              />
              <Line
                key={`wing-${item.id}`}
                p1={shape.wing[0]}
                p2={shape.wing[1]}
                color={item.color}
                opacity={item.opacity}
                strokeWidth={width}
              />
              <Line
                key={`tail-${item.id}`}
                p1={shape.tail[0]}
                p2={shape.tail[1]}
                color={item.color}
                opacity={item.opacity}
                strokeWidth={Math.max(1, width - 0.3)}
              />
            </>
          );
        })}
      </Canvas>
    </View>
  );
});
