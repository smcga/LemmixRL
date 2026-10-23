import { LEMMING_ANIMS, type LemmingAnim } from './animations.ts';

export const POWER_CARD_VERSION = 2;
export const MAX_ART_LAYERS = 16;
export const POWER_CARD_WIDTH = 66;
export const POWER_CARD_HEIGHT = 88;
export const RARITIES = ['common', 'uncommon', 'rare', 'legendary'] as const;
export type Rarity = (typeof RARITIES)[number];
export const ICONS = ['climber', 'floater', 'bomber', 'blocker', 'builder', 'basher', 'miner', 'digger', 'slower', 'faster', 'pause', 'nuke'] as const;

/** Positions are offsets from the centre, in 66 x 88 card pixels. Scale is pixels per source pixel. */
type Transform = { scale: number; x: number; y: number };
export type PowerCardArt = Transform &
  (
    | { type: 'lemming'; animation: LemmingAnim; colors: Record<string, string>; playback: 'animated' | 'fixed'; frame: number }
    | { type: 'icon'; icon: (typeof ICONS)[number] }
    | { type: 'text'; text: string; color: string }
  );
export interface PowerCardDesign {
  id: string;
  name: string;
  rarity: Rarity;
  price: number;
  description: string;
  /** Layers paint back to front; each lemming has an independent palette and playback setting. */
  appearance: { background: string; border: string; layers: PowerCardArt[] };
}
export interface PowerCardLibrary {
  version: 2;
  cards: PowerCardDesign[];
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path}: expected an object.`);
  return value as Record<string, unknown>;
}
function keys(obj: Record<string, unknown>, allowed: string[], path: string): void {
  for (const key of Object.keys(obj)) if (!allowed.includes(key)) throw new Error(`${path}: unknown field "${key}".`);
}
function str(value: unknown, path: string, max: number, empty = false): string {
  if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > max)
    throw new Error(`${path}: expected ${empty ? 'up to' : '1–'}${max} characters.`);
  return value;
}
function num(value: unknown, path: string, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value)))
    throw new Error(`${path}: expected ${integer ? 'a whole number' : 'a number'} from ${min} to ${max}.`);
  return value;
}
function color(value: unknown, path: string): string {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${path}: use a six-digit hex colour, such as #44cc88.`);
  return value.toLowerCase();
}

function parseArt(value: unknown, p: string, legacy: boolean): PowerCardArt {
  const raw = record(value, p);
  const transform = {
    scale: num(raw.scale, `${p} scale`, 0.25, 12),
    x: num(raw.x, `${p} horizontal offset`, -66, 66),
    y: num(raw.y, `${p} vertical offset`, -88, 88),
  };
  if (raw.type === 'lemming') {
    keys(raw, ['type', 'animation', 'colors', 'scale', 'x', 'y', ...(legacy ? [] : ['playback', 'frame'])], p);
    if (typeof raw.animation !== 'string' || !Object.hasOwn(LEMMING_ANIMS, raw.animation)) throw new Error(`${p}: unknown lemming animation.`);
    const mapping = record(raw.colors, `${p} sprite colours`);
    if (Object.keys(mapping).length > 256) throw new Error(`${p}: too many sprite colours.`);
    const colors: Record<string, string> = {};
    for (const [from, to] of Object.entries(mapping)) {
      const key = color(from, `${p} source colour`);
      if (Object.hasOwn(colors, key)) throw new Error(`${p}: duplicate source colour ${key}.`);
      colors[key] = color(to, `${p} replacement colour`);
    }
    const animation = raw.animation as LemmingAnim;
    if (!legacy && raw.playback !== 'animated' && raw.playback !== 'fixed') throw new Error(`${p}: choose animated or fixed playback.`);
    return {
      type: 'lemming',
      animation,
      colors,
      ...transform,
      playback: legacy ? 'animated' : (raw.playback as 'animated' | 'fixed'),
      frame: legacy ? 0 : num(raw.frame, `${p} frame`, 0, LEMMING_ANIMS[animation][1] - 1, true),
    };
  }
  if (raw.type === 'icon') {
    keys(raw, ['type', 'icon', 'scale', 'x', 'y'], p);
    if (!ICONS.includes(raw.icon as (typeof ICONS)[number])) throw new Error(`${p}: unknown icon.`);
    return { type: 'icon', icon: raw.icon as (typeof ICONS)[number], ...transform };
  }
  if (raw.type === 'text') {
    keys(raw, ['type', 'text', 'color', 'scale', 'x', 'y'], p);
    return { type: 'text', text: str(raw.text, `${p} artwork text`, 16), color: color(raw.color, `${p} text colour`), ...transform };
  }
  throw new Error(`${p}: unknown artwork type.`);
}

