// The tiny page the phone opens (via the QR code) to pick and send the file.
// Served at GET /u/:token; it POSTs the file back to the same URL.
export const UPLOAD_PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>WordSync — Send dictionary</title>
  <style>
    body { font: 16px system-ui, sans-serif; margin: 0; display: grid; place-items: center; min-height: 100vh; background: #f6f7f9; color: #202124; }
    main { width: min(420px, 90vw); padding: 24px; background: #fff; border-radius: 14px; box-shadow: 0 4px 24px rgba(0,0,0,.08); text-align: center; }
    h1 { font-size: 20px; margin: 0 0 8px; }
    p { opacity: .7; margin: 0 0 20px; }
    input[type=file] { display: block; margin: 0 auto 16px; }
    button { font: inherit; padding: 12px 20px; border: 0; border-radius: 10px; background: #1a73e8; color: #fff; cursor: pointer; }
    button:disabled { opacity: .5; }
    #status { margin-top: 16px; font-weight: 600; min-height: 1.2em; }
  </style>
</head>
<body>
  <main>
    <h1>Send your dictionary</h1>
    <p>Pick the <code>dictionary.txt</code> you exported from Gboard.</p>
    <input type="file" id="file" accept=".txt,text/plain" />
    <button id="send">Send to browser</button>
    <div id="status"></div>
  </main>
  <script>
    const file = document.getElementById('file');
    const send = document.getElementById('send');
    const status = document.getElementById('status');
    send.addEventListener('click', async () => {
      const f = file.files && file.files[0];
      if (!f) { status.textContent = 'Choose a file first.'; return; }
      send.disabled = true;
      status.textContent = 'Sending…';
      try {
        const res = await fetch(location.pathname, {
          method: 'POST',
          headers: { 'Content-Type': f.type || 'text/plain' },
          body: f,
        });
        status.textContent = res.ok ? 'Sent! Return to your computer.' : 'Failed — try again.';
        if (!res.ok) send.disabled = false;
      } catch (e) {
        status.textContent = 'Network error — try again.';
        send.disabled = false;
      }
    });
  </script>
</body>
</html>`;
