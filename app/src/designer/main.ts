import './style.css';
import { loadLemmixData } from '../data.ts';
import { POWER_CARD_LIBRARY } from '../run/power-cards/catalogue.ts';
import { POWER_CARD_EFFECTS } from '../run/content.ts';
import { LEMMING_ANIMS, type LemmingAnim } from '../run/power-cards/animations.ts';
import { artBounds, drawPowerCard, powerCardAssets, powerCardFrameCount, type PowerCardAssets } from '../run/power-cards/render.ts';
import {
  ICONS,
  MAX_ART_LAYERS,
  POWER_CARD_VERSION,
  lemmingFrame,
  newArtwork,
  newPowerCard,
  parsePowerCardLibrary,
  type PowerCardArt,
  type PowerCardLibrary,
  type Rarity,
} from '../run/power-cards/schema.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);
const select = (id: string) => $<HTMLSelectElement>(id);
const STORAGE = 'lemmatro-power-card-designer-v1';
const rarityColors = { common: '#009dff', uncommon: '#4bc292', rare: '#fe5f55' };
let library: PowerCardLibrary = structuredClone(POWER_CARD_LIBRARY);
let selected = 0;
let selectedLayer = 0;
let assets: PowerCardAssets;
let playing = true;
let frame = 0;
let valid = true;
let storageAvailable = true;
const card = () => library.cards[selected];
const art = () => card().appearance.layers[selectedLayer];
const preview = $<HTMLCanvasElement>('preview');
const small = $<HTMLCanvasElement>('small-preview');
const ctx = preview.getContext('2d')!;
const smallCtx = small.getContext('2d')!;

