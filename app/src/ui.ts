/** Small DOM helpers for what Lemmix shows in Windows dialogs: messages, help texts, file selection, downloads. */

function overlay(): { box: HTMLDivElement; done: Promise<void> } {
  const back = document.createElement('div');
  back.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:10;';
  const box = document.createElement('div');
  box.style.cssText =
    'background:#101018;color:#d0d0e0;border:1px solid #6060a0;padding:16px 20px;max-width:90vw;max-height:85vh;overflow:auto;' +
    'font:14px/1.4 Consolas,Menlo,monospace;white-space:pre;';
  back.appendChild(box);
  document.body.appendChild(back);
  const done = new Promise<void>((resolve) => {
    const close = () => {
      window.removeEventListener('keydown', onKey, true);
      back.remove();
      resolve();
    };
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') close();
    };
    window.addEventListener('keydown', onKey, true);
    back.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      close();
    });
  });
  return { box, done };
}

export function showText(title: string, text: string): Promise<void> {
  const { box, done } = overlay();
  const h = document.createElement('div');
  h.textContent = title;
  h.style.cssText = 'font-weight:bold;margin-bottom:10px;color:#ffffff;';
  const t = document.createElement('div');
  t.textContent = text;
  box.append(h, t);
  return done;
}

export function showMessage(text: string): Promise<void> {
  const { box, done } = overlay();
  box.style.whiteSpace = 'pre-wrap';
  box.textContent = text;
  return done;
}

export function selectFile(accept: string): Promise<{ name: string; bytes: Uint8Array } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      void f.arrayBuffer().then((b) => resolve({ name: f.name, bytes: new Uint8Array(b) }));
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

export function download(fileName: string, bytes: Uint8Array, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mimeType }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
