import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import {
  DEFAULT_SETTINGS,
  getSettings,
  isHostDenied,
  patchSettings,
  toggleHost,
  type Settings,
} from '../../lib/storage/settings';
import { sendMessage } from '../../utils/messages';

async function currentHost(): Promise<string> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return tab?.url ? new URL(tab.url).hostname : '';
  } catch {
    return '';
  }
}

export function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [host, setHost] = useState('');
  const [words, setWords] = useState<number | null>(null);

  useEffect(() => {
    void getSettings().then(setSettings);
    void currentHost().then(setHost);
    void sendMessage('getStats', undefined)
      .then((s) => setWords(s.words))
      .catch(() => setWords(null));
  }, []);

  async function update(patch: Partial<Settings>): Promise<void> {
    const next = await patchSettings(patch);
    setSettings(next);
  }

  const siteEnabled = host.length > 0 && !isHostDenied(settings.siteDenylist, host);

  return (
    <main class="popup">
      <header>
        <h1>WordSync</h1>
        {words !== null && <span class="count">{words.toLocaleString()} words</span>}
      </header>

      <Toggle
        label={host ? `Suggestions on ${host}` : 'Suggestions on this site'}
        disabled={host.length === 0}
        checked={siteEnabled}
        onChange={() => void update({ siteDenylist: toggleHost(settings.siteDenylist, host) })}
      />

      <Toggle
        label="Local AI model (WebLLM)"
        hint="Smarter predictions. Downloads a model once."
        checked={settings.useLLM}
        onChange={() => void update({ useLLM: !settings.useLLM })}
      />

      <label class="row">
        <span>Suggestions shown</span>
        <select
          value={String(settings.suggestionCount)}
          onChange={(e) =>
            void update({ suggestionCount: Number((e.target as HTMLSelectElement).value) })
          }
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={String(n)}>
              {n}
            </option>
          ))}
        </select>
      </label>

      <footer>
        <button class="link" onClick={() => void browser.runtime.openOptionsPage().catch(() => {})}>
          Manage words & data →
        </button>
      </footer>
    </main>
  );
}

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <label class={disabled ? 'row toggle disabled' : 'row toggle'}>
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />
    </label>
  );
}
