import { compareSessionNames, getSessionNameSuggestions, isValidSessionName, normalizeSessionName } from './session-name.util';

describe('Shared session names', () => {
  it('normalizes numbered races and legacy names', () => {
    for (const [input, expected] of [
      ['race7', 'Race 7'], ['r10', 'Race 10'], [' RACE   25 ', 'Race 25'],
      ['race1', 'Race 1'], ['practice', 'Practice 1'], ['testsession', 'Test Session'], ['qualify', 'Qualifying']
    ]) {
      expect(normalizeSessionName(input)).toBe(expected);
      expect(isValidSessionName(input)).toBeTrue();
    }
  });

  it('rejects invalid numbers and names longer than the database column', () => {
    for (const input of ['', 'Race 0', 'Race -1', 'Race 01', 'Race 1.5', 'Race abc', `Race ${'9'.repeat(96)}`]) {
      expect(isValidSessionName(input)).withContext(input).toBeFalse();
    }
  });

  it('sorts race numbers naturally, including names with class suffixes', () => {
    expect(['Race 10', 'Race 7', 'Race 2'].sort(compareSessionNames)).toEqual(['Race 2', 'Race 7', 'Race 10']);
    expect(compareSessionNames('Race 7 ( a )', 'Race 10 ( a )')).toBeLessThan(0);
  });

  it('offers typed custom races without duplicating presets', () => {
    expect(getSessionNameSuggestions('Race 10')).toEqual(['Race 10']);
    expect(getSessionNameSuggestions('Race 6')).toEqual(['Race 6']);
  });
});
