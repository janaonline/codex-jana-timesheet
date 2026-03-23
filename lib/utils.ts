export function cn(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

export function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function safeJsonParse<T>(input: string, fallback: T): T {
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}

export function sanitizeText(input: string | null | undefined) {
  return (input ?? "").trim();
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatHours(hours: number) {
  return Number(hours.toFixed(2)).toString();
}

export function percentage(value: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Number(((value / total) * 100).toFixed(2));
}

export function average(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function groupBy<T, K extends string | number>(
  items: T[],
  keySelector: (item: T) => K,
) {
  return items.reduce<Record<K, T[]>>((accumulator, item) => {
    const key = keySelector(item);
    accumulator[key] ??= [];
    accumulator[key].push(item);
    return accumulator;
  }, {} as Record<K, T[]>);
}
