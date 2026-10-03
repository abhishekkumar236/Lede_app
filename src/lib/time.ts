const MINUTE = 60000;
const HOUR = 3600000;
const DAY = 86400000;

export function relativeTime(timestamp: number, now = Date.now()): string {
  if (timestamp <= 0) return '';

  const diff = now - timestamp;
  if (diff < MINUTE) return 'now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d`;

  return new Date(timestamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
