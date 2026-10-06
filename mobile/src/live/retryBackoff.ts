export function retryDelayMs(
  failures: number,
  baseMs: number,
  maxMs: number,
) {
  const attempts = Math.max(1, Math.floor(failures));
  const delay = baseMs * 2 ** (attempts - 1);
  return Math.min(maxMs, delay);
}
