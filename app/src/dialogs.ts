/**
 * The Windows dialogs of the menu screen, as DOM dialogs: GameScreen.Options (F4: choose the style) and
 * GameScreen.Config (F5: game options, optional mechanics, other options).
 */
import { GameOption, MiscOption, OptionalMechanic, STYLE_DESCRIPTIONS, STYLE_NAMES, StyleDef } from '../../engine/src/index.ts';
import type { Config } from './config.ts';

function dialog(title: string): { body: HTMLDivElement; footer: HTMLDivElement; close: () => void; closed: Promise<void> } {
  const back = document.createElement('div');
  back.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;z-index:10;';
  const box = document.createElement('div');
  box.style.cssText =
    'background:#101018;color:#d0d0e0;border:1px solid #6060a0;padding:16px 20px;max-width:92vw;max-height:88vh;overflow:auto;font:14px/1.5 Segoe UI,Arial,sans-serif;';
  const h = document.createElement('div');
  h.textContent = title;
  h.style.cssText = 'font-weight:bold;font-size:16px;color:#fff;margin-bottom:12px;';
  const body = document.createElement('div');
  const footer = document.createElement('div');
  footer.style.cssText = 'margin-top:14px;display:flex;gap:8px;justify-content:flex-end;';
  box.append(h, body, footer);
  back.appendChild(box);
  document.body.appendChild(back);
  let resolveClosed: () => void = () => {};
  const closed = new Promise<void>((r) => (resolveClosed = r));
  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') close();
  };
  const close = () => {
    window.removeEventListener('keydown', onKey, true);
    back.remove();
    resolveClosed();
  };
  window.addEventListener('keydown', onKey, true);
  back.addEventListener('pointerdown', (e) => e.stopPropagation());
  return { body, footer, close, closed };
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = text;
  b.style.cssText = 'background:#303060;color:#fff;border:1px solid #6060a0;padding:4px 14px;cursor:pointer;font:inherit;';
  b.addEventListener('click', onClick);
  return b;
}

/** F4: returns the chosen style name, or null when nothing changed. */
export async function chooseStyle(current: string): Promise<string | null> {
  const d = dialog('Style');
  let chosen: string | null = null;
  for (let def = StyleDef.Orig; def <= StyleDef.X92; def++) {
    const name = STYLE_NAMES[def];
    const b = button(`${name} - ${STYLE_DESCRIPTIONS[def]}`, () => {
      chosen = name === current ? null : name;
      d.close();
    });
    b.style.display = 'block';
    b.style.width = '100%';
    b.style.textAlign = 'left';
    b.style.marginBottom = '6px';
    if (name === current) b.style.borderColor = '#e0e0ff';
    d.body.appendChild(b);
  }
  d.footer.appendChild(button('Cancel', d.close));
  await d.closed;
  return chosen;
}

function splitCamel(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

function checkboxes<T extends number>(parent: HTMLElement, title: string, e: Record<string, string | number>, values: readonly T[], set: Set<T>): void {
  const fs = document.createElement('fieldset');
  fs.style.cssText = 'border:1px solid #404070;margin:0 0 10px;padding:6px 10px;';
  const lg = document.createElement('legend');
  lg.textContent = title;
  fs.appendChild(lg);
  for (const v of values) {
    const label = document.createElement('label');
    label.style.cssText = 'display:block;cursor:pointer;';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = set.has(v);
    cb.addEventListener('change', () => (cb.checked ? set.add(v) : set.delete(v)));
    label.append(cb, ' ' + splitCamel(String(e[v])).replace('Righ Click', 'Right Click'));
    fs.appendChild(label);
  }
  parent.appendChild(fs);
}

function enumValues<T extends number>(e: Record<string, string | number>): T[] {
  return Object.values(e).filter((v): v is T => typeof v === 'number');
}

/** F5: edits the configuration (applied when OK is pressed). */
export async function editConfig(config: Config): Promise<void> {
  const d = dialog('Configuration');
  const gameOptions = new Set(config.gameOptions);
  const mechanics = new Set(config.optionalMechanics);
  const misc = new Set(config.miscOptions);
  // FullCPU and the replay/file options of Lemmix that have no meaning in the browser are left out
  checkboxes(d.body, 'Game options', GameOption, enumValues<GameOption>(GameOption).filter((o) => o !== GameOption.FullCPU), gameOptions);
  checkboxes(d.body, 'Optional mechanics', OptionalMechanic, enumValues<OptionalMechanic>(OptionalMechanic), mechanics);
  checkboxes(
    d.body,
    'Other options',
    MiscOption,
    [
      MiscOption.AdjustLogoInMenuScreen,
      MiscOption.CheatCodesInLevelCodeScreen,
      MiscOption.CheatScrollingInPreviewScreen,
      MiscOption.KeepLevelRatioInPreviewScreen,
      MiscOption.LemmingsPercentages,
      MiscOption.Voice,
    ],
    misc,
  );
  const zoom = document.createElement('label');
  zoom.textContent = 'Zoom factor (0 = as large as possible) ';
  const zi = document.createElement('input');
  zi.type = 'number';
  zi.min = '0';
  zi.max = '15';
  zi.value = String(config.zoomFactor);
  zi.style.width = '4em';
  zoom.appendChild(zi);
  d.body.appendChild(zoom);
  d.footer.append(
    button('OK', () => {
      config.gameOptions = gameOptions;
      config.optionalMechanics = mechanics;
      config.miscOptions = misc;
      const z = Number.parseInt(zi.value, 10);
      if (z >= 0 && z < 16) config.zoomFactor = z;
      config.save();
      d.close();
    }),
    button('Cancel', d.close),
  );
  await d.closed;
}
