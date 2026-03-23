export function isSessionExpired(params: {
  lastActivityAt: number;
  timeoutMinutes: number;
  now?: number;
}) {
  const now = params.now ?? Date.now();
  return now - params.lastActivityAt > params.timeoutMinutes * 60 * 1_000;
}
