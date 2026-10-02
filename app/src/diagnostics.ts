/**
 * ?diag (LemmixRL): a small overlay with what the browser reports for the things a check on a phone needs: the build,
 * the screen and its safe area, the input, full screen and the sideways lock, the wake lock, the audio and the last
 * pointer events. It takes no touches. `?diag` turns it on (also for the next visits), `?diag=0` off again.
 */
import { getApp } from './scenes/shared.ts';
import { canFullscreen, deviceStatus, pixelRatio, safeAreaInsets, touch } from './touch.ts';
import { wakeLockStatus } from './wakelock.ts';

const STORAGE_KEY = 'lemmix.diag';

function wanted(): boolean {
  const q = new URLSearchParams(location.search).get('diag');
  try {
    if (q === '0') localStorage.removeItem(STORAGE_KEY);
    else if (q !== null) localStorage.setItem(STORAGE_KEY, '1');
    return q === null ? localStorage.getItem(STORAGE_KEY) === '1' : q !== '0';
  } catch {
    return q !== null && q !== '0';
  }
}

export function initDiagnostics(): void {
  if (!wanted()) return;
  const el = document.createElement('pre');
  el.style.cssText =
    'position:fixed;left:calc(env(safe-area-inset-left) + 4px);top:calc(env(safe-area-inset-top) + 4px);margin:0;' +
    'padding:4px 6px;font:10px/1.35 monospace;color:#d8ffd8;background:rgba(0,0,0,0.7);pointer-events:none;z-index:10;' +
    'white-space:pre;max-width:70vw;overflow:hidden;';
  document.body.appendChild(el);
  const events: string[] = [];
  for (const type of ['pointerdown', 'pointerup', 'pointercancel'])
    window.addEventListener(
      type,
      (e) => {
        events.unshift(`${e.type.slice(7)}/${(e as PointerEvent).pointerType}`);
        events.length = Math.min(events.length, 4);
      },
      true,
    );
  const update = () => {
    const r = pixelRatio();
    const ins = safeAreaInsets();
    const canvas = document.querySelector('canvas');
    const mode = ['fullscreen', 'standalone', 'minimal-ui', 'browser'].find((m) => matchMedia(`(display-mode: ${m})`).matches) ?? '-';
    const iPhoneApp = (navigator as { standalone?: boolean }).standalone === true;
    let audio = '-';
    try {
      audio = getApp().sound.context.state;
    } catch {
      // still loading
    }
    el.textContent = [
      `build ${import.meta.env.VITE_BUILD ?? 'dev'}`,
      `screen ${innerWidth}x${innerHeight} css, ratio ${r}, canvas ${canvas ? `${canvas.width}x${canvas.height}` : '-'}`,
      `safe area top ${ins.top / r} right ${ins.right / r} bottom ${ins.bottom / r} left ${ins.left / r} (css)`,
      `orientation ${screen.orientation?.type ?? '-'}, display ${mode}${iPhoneApp ? ' (home screen app)' : ''}`,
      `input ${touch.active ? 'touch' : 'mouse'}; ${events.join(' ') || 'no pointer events yet'}`,
      `fullscreen ${document.fullscreenElement ? 'on' : 'off'} (${canFullscreen() ? 'available' : 'not available'}), last ${deviceStatus.fullscreen}`,
      `sideways lock ${deviceStatus.orientationLock}`,
      `wake lock ${wakeLockStatus()}`,
      `audio ${audio}`,
    ].join('\n');
  };
  update();
  setInterval(update, 500);
}
