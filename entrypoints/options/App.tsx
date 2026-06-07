import { useEffect, useState } from 'preact/hooks';
import {
  DEFAULT_SETTINGS,
  getSettings,
  patchSettings,
  type Settings,
} from '../../lib/storage/settings';
import type { WordRow } from '../../lib/storage/types';
import { sendMessage } from '../../utils/messages';

const PAGE = 100;

function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function App() {
  return (
    <main class="options">
      <h1>WordSync</h1>
      <SettingsSection />
      <WordSection />
    </main>
  );
}

function SettingsSection() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  useEffect(() => {
    void getSettings().then(setSettings);
  }, []);
  const update = async (patch: Partial<Settings>) => setSettings(await patchSettings(patch));

  return (
    <section class="card">
      <h2>Settings</h2>
      <label class="row">
        <span>Local AI model (WebLLM)</span>
        <input
          type="checkbox"
          checked={settings.useLLM}
          onChange={() => void update({ useLLM: !settings.useLLM })}
        />
      </label>
      <label class="row">
        <span>Model</span>
        <input
          type="text"
          value={settings.model}
          onChange={(e) => void update({ model: (e.target as HTMLInputElement).value })}
        />
      </label>
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
    </section>
  );
}

function WordSection() {
  const [query, setQuery] = useState('');
  const [words, setWords] = useState<WordRow[]>([]);
  const [total, setTotal] = useState(0);

  async function load(q: string, offset: number): Promise<void> {
    const page = await sendMessage('listWords', { query: q, limit: PAGE, offset });
    setTotal(page.total);
    setWords((prev) => (offset === 0 ? page.words : [...prev, ...page.words]));
  }

  useEffect(() => {
    void load(query, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function remove(word: string): Promise<void> {
    await sendMessage('deleteWord', word);
    setWords((prev) => prev.filter((w) => w.word !== word));
    setTotal((t) => Math.max(0, t - 1));
  }

  async function exportAll(): Promise<void> {
    const { words: all } = await sendMessage('exportWords', undefined);
    const tsv = all.map((w) => `${w.word}\t${w.count}`).join('\n');
    downloadText('wordsync-dictionary.txt', tsv);
  }

  async function reset(): Promise<void> {
    if (!confirm('Delete all learned words and n-grams? This cannot be undone.')) return;
    await sendMessage('clearData', undefined);
    setWords([]);
    setTotal(0);
  }

  return (
    <section class="card">
      <div class="words-head">
        <h2>Your words ({total.toLocaleString()})</h2>
        <div class="word-actions">
          <button onClick={() => void exportAll()}>Export</button>
          <button class="danger" onClick={() => void reset()}>Reset all</button>
        </div>
      </div>

      <input
        class="search"
        type="search"
        placeholder="Search words…"
        value={query}
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
      />

      {words.length === 0 ? (
        <p class="empty">No words yet — start typing on any site, or import from Gboard.</p>
      ) : (
        <ul class="word-list">
          {words.map((w) => (
            <li key={w.word}>
              <span class="w">{w.word}</span>
              <span class="meta">
                {w.count} · {w.source}
              </span>
              <button class="del" title="Delete" onClick={() => void remove(w.word)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {words.length < total && (
        <button class="more" onClick={() => void load(query, words.length)}>
          Load more
        </button>
      )}
    </section>
  );
}
