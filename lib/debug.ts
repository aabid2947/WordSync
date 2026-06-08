// Lightweight, opt-in debug logging. Silent by default. To enable on a page:
//   localStorage['wordsync-debug'] = '1'   (then reload the tab)
let enabled = true; // TEMP: forced on for diagnosis — revert to the localStorage check after.
try {
  enabled = enabled || globalThis.localStorage?.getItem('wordsync-debug') === '1';
} catch {
  // some pages block localStorage access
}

export const DEBUG = enabled;

export function dlog(...args: unknown[]): void {
  if (enabled) console.log('[wordsync]', ...args);
}
