import { jokerDef, jokerText, POWER_EDITION_NAMES, POWER_EDITION_TEXTS, type PowerEdition } from './content.ts';
import { jokerSellValue, type RunSession } from './session.ts';
import { SKILLS } from './skills.ts';
import { REDRAWS, START_COLONY, type JokerInstance } from './state.ts';

function powerEditionLines(e: PowerEdition | undefined): string[] {
  return e ? ['', `{!}${POWER_EDITION_NAMES[e]}{}: ${POWER_EDITION_TEXTS[e]}`] : [];
}

export function jokerLines(run: RunSession, j: JokerInstance, preview = false): string[] {
  const d = jokerDef(j.id);
  const s = run.state;
  const text = jokerText(d, j, (id) => run.card(id)?.name);
  const now = (v: string) => `{~}(Currently{} ${/^{[+x]}/.test(v) ? v.replace('{}', '{} Rescues') : v}{~}){}`;
  let current: string | null = null;
  switch (j.id) {
    case 'headcount':
      current = `{$}$${Math.floor(s.colony.length / 20)}{}`;
      break;
    case 'personalspace':
      current = `{x}X${Math.max(1, run.jokerSlots() - s.jokers.length)}{}`;
      break;
    case 'elders':
      current = `{x}X${+(1 + 0.2 * s.colony.filter((c) => c.edition === 'wise').length).toFixed(1)}{}`;
      break;
    case 'abstract':
      current = `{+}+${3 * s.jokers.length}{}`;
      break;
    case 'gym':
      current = `{x}X${+(1 + 0.1 * (j.counter ?? 0)).toFixed(1)}{}`;
      break;
    case 'inversecurve':
      current = `{!}-${Math.min(100, s.stats.blindsWon)}%{}`;
      break;
    case 'bootstraps':
      current = `{+}+${2 * Math.floor(Math.max(0, s.money) / 5)}{}`;
      break;
    case 'baseball':
      current = `{x}X${+(1.5 ** s.jokers.filter((x) => jokerDef(x.id).rarity === 'uncommon').length).toFixed(2)}{}`;
      break;
    case 'flashcard':
      current = `{+}+${j.counter ?? 0}{}`;
      break;
    case 'popcorn':
      current = `{+}+${Math.max(0, 20 - 4 * (j.counter ?? 0))}{}`;
      break;
    case 'yorick':
      current = `{x}X${1 + Math.floor((j.counter ?? 0) / 23)}{} (${j.counter ?? 0} lost)`;
      break;
    case 'longservice': {
      const left = 5 - ((j.counter ?? 0) % 6);
      current = left === 0 ? '{x}X3{} this level' : `${left} level${left === 1 ? '' : 's'} to go`;
      break;
    }
    case 'weakestlink':
      current = `{+}+${2 * Math.min(...SKILLS.map((sk) => run.capability()[sk]))}{}`;
      break;
    case 'reserves':
    {
      if (s.setup) current = `{+}+${Math.floor(Math.max(0, s.colony.length - s.setup.hand.length) / 5)}{}`;
    }
      break;
    case 'nothanks':
      current = `{+}+${2 * (j.counter ?? 0)}{}`;
      break;
    case 'stampede':
    case 'campout':
    case 'fragile':
      current = `{x}X${+(1 + 0.25 * (j.counter ?? 0)).toFixed(2)}{}`;
      break;
    case 'bodysnatcher':
    case 'populationboom':
    case 'rabbitsfoot':
      current = `{x}X${+(1 + 0.1 * (j.counter ?? 0)).toFixed(1)}{}`;
      break;
    case 'jetpack':
      current = `{$}$${1 + (j.counter ?? 0)}{}`;
      break;
    case 'thinranks':
      current = `{+}+${2 * Math.max(0, START_COLONY - s.colony.length)}{}`;
      break;
    case 'boosterclub':
      current = `{+}+${s.stats.boostsUsed ?? 0}{}`;
      break;
    case 'bullmarket':
      current = `{+}+${Math.floor(Math.max(0, s.money) / 2)}{}`;
      break;
    case 'fizzypop':
      current = `${3 - (j.counter ?? 0)} level${3 - (j.counter ?? 0) === 1 ? '' : 's'} left`;
      break;
    case 'treasurechest':
      current = `{+}+${s.jokers.filter((x) => x !== j).reduce((n, x) => n + jokerSellValue(x), 0)}{}`;
      break;
    case 'skippingrope':
      current = `{x}X${+(1 + 0.25 * s.stats.skipped).toFixed(2)}{}`;
      break;
    case 'littlehelper':
      current = `{+}+${Math.floor((j.counter ?? 0) / 10)}{} (${j.counter ?? 0} saved)`;
      break;
    case 'mirrorimage':
      current = (j.counter ?? 0) >= 2 ? 'ready' : `${j.counter ?? 0}/2 levels`;
      break;
    case 'supersquad':
      current = `${s.colony.filter((c) => run.isSuper(c)).length} Super Lemmings`;
      break;
    case 'ohno':
      current = `{x}X${1 + (j.counter ?? 0)}{}`;
      break;
    case 'roadcrew':
      current = `{+}+${2 * (j.counter ?? 0)}{}`;
      break;
    case 'icelolly':
      current = `{+}+${Math.max(0, 30 - 3 * ((j.counter ?? 0) + (s.phase === 'playing' || s.phase === 'result' ? run.restarts() : 0)))}{}`;
      break;
    case 'freshapproach':
      current = `{x}X${+(1 + 0.2 * (j.counter ?? 0)).toFixed(1)}{} (${j.counter ?? 0} in a row)`;
      break;
    case 'greenparty':
      current = `{+}+${j.counter ?? 0}{}`;
      break;
    case 'lordofthemanor':
    case 'starpupils': {
      if (!s.setup) break;
      const squad = new Set(s.setup.hand);
      const n = s.colony.filter((c) => !squad.has(c.id) && c.edition === (j.id === 'starpupils' ? 'mentor' : 'champion')).length;
      current = j.id === 'starpupils' ? `{+}+${5 * n}{}` : `{x}X${+(1.2 ** n).toFixed(2)}{}`;
      break;
    }
    case 'steadysquad':
      if (s.setup) current = `{+}+${5 * Math.max(0, REDRAWS - (s.setup.redraws ?? 0))}{}`;
      break;
  }
  if (d.copies && !preview) {
    const t = run.copyOf(j.uid);
    return [text, t ? `{~}(Copying{} {!}${jokerDef(t.id).name}{}{~}){}` : '{~}(Nothing it can copy){}', ...powerEditionLines(j.edition)];
  }
  return [text, ...(current ? [now(current)] : []), ...powerEditionLines(j.edition)];
}
