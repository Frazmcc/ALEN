import { clamp } from '@/sky/astronomy';

const DEG = Math.PI / 180;

export type Viewport = {
  width: number;
  height: number;
  yaw: number;
  pitch: number;
  fov: number;
};

export function projectAltAz(
  azimuth: number,
  elevation: number,
  viewport: Viewport,
) {
  const { width, height, yaw, pitch } = viewport;
  if (width <= 0 || height <= 0) return null;

  const azr = azimuth * DEG;
  const elr = elevation * DEG;
  const yawr = yaw * DEG;
  const pitchr = pitch * DEG;

  const target = [
    Math.cos(elr) * Math.sin(azr),
    Math.cos(elr) * Math.cos(azr),
    Math.sin(elr),
  ];
  const forward = [
    Math.cos(pitchr) * Math.sin(yawr),
    Math.cos(pitchr) * Math.cos(yawr),
    Math.sin(pitchr),
  ];
  const right = [Math.cos(yawr), -Math.sin(yawr), 0];
  const up = [
    -Math.sin(yawr) * Math.sin(pitchr),
    -Math.cos(yawr) * Math.sin(pitchr),
    Math.cos(pitchr),
  ];

  const z =
    target[0] * forward[0] +
    target[1] * forward[1] +
    target[2] * forward[2];

  if (z <= 0) return null;

  const x = target[0] * right[0] + target[1] * right[1];
  const y = target[0] * up[0] + target[1] * up[1] + target[2] * up[2];

  const hfov = clamp(viewport.fov, 1, 170) * DEG;
  const vfov =
    2 * Math.atan(Math.tan(hfov / 2) * height / Math.max(width, 1));

  const nx = x / (z * Math.tan(hfov / 2));
  const ny = y / (z * Math.tan(vfov / 2));

  if (Math.abs(nx) > 1.08 || Math.abs(ny) > 1.08) return null;

  return {
    x: width * 0.5 + nx * width * 0.5,
    y: height * 0.5 - ny * height * 0.5,
  };
}