function status(message: string, error = false): void {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
}
function validate(): boolean {
  try {
    parsePowerCardLibrary(library);
    if (!$<HTMLFormElement>('properties').checkValidity()) throw new Error('Please correct the highlighted field before exporting or switching cards.');
    valid = true;
  } catch (e) {
    valid = false;
    status((e as Error).message, true);
  }
  for (const id of [
    'export-card',
    'export-library',
    'new',
    'duplicate',
    'add-lemming',
    'add-text',
    'add-icon',
    'duplicate-layer',
    'remove-layer',
    'layer-forward',
    'layer-backward',
    'art-type',
  ]) {
    $<HTMLButtonElement>(id).disabled =
      !valid ||
      (['new', 'duplicate'].includes(id) && library.cards.length >= 500) ||
      (['add-lemming', 'add-text', 'add-icon', 'duplicate-layer'].includes(id) && card().appearance.layers.length >= MAX_ART_LAYERS) ||
      (id === 'remove-layer' && card().appearance.layers.length === 1) ||
      (id === 'layer-forward' && selectedLayer === card().appearance.layers.length - 1) ||
      (id === 'layer-backward' && selectedLayer === 0);
  }
  return valid;
}
function changed(): void {
  updatePreviewText();
  if (!validate()) return;
  try {
    localStorage.setItem(STORAGE, JSON.stringify(library));
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }
  status(
    storageAvailable
      ? 'Draft saved in this browser. Export JSON to use it elsewhere.'
      : 'Browser storage is unavailable. Export JSON before leaving this page.',
    !storageAvailable,
  );
  renderList();
  renderLayers();
}
function uniqueId(base = 'new-card'): string {
  let id = base,
    suffix = 2;
  while (library.cards.some((c) => c.id === id)) id = `${base}-${suffix++}`;
  return id;
}
function renderList(): void {
  const list = $('card-list');
  const scroll = list.scrollTop;
  list.replaceChildren();
  const search = input('search').value.toLowerCase();
  library.cards.forEach((c, i) => {
    if (!`${c.name} ${c.id}`.toLowerCase().includes(search)) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-current', String(i === selected));
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.backgroundColor = rarityColors[c.rarity];
    button.append(dot, document.createTextNode(c.name || '(unnamed card)'));
    button.addEventListener('click', () => {
      if (!validate()) return;
      selected = i;
      selectedLayer = 0;
      showCard();
    });
    list.append(button);
  });
  list.scrollTop = scroll;
  $('count').textContent = String(library.cards.length);
}
function updatePreviewText(): void {
  const c = card();
  $('price-preview').textContent = `$${Number.isFinite(c.price) ? c.price : '—'}`;
  $('name-preview').textContent = c.name || 'Untitled card';
  $('description-preview').textContent = c.description || 'Your description will appear here as the in-game tooltip.';
  const badge = $('rarity-preview');
  badge.textContent = c.rarity[0].toUpperCase() + c.rarity.slice(1);
  badge.style.backgroundColor = rarityColors[c.rarity];
  badge.style.color = '#102022';
  $('effect-state').textContent = Object.hasOwn(POWER_CARD_EFFECTS, c.id) ? 'Existing effect' : 'Draft · effect pending';
}
function palette(): void {
  const host = $('palette');
  host.replaceChildren();
  const current = art();
  $<HTMLButtonElement>('reset-colors').disabled = current.type !== 'lemming';
  if (current.type !== 'lemming') return;
  for (const from of assets.palette(current.animation)) {
    const row = document.createElement('label');
    row.className = 'palette-row';
    const original = document.createElement('i');
    original.className = 'original';
    original.style.backgroundColor = from;
    const caption = document.createElement('span');
    caption.textContent = from;
    const picker = document.createElement('input');
    picker.type = 'color';
    picker.value = current.colors[from] ?? from;
    picker.setAttribute('aria-label', `Replace ${from}`);
    picker.addEventListener('input', () => {
      current.colors[from] = picker.value;
      changed();
    });
    row.append(original, caption, picker);
    host.append(row);
  }
}
function syncTransform(): void {
  const a = art();
  for (const key of ['x', 'y', 'scale'] as const) input(key).value = String(a[key]);
  input('scale-number').value = String(a.scale);
}
function layerName(layer: PowerCardArt): string {
  if (layer.type === 'text') return `Text · ${layer.text || '(empty)'}`;
  if (layer.type === 'icon') return `Icon · ${layer.icon}`;
  return `${assets.animation(layer.animation).meta.description.replace('(rtl)', '(left)')} · ${layer.playback === 'fixed' ? `frame ${layer.frame + 1}` : 'animated'}`;
}
function renderLayers(): void {
  const host = $('layer-list'),
    scroll = host.scrollTop;
  host.replaceChildren();
  card()
    .appearance.layers.map((layer, index) => ({ layer, index }))
    .reverse()
    .forEach(({ layer, index }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.layer = String(index);
      button.textContent = `${index + 1}. ${layerName(layer)}`;
      button.setAttribute('aria-current', String(index === selectedLayer));
      button.addEventListener('click', () => {
        if (!validate()) return;
        selectedLayer = index;
        showLayer();
      });
      host.append(button);
    });
  host.scrollTop = scroll;
}
function showLayer(): void {
  const a = art();
  select('art-type').value = a.type;
  for (const [id, type] of [
    ['lemming-properties', 'lemming'],
    ['text-properties', 'text'],
    ['icon-properties', 'icon'],
    ['sprite-colors', 'lemming'],
  ]) {
    const fieldset = $<HTMLFieldSetElement>(id);
    fieldset.hidden = fieldset.disabled = a.type !== type;
  }
  if (a.type === 'lemming') {
    select('animation').value = a.animation;
    select('layer-playback').value = a.playback;
    input('pose-frame').max = String(LEMMING_ANIMS[a.animation][1]);
    input('pose-frame').value = String(a.frame + 1);
    input('pose-frame').disabled = a.playback !== 'fixed';
    $('pose-frame-label').textContent = `${a.frame + 1} / ${LEMMING_ANIMS[a.animation][1]}`;
  } else if (a.type === 'text') {
    input('art-text').value = a.text;
    input('art-text-color').value = a.color;
  } else select('art-icon').value = a.icon;
  syncTransform();
  palette();
  renderLayers();
  validate();
}
function showCard(): void {
  const c = card();
  selectedLayer = Math.min(selectedLayer, c.appearance.layers.length - 1);
  input('name').value = c.name;
  input('price').value = String(c.price);
  select('rarity').value = c.rarity;
  $<HTMLTextAreaElement>('description').value = c.description;
  input('card-id').value = c.id;
  input('card-id').disabled = Object.hasOwn(POWER_CARD_EFFECTS, c.id);
  $('id-hint').textContent = input('card-id').disabled
    ? 'This ID links the existing gameplay effect. Duplicate to create a new design.'
    : 'A stable, unique ID for this design. New cards stay out of shops until their effect is implemented.';
  input('background').value = c.appearance.background;
  input('border').value = c.appearance.border;
  showLayer();
  renderList();
  updatePreviewText();
  frame = 0;
  input('frame').max = String(powerCardFrameCount(c) - 1);
  validate();
}

