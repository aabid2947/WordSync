import { browser } from 'wxt/browser';

/**
 * User settings. Stored in `chrome.storage.local` (NOT localStorage) so the
 * service worker, popup, options, and content scripts can all read/write and
 * receive change events. See CLAUDE.md §5.
 */
export interface Settings {
  /** WebLLM model id (CP9). */
  model: string;
  /** Whether the LLM path is enabled (auto-disabled on unsupported hardware). */
  useLLM: boolean;
  /** Suggestion strip placement. */
  stripPosition: 'caret' | 'anchored';
  /** How many suggestions to show. */
  suggestionCount: number;
  /** Whether a Gboard dictionary has been imported. */
  gboardSynced: boolean;
  /** Hostnames where suggestions are disabled (per-site opt-out, CP10). */
  siteDenylist: string[];
  /** Whether onboarding has completed. */
  onboarded: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  model: 'Qwen2.5-0.5B-Instruct-q4f16_1',
  useLLM: true,
  stripPosition: 'caret',
  suggestionCount: 3,
  gboardSynced: false,
  siteDenylist: [],
  onboarded: false,
};

const KEY = 'settings';

export async function getSettings(): Promise<Settings> {
  const stored = (await browser.storage.local.get(KEY))[KEY] as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function patchSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await browser.storage.local.set({ [KEY]: next });
  return next;
}

/** Whether suggestions are disabled for `host`. */
export function isHostDenied(denylist: string[], host: string): boolean {
  return host.length > 0 && denylist.includes(host);
}

/** Add or remove `host` from the denylist (pure; returns a new array). */
export function toggleHost(denylist: string[], host: string): string[] {
  if (!host) return denylist;
  return denylist.includes(host) ? denylist.filter((h) => h !== host) : [...denylist, host];
}

/** Subscribe to settings changes across contexts. Returns an unsubscribe fn. */
export function watchSettings(callback: (settings: Settings) => void): () => void {
  const listener = (
    changes: Record<string, { newValue?: unknown }>,
    areaName: string,
  ): void => {
    if (areaName !== 'local' || !changes[KEY]) return;
    callback({ ...DEFAULT_SETTINGS, ...(changes[KEY].newValue as Partial<Settings>) });
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
