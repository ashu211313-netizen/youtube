export const YOUTUBE_24H_WINDOW_MS = 24 * 60 * 60 * 1000;

type CapturePolicyInput = {
  storedViews24: number | null | undefined;
  capturedAt: string | null | undefined;
  previousSyncedAt: string | null | undefined;
  publishedAt: string | null | undefined;
  currentViews: number | null;
  now: number;
};

function parseTime(value: string | null | undefined): number {
  if (!value) return Number.NaN;
  return new Date(value).getTime();
}

export function hasStored24HourViews(
  value: number | null | undefined,
): boolean {
  return value !== null && value !== undefined;
}

export function shouldCapture24HourViews({
  storedViews24,
  capturedAt,
  previousSyncedAt,
  publishedAt,
  currentViews,
  now,
}: CapturePolicyInput): boolean {
  if (
    hasStored24HourViews(storedViews24) ||
    capturedAt ||
    currentViews === null ||
    !Number.isFinite(currentViews)
  ) {
    return false;
  }

  const publishedTime = parseTime(publishedAt);
  const previousSyncTime = parseTime(previousSyncedAt);
  if (!Number.isFinite(publishedTime) || !Number.isFinite(previousSyncTime)) {
    return false;
  }

  const captureDeadline = publishedTime + YOUTUBE_24H_WINDOW_MS;
  return previousSyncTime <= captureDeadline && now >= captureDeadline;
}
