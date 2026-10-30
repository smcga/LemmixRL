import { describe, expect, it } from 'vitest';
import { getStyle, StyleDef } from '../../engine/src/index.ts';
import { repoDataProvider } from '../../engine/src/node/repoData.ts';
import { LevelCatalog } from '../src/run/catalog.ts';
import { jokerLines } from '../src/run/joker-tooltip.ts';
import { RunSession } from '../src/run/session.ts';

const catalog = new LevelCatalog(getStyle(repoDataProvider(), StyleDef.Orig));

describe('Power Card tooltips', () => {
  it('shows accumulated values for owned cards and starting values in previews', () => {
    const run = RunSession.newRun(catalog, 'TOOLTIP');
    const j = { uid: 1, id: 'flashcard', counter: 6 };
    run.state.jokers.push(j);
    expect(jokerLines(run, j)[1]).toContain('+6{} Rescues');
    expect(jokerLines(run, { uid: -1, id: 'flashcard' }, true)[1]).toContain('+0{} Rescues');
    expect(jokerLines(run, { uid: -1, id: 'copycat' }, true)).toHaveLength(1);
  });

  it('reflects run-wide values and updates as the run changes', () => {
    const run = RunSession.newRun(catalog, 'TOOLTIP');
    const j = { uid: 1, id: 'boosterclub' };
    run.state.stats.boostsUsed = 23;
    expect(jokerLines(run, j)[1]).toContain('+23{} Rescues');
    run.state.stats.boostsUsed++;
    expect(jokerLines(run, j)[1]).toContain('+24{} Rescues');
    expect(jokerLines(run, { uid: 2, id: 'headcount' })[1]).toContain(`$${Math.floor(run.state.colony.length / 20)}`);
  });

  it('does not guess squad-dependent values before a squad exists', () => {
    const run = RunSession.newRun(catalog, 'TOOLTIP');
    expect(jokerLines(run, { uid: 1, id: 'reserves' })).toHaveLength(1);
    expect(jokerLines(run, { uid: 2, id: 'starpupils' })).toHaveLength(1);
    expect(jokerLines(run, { uid: 3, id: 'steadysquad' })).toHaveLength(1);
  });
});

