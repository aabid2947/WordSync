import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { DEFAULT_SETTINGS, getSettings, patchSettings, watchSettings } from './settings';

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
