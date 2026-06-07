import { useEffect, useState } from 'preact/hooks';
import QRCode from 'qrcode';

/** Renders `value` as a QR code image (data URL). */
export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, { width: size, margin: 1 })
      .then((url) => {
        if (alive) setSrc(url);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [value, size]);

  return src ? (
    <img src={src} width={size} height={size} alt="Scan to upload your dictionary" />
  ) : (
    <div class="qr-placeholder" style={{ width: size, height: size }} />
  );
}