/** Validate before replacing a draft. Version 1 exports and browser drafts migrate without losing artwork. */
export function parsePowerCardLibrary(input: unknown): PowerCardLibrary {
  const doc = record(input, 'Library');
  keys(doc, ['version', 'cards'], 'Library');
  if (doc.version !== 1 && doc.version !== POWER_CARD_VERSION) throw new Error('Unsupported library version. Expected version 1 or 2.');
  const legacy = doc.version === 1;
  if (!Array.isArray(doc.cards) || !doc.cards.length || doc.cards.length > 500) throw new Error('Library must contain 1–500 cards.');
  const ids = new Set<string>();
  const cards = doc.cards.map((value, i): PowerCardDesign => {
    const p = `Card ${i + 1}`;
    const c = record(value, p);
    keys(c, ['id', 'name', 'rarity', 'price', 'description', 'appearance'], p);
    const id = str(c.id, `${p} ID`, 64);
    if (!/^[a-z][a-z0-9_-]*$/.test(id)) throw new Error(`${p} ID: use lowercase letters, numbers, hyphens or underscores, starting with a letter.`);
    if (ids.has(id)) throw new Error(`Duplicate card ID: ${id}.`);
    ids.add(id);
    if (!RARITIES.includes(c.rarity as Rarity)) throw new Error(`${p}: unknown rarity.`);
    const a = record(c.appearance, `${p} appearance`);
    keys(a, ['background', 'border', legacy ? 'art' : 'layers'], `${p} appearance`);
    const values = legacy ? [a.art] : a.layers;
    if (!Array.isArray(values) || !values.length || values.length > MAX_ART_LAYERS) throw new Error(`${p}: use 1–${MAX_ART_LAYERS} artwork layers.`);
    const layers = values.map((value, index) => parseArt(value, `${p} layer ${index + 1}`, legacy));
    return {
      id,
      name: str(c.name, `${p} name`, 80),
      rarity: c.rarity as Rarity,
      price: num(c.price, `${p} price`, 0, 999, true),
      description: str(c.description, `${p} description`, 1000, true),
      appearance: { background: color(a.background, `${p} background`), border: color(a.border, `${p} border`), layers },
    };
  });
  return { version: POWER_CARD_VERSION, cards };
}

export function newArtwork(type: PowerCardArt['type'] = 'lemming'): PowerCardArt {
  const transform = { scale: 3, x: 0, y: 0 };
  if (type === 'text') return { type, text: '+5', color: '#f3b958', ...transform };
  if (type === 'icon') return { type, icon: 'builder', ...transform, scale: 2 };
  return { type, animation: 'walk', colors: {}, playback: 'animated', frame: 0, ...transform };
}

export function lemmingFrame(art: Extract<PowerCardArt, { type: 'lemming' }>, tick: number): number {
  return art.playback === 'fixed' ? art.frame : Math.max(0, Math.floor(tick)) % LEMMING_ANIMS[art.animation][1];
}

export function newPowerCard(id: string): PowerCardDesign {
  return {
    id,
    name: 'New Power Card',
    rarity: 'common',
    price: 4,
    description: '',
    appearance: { background: '#123e49', border: '#f4f1e6', layers: [newArtwork()] },
  };
}
