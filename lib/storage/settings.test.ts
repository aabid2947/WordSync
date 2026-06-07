import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  DEFAULT_SETTINGS,
  getSettings,
  isHostDenied,
  patchSettings,
  toggleHost,
  watchSettings,
} from './settings';

beforeEach(async () => {
  await fakeBrowser.storage.local.clear();
});

describe('settings', () => {
  it('returns defaults when nothing is stored', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('merges a patch over defaults and persists it', async () => {
    await patchSettings({ suggestionCount: 5, gboardSynced: true });
    const s = await getSettings();
    expect(s.suggestionCount).toBe(5);
    expect(s.gboardSynced).toBe(true);
    expect(s.model).toBe(DEFAULT_SETTINGS.model);
  });

  it('notifies watchers on change with merged settings', async () => {
    const seen: number[] = [];
    const unwatch = watchSettings((s) => seen.push(s.suggestionCount));
    await patchSettings({ suggestionCount: 7 });
    unwatch();
    expect(seen).toContain(7);
  });
});

describe('per-site denylist helpers', () => {
  it('isHostDenied reflects membership, ignoring empty host', () => {
    expect(isHostDenied(['a.com'], 'a.com')).toBe(true);
    expect(isHostDenied(['a.com'], 'b.com')).toBe(false);
    expect(isHostDenied(['a.com'], '')).toBe(false);
  });

  it('toggleHost adds then removes a host without mutating the input', () => {
    const start: string[] = [];
    const added = toggleHost(start, 'a.com');
    expect(added).toEqual(['a.com']);
    expect(start).toEqual([]); // pure
    expect(toggleHost(added, 'a.com')).toEqual([]);
  });

  it('toggleHost ignores an empty host', () => {
    expect(toggleHost(['a.com'], '')).toEqual(['a.com']);
  });
});
