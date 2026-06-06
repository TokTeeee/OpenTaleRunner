export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

export function formatWorldDay(day: number): string {
  return `世界日第${day}天`;
}

export function generateId(): string {
  return 'id_' + Math.random().toString(36).slice(2, 11);
}