function exportJSON(all: boolean): void {
  if (!validate()) return;
  const doc = parsePowerCardLibrary({ version: POWER_CARD_VERSION, cards: all ? library.cards : [card()] });
  const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2) + '\n'], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = all ? 'catalogue.json' : `${card().id}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status(`Exported ${all ? `${doc.cards.length} cards` : card().name}.`);
}
async function importFile(file: File): Promise<void> {
  try {
    if (file.size > 2_000_000) throw new Error('The JSON file is too large (maximum 2 MB).');
    const incoming = parsePowerCardLibrary(JSON.parse(await file.text()));
    const duplicates = incoming.cards.filter((c) => library.cards.some((old) => old.id === c.id));
    if (
      (!valid || duplicates.length) &&
      !confirm(
        `Import ${incoming.cards.length} cards? ${duplicates.length} matching IDs will be replaced. Other cards are kept.${!valid ? ' The current invalid edit will be discarded.' : ''}`,
      )
    )
      return;
    // An invalid edit must not prevent recovery by importing a valid library.
    const base = valid ? library : parsePowerCardLibrary(JSON.parse(localStorage.getItem(STORAGE) ?? JSON.stringify(POWER_CARD_LIBRARY)));
    const merged = new Map(base.cards.map((c) => [c.id, c]));
    for (const c of incoming.cards) merged.set(c.id, c);
    const next = parsePowerCardLibrary({ version: POWER_CARD_VERSION, cards: [...merged.values()] });
    library = next;
    selected = library.cards.findIndex((c) => c.id === incoming.cards[0].id);
    selectedLayer = 0;
    showCard();
    changed();
    status(`Imported ${incoming.cards.length} cards. Matching IDs replaced; other designs kept.`);
  } catch (e) {
    status(`Import failed: ${(e as Error).message} Your library has not been replaced.`, true);
  }
}

function bind(): void {
  $('properties').addEventListener('submit', (e) => e.preventDefault());
  input('search').addEventListener('input', renderList);
  input('name').addEventListener('input', () => {
    card().name = input('name').value;
    changed();
  });
  input('card-id').addEventListener('input', () => {
    card().id = input('card-id').value;
    changed();
  });
  input('price').addEventListener('input', () => {
    card().price = input('price').valueAsNumber;
    changed();
  });
  select('rarity').addEventListener('change', () => {
    card().rarity = select('rarity').value as Rarity;
    changed();
  });
  $('description').addEventListener('input', () => {
    card().description = $<HTMLTextAreaElement>('description').value;
    changed();
  });
  for (const key of ['background', 'border'] as const)
    input(key).addEventListener('input', () => {
      card().appearance[key] = input(key).value;
      changed();
    });
  select('animation').addEventListener('change', () => {
    const a = art();
    if (a.type !== 'lemming') return;
    a.animation = select('animation').value as LemmingAnim;
    a.frame = Math.min(a.frame, LEMMING_ANIMS[a.animation][1] - 1);
    showLayer();
    changed();
  });
  select('layer-playback').addEventListener('change', () => {
    const a = art();
    if (a.type !== 'lemming') return;
    a.playback = select('layer-playback').value as 'animated' | 'fixed';
    showLayer();
    changed();
  });
  input('pose-frame').addEventListener('input', () => {
    const a = art();
    if (a.type !== 'lemming') return;
    a.frame = input('pose-frame').valueAsNumber - 1;
    $('pose-frame-label').textContent = `${a.frame + 1} / ${LEMMING_ANIMS[a.animation][1]}`;
    changed();
  });
  $('freeze-pose').addEventListener('click', () => {
    const a = art();
    if (a.type !== 'lemming') return;
    a.frame = lemmingFrame(a, frame);
    a.playback = 'fixed';
    showLayer();
    changed();
  });
  input('art-text').addEventListener('input', () => {
    const a = art();
    if (a.type === 'text') {
      a.text = input('art-text').value;
      changed();
    }
  });
  input('art-text-color').addEventListener('input', () => {
    const a = art();
    if (a.type === 'text') {
      a.color = input('art-text-color').value;
      changed();
    }
  });
  select('art-icon').addEventListener('change', () => {
    const a = art();
    if (a.type === 'icon') {
      a.icon = select('art-icon').value as typeof a.icon;
      changed();
    }
  });
  select('art-type').addEventListener('change', () => {
    if (!valid) return;
    const a = art(),
      replacement = newArtwork(select('art-type').value as PowerCardArt['type']);
    Object.assign(replacement, { scale: a.scale, x: a.x, y: a.y });
    card().appearance.layers[selectedLayer] = replacement;
    showLayer();
    changed();
  });
  for (const type of ['lemming', 'text', 'icon'] as const)
    $('add-' + type).addEventListener('click', () => {
      if (!validate() || card().appearance.layers.length >= MAX_ART_LAYERS) return;
      card().appearance.layers.push(newArtwork(type));
      selectedLayer = card().appearance.layers.length - 1;
      showLayer();
      changed();
    });
  $('duplicate-layer').addEventListener('click', () => {
    if (!validate() || card().appearance.layers.length >= MAX_ART_LAYERS) return;
    card().appearance.layers.splice(selectedLayer + 1, 0, structuredClone(art()));
    selectedLayer++;
    showLayer();
    changed();
  });
  $('remove-layer').addEventListener('click', () => {
    if (!validate() || card().appearance.layers.length === 1) return;
    card().appearance.layers.splice(selectedLayer, 1);
    selectedLayer = Math.max(0, selectedLayer - 1);
    showLayer();
    changed();
  });
  for (const [id, direction] of [
    ['layer-forward', 1],
    ['layer-backward', -1],
  ] as const)
    $(id).addEventListener('click', () => {
      if (!validate()) return;
      const layers = card().appearance.layers,
        to = selectedLayer + direction;
      if (to < 0 || to >= layers.length) return;
      [layers[selectedLayer], layers[to]] = [layers[to], layers[selectedLayer]];
      selectedLayer = to;
      showLayer();
      changed();
    });
  for (const id of ['scale', 'scale-number', 'x', 'y'])
    input(id).addEventListener('input', () => {
      const field = input(id);
      if (!field.validity.valid || !Number.isFinite(field.valueAsNumber)) {
        validate();
        return;
      }
      art()[id === 'scale-number' ? 'scale' : (id as 'scale' | 'x' | 'y')] = field.valueAsNumber;
      syncTransform();
      changed();
    });
  $('center').addEventListener('click', () => {
    art().x = art().y = 0;
    syncTransform();
    changed();
  });
  $('reset-colors').addEventListener('click', () => {
    const a = art();
    if (a.type === 'lemming') {
      a.colors = {};
      palette();
      changed();
    }
  });
  $('new').addEventListener('click', () => {
    if (!validate()) return;
    library.cards.push(newPowerCard(uniqueId()));
    selected = library.cards.length - 1;
    selectedLayer = 0;
    showCard();
    changed();
    input('name').focus();
    input('name').select();
  });
  $('duplicate').addEventListener('click', () => {
    if (!validate()) return;
    const copy = structuredClone(card());
    copy.id = uniqueId(`${copy.id.slice(0, 50)}-copy`);
    copy.name = `${copy.name.slice(0, 73)} (copy)`;
    library.cards.push(copy);
    selected = library.cards.length - 1;
    selectedLayer = 0;
    showCard();
    changed();
  });
  $('restore').addEventListener('click', () => {
    if (confirm('Replace this browser’s draft library with the shipped cards? Export any designs you want to keep first.')) {
      library = structuredClone(POWER_CARD_LIBRARY);
      selected = 0;
      selectedLayer = 0;
      showCard();
      changed();
    }
  });
  $('export-card').addEventListener('click', () => exportJSON(false));
  $('export-library').addEventListener('click', () => exportJSON(true));
  $('import').addEventListener('click', () => input('file').click());
  input('file').addEventListener('change', () => {
    const file = input('file').files?.[0];
    input('file').value = '';
    if (file) void importFile(file);
  });
  $('play').addEventListener('click', () => {
    playing = !playing;
    $('play').textContent = playing ? 'Pause' : 'Play';
    $('play').setAttribute('aria-pressed', String(playing));
  });
  input('frame').addEventListener('input', () => {
    playing = false;
    $('play').textContent = 'Play';
    $('play').setAttribute('aria-pressed', 'false');
    frame = input('frame').valueAsNumber;
  });
  let drag: { id: number; px: number; py: number; x: number; y: number; layer: PowerCardArt } | null = null;
  preview.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (!validate()) return;
    const rect = preview.getBoundingClientRect(),
      px = ((e.clientX - rect.x) * 66) / rect.width,
      py = ((e.clientY - rect.y) * 88) / rect.height;
    if (px >= 4 && px < 62 && py >= 4 && py < 84) {
      const layers = card().appearance.layers;
      for (let i = layers.length - 1; i >= 0; i--) {
        const bounds = artBounds(assets, layers[i]);
        if (px >= bounds.x && px < bounds.x + bounds.w && py >= bounds.y && py < bounds.y + bounds.h) {
          selectedLayer = i;
          showLayer();
          break;
        }
      }
    }
    preview.focus();
    preview.setPointerCapture(e.pointerId);
    const a = art();
    drag = { id: e.pointerId, px: e.clientX, py: e.clientY, x: a.x, y: a.y, layer: a };
  });
  preview.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const rect = preview.getBoundingClientRect(),
      a = drag.layer;
    a.x = Math.max(-66, Math.min(66, Math.round((drag.x + ((e.clientX - drag.px) * 66) / rect.width) * 4) / 4));
    a.y = Math.max(-88, Math.min(88, Math.round((drag.y + ((e.clientY - drag.py) * 88) / rect.height) * 4) / 4));
    syncTransform();
    changed();
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
    preview.addEventListener(event, () => {
      drag = null;
    });
  preview.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const a = art(),
      n = e.shiftKey ? 5 : 1;
    a.x = Math.max(-66, Math.min(66, a.x + (e.key === 'ArrowLeft' ? -n : e.key === 'ArrowRight' ? n : 0)));
    a.y = Math.max(-88, Math.min(88, a.y + (e.key === 'ArrowUp' ? -n : e.key === 'ArrowDown' ? n : 0)));
    syncTransform();
    changed();
  });
  window.addEventListener('beforeunload', (e) => {
    if (!valid || !storageAvailable) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

async function start(): Promise<void> {
  const data = await loadLemmixData();
  assets = powerCardAssets(data.provider);
  for (const name of Object.keys(LEMMING_ANIMS) as LemmingAnim[]) {
    const meta = assets.animation(name).meta;
    select('animation').add(new Option(meta.description.replace('(rtl)', '(left)') + ` · ${meta.frameCount} frame${meta.frameCount === 1 ? '' : 's'}`, name));
  }
  for (const icon of ICONS) select('art-icon').add(new Option(icon[0].toUpperCase() + icon.slice(1), icon));
  let recovered = false;
  try {
    const saved = localStorage.getItem(STORAGE);
    if (saved) {
      library = parsePowerCardLibrary(JSON.parse(saved));
      recovered = true;
    }
  } catch {
    status('The saved draft could not be loaded. Shipped cards are shown; import an exported JSON to recover it.', true);
  }
  bind();
  showCard();
  $('workspace').inert = false;
  if (!$('status').classList.contains('error')) status(recovered ? 'Restored your saved draft library.' : 'Ready. Choose a card or create a new one.');
  let last = 0;
  function draw(now: number): void {
    const count = powerCardFrameCount(card());
    if (playing && now - last >= 1000 / 12) {
      frame++;
      last = now;
    }
    ctx.save();
    ctx.scale(4, 4);
    drawPowerCard(ctx, card(), assets, frame);
    const bounds = artBounds(assets, art());
    ctx.strokeStyle = '#f3ba62';
    ctx.lineWidth = 0.35;
    ctx.setLineDash([1, 1]);
    ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
    ctx.restore();
    drawPowerCard(smallCtx, card(), assets, frame);
    input('frame').max = String(count - 1);
    input('frame').value = String(frame % count);
    $('frame-label').textContent = `${(frame % count) + 1} / ${count}`;
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
}
start().catch((e) => status(`Could not load the designer: ${(e as Error).message}. Reload to try again.`, true));
