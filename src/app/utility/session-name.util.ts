export const SESSION_NAME_OPTIONS = [
  'Practice 1', 'Practice 2', 'Practice 3', 'Practice 4', 'Practice 5',
  'Race 1', 'Race 2', 'Race 3', 'Race 4', 'Race 5', 'Race 6',
  'Test Session', 'Qualifying'
];

/** Canonical labels for new writes, with support for legacy API aliases. */
export function normalizeSessionName(raw: unknown): string {
  const value = String(raw ?? '').replace(/\s+/g, ' ').trim();
  const race = /^(?:race\s*|r)([1-9]\d*)$/i.exec(value);
  if (race) return `Race ${race[1]}`;
  if (/^practice$/i.test(value)) return 'Practice 1';
  if (/^test\s*session$/i.test(value)) return 'Test Session';
  if (/^(qualifying|qualification|qualify)$/i.test(value)) return 'Qualifying';
  return SESSION_NAME_OPTIONS.find(name => name.toLowerCase() === value.toLowerCase()) ?? value;
}

export function isValidSessionName(raw: unknown): boolean {
  const value = normalizeSessionName(raw);
  // Matches the database's varchar(100) limit.
  return value.length <= 100 && (/^Race [1-9]\d*$/.test(value) || SESSION_NAME_OPTIONS.includes(value));
}

export function getSessionNameSuggestions(raw: unknown, presets = SESSION_NAME_OPTIONS): string[] {
  const keyword = String(raw ?? '').trim().toLowerCase();
  const options = presets.filter(name => name.toLowerCase().includes(keyword));
  const normalized = normalizeSessionName(raw);
  if (isValidSessionName(normalized) && !options.includes(normalized)) options.push(normalized);
  return options;
}

export function compareSessionNames(a: unknown, b: unknown): number {
  return normalizeSessionName(a).localeCompare(normalizeSessionName(b), 'en', { numeric: true, sensitivity: 'base' });
}
