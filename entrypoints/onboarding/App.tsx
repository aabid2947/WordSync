import { useEffect, useState } from 'preact/hooks';
import { parseGboardDictionary } from '../../lib/gboard/parse';
import { createSession, pollForFile } from '../../lib/relay/client';
import { patchSettings } from '../../lib/storage/settings';
import { sendMessage } from '../../utils/messages';
import { QrCode } from './QrCode';

type Step = 'export' | 'scan' | 'done';

async function finish(gboardSynced: boolean): Promise<void> {
  await patchSettings({ onboarded: true, gboardSynced }).catch(() => {});
  window.close();
}

export function App() {
  const [step, setStep] = useState<Step>('export');
  const [imported, setImported] = useState(0);

  return (
    <main class="onboard">
      <header>
        <h1>WordSync</h1>
        <Dots step={step} />
      </header>

      {step === 'export' && <ExportStep onNext={() => setStep('scan')} onSkip={() => finish(false)} />}
      {step === 'scan' && (
        <ScanStep
          onImported={(n) => {
            setImported(n);
            setStep('done');
          }}
          onSkip={() => finish(false)}
        />
      )}
      {step === 'done' && <DoneStep imported={imported} onDone={() => finish(true)} />}
    </main>
  );
}

function Dots({ step }: { step: Step }) {
  const order: Step[] = ['export', 'scan', 'done'];
  const active = order.indexOf(step);
  return (
    <div class="dots" aria-hidden="true">
      {order.map((s, i) => (
        <span key={s} class={i <= active ? 'dot on' : 'dot'} />
      ))}
    </div>
  );
}

function ExportStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const path = 'Gboard Settings › Dictionary › Personal Dictionary › ⋮ › Export';
  return (
    <section>
      <h2>Step 1 — Export from Gboard</h2>
      <p>On your phone, export your personal dictionary:</p>
      <ol class="path">
        <li>Open <b>Gboard settings</b></li>
        <li>Tap <b>Dictionary → Personal Dictionary</b></li>
        <li>Tap <b>⋮ → Export</b> to save <code>dictionary.txt</code></li>
      </ol>
      <button class="link" onClick={() => void navigator.clipboard?.writeText(path).catch(() => {})}>
        Copy these steps
      </button>
      <div class="actions">
        <button class="ghost" onClick={onSkip}>Skip — set up later</button>
        <button class="primary" onClick={onNext}>I've exported it</button>
      </div>
    </section>
  );
}

function ScanStep({
  onImported,
  onSkip,
}: {
  onImported: (count: number) => void;
  onSkip: () => void;
}) {
  const [uploadUrl, setUploadUrl] = useState<string | null>(null);
  const [status, setStatus] = useState('Connecting to the transfer relay…');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const session = await createSession();
        setUploadUrl(session.uploadUrl);
        setStatus('Scan the code, then pick dictionary.txt on your phone.');
        const text = await pollForFile(session.token, { signal: ctrl.signal });
        setStatus('Importing…');
        const parsed = parseGboardDictionary(text);
        const { imported } = await sendMessage('seed', parsed.entries.map((e) => e.word));
        await patchSettings({ gboardSynced: true }).catch(() => {});
        onImported(imported);
      } catch {
        if (!ctrl.signal.aborted) {
          setError('Couldn’t reach the transfer relay. You can skip and import later from Settings.');
        }
      }
    })();
    return () => ctrl.abort();
  }, []);

  return (
    <section>
      <h2>Step 2 — Scan to transfer</h2>
      {error ? (
        <p class="error">{error}</p>
      ) : (
        <>
          <div class="qr">{uploadUrl ? <QrCode value={uploadUrl} /> : <div class="qr-placeholder" />}</div>
          <p class="status">{status}</p>
        </>
      )}
      <div class="actions">
        <button class="ghost" onClick={onSkip}>Skip — set up later</button>
      </div>
    </section>
  );
}

function DoneStep({ imported, onDone }: { imported: number; onDone: () => void }) {
  return (
    <section>
      <h2>Step 3 — All set</h2>
      <p class="big">{imported.toLocaleString()} words imported</p>
      <p>WordSync is active. Suggestions appear as you type in any text field.</p>
      <div class="actions">
        <button class="primary" onClick={onDone}>Start typing</button>
      </div>
    </section>
  );
}
