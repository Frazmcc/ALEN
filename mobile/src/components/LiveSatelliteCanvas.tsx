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
} from '@shopify/react-native-skia';
import type { Viewport } from '@/sky/projection';
import { projectAltAz } from '@/sky/projection';
import {
  sampleTrajectory,
  satelliteDepthCue,
  type SatelliteTrack,
} from '@/live/satelliteMotion';
import { colors } from '@/theme/colors';

type Props = {
  tracks: SatelliteTrack[];
  viewport: Viewport;
  visible: boolean;
  selectedId?: string;
};

export const LiveSatelliteCanvas = memo(function LiveSatelliteCanvas({
  tracks,
  viewport,
  visible,
  selectedId,
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

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [tracks.length, visible]);

  const points = useMemo(() => {
    if (!visible) return [];

    return tracks.flatMap((track) => {
      const elapsed =
        track.sampleAgeMs +
        Math.max(0, frameNow - track.receivedAtMs);
      const sample = sampleTrajectory(track.trajectory, elapsed);

      if (!sample || sample.el < 0) return [];

      const point = projectAltAz(
        sample.az,
        sample.el,
        viewport,
      );
      if (!point) return [];

      return [{
        id: track.id,
        ...point,
        color: track.color,
        rangeKm: sample.rangeKm,
        depth: satelliteDepthCue(sample.rangeKm),
        selected: track.id === selectedId,
      }];
    }).sort((a, b) => b.rangeKm - a.rangeKm);
  }, [frameNow, selectedId, tracks, viewport, visible]);

  if (!visible || !tracks.length) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Canvas style={StyleSheet.absoluteFill}>
        {points.map((satellite) => (
          <Circle
            key={`halo-${satellite.id}`}
            cx={satellite.x}
            cy={satellite.y}
            r={satellite.depth.halo}
            color={satellite.color}
            opacity={satellite.depth.opacity * 0.2}
          />
        ))}
        {points.map((satellite) => (
          <Circle
            key={satellite.id}
            cx={satellite.x}
            cy={satellite.y}
            r={satellite.depth.radius}
            color={satellite.color}
            opacity={satellite.depth.opacity}
          />
        ))}
        {points
          .filter((satellite) => satellite.selected)
          .map((satellite) => (
            <Circle
              key={`selected-${satellite.id}`}
              cx={satellite.x}
              cy={satellite.y}
              r={satellite.depth.halo + 5}
              color={colors.accent}
              opacity={0.95}
              style="stroke"
              strokeWidth={2}
            />
          ))}
      </Canvas>
    </View>
  );
});
