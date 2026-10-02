import { describe, expect, it } from 'vitest';
import { Bitmap32, createSessionFromInfo, getStyle, type Lemming, LemmingAction, type LemmingGame, SkillPanelButton, StyleDef } from '../../engine/src/index.ts';
import { repoDataProvider } from '../../engine/src/node/repoData.ts';
import { LevelCatalog } from '../src/run/catalog.ts';
import { TOUCH_AIM_RADIUS, touchTapAt } from '../src/screens/touchgame.ts';
import { DoubleTap } from '../src/touch.ts';
import { ScreenWakeLock, WAKE_INTERACTION_MS, WAKE_RETRY_MS, type WakeLockEnv, type WakeLockSentinelLike } from '../src/wakelock.ts';

describe('touch: the double tap of the nuke', () => {
  const Nuke = SkillPanelButton.Nuke;
  const Pause = SkillPanelButton.Pause;
  const tap = (d: DoubleTap<SkillPanelButton>, b: SkillPanelButton, time: number) => {
    d.down(b, time, 0, 0);
    return d.up();
  };

  it('needs two completed taps on the nuke itself', () => {
    const d = new DoubleTap<SkillPanelButton>(500, 10);
    expect(tap(d, Nuke, 0)).toBeNull();
    expect(tap(d, Nuke, 300)).toBe(Nuke);
  });

  it('does not take a tap on another button for the first tap (pause, then nuke)', () => {
    const d = new DoubleTap<SkillPanelButton>(500, 10);
    expect(tap(d, Pause, 0)).toBeNull();
    expect(tap(d, Nuke, 100)).toBeNull();
    // a third tap on the nuke makes the double tap with the second
    expect(tap(d, Nuke, 300)).toBe(Nuke);
  });

  it('starts over after a cancelled touch, a finger that left the button or moved, and a slow second tap', () => {
    const d = new DoubleTap<SkillPanelButton>(500, 10);
    tap(d, Nuke, 0);
    d.down(Nuke, 100, 0, 0);
    d.cancel();
    expect(tap(d, Nuke, 200)).toBeNull();

    const e = new DoubleTap<SkillPanelButton>(500, 10);
    e.down(Nuke, 0, 0, 0);
    e.move(SkillPanelButton.None, 0, 0);
    expect(e.up()).toBeNull();
    expect(tap(e, Nuke, 100)).toBeNull();

    const f = new DoubleTap<SkillPanelButton>(500, 10);
    f.down(Nuke, 0, 0, 0);
    f.move(Nuke, 11, 0);
    expect(f.up()).toBeNull();
    f.down(Nuke, 100, 0, 0);
    f.move(Nuke, 6, 6);
    expect(f.up()).toBeNull(); // the first one did not count
    expect(tap(f, Nuke, 200)).toBe(Nuke);

    const g = new DoubleTap<SkillPanelButton>(500, 10);
    tap(g, Nuke, 0);
    expect(tap(g, Nuke, 500)).toBeNull();
  });

  it('makes one double tap of three taps', () => {
    const d = new DoubleTap<SkillPanelButton>(500, 10);
    expect([tap(d, Nuke, 0), tap(d, Nuke, 100), tap(d, Nuke, 200)]).toEqual([null, Nuke, null]);
  });
});

/** a browser for the wake lock: requests, visibility and timers under control of the test */
class FakeBrowser implements WakeLockEnv {
  time = 0;
  shown = true;
  requests = 0;
  refuse: string | null = null;
  sentinels: { released: boolean; release: () => void }[] = [];
  private timers: { at: number; fn: () => void; id: number }[] = [];
  private nextId = 1;

  request = (): Promise<WakeLockSentinelLike> => {
    this.requests++;
    if (this.refuse) return Promise.reject(Object.assign(new Error('refused'), { name: this.refuse }));
    const listeners: (() => void)[] = [];
    const s = {
      released: false,
      // the browser (or the system) releases the lock
      release: () => {
        if (s.released) return;
        s.released = true;
        for (const l of listeners) l();
      },
    };
    this.sentinels.push(s);
    return Promise.resolve({
      release: async () => s.release(),
      addEventListener: (_type: 'release', l: () => void) => void listeners.push(l),
    });
  };
  visible = () => this.shown;
  now = () => this.time;
  setTimer = (fn: () => void, ms: number) => {
    const id = this.nextId++;
    this.timers.push({ at: this.time + ms, fn, id });
    return id;
  };
  clearTimer = (id: unknown) => {
    this.timers = this.timers.filter((t) => t.id !== id);
  };

  async advance(ms: number): Promise<void> {
    const end = this.time + ms;
    for (;;) {
      await flush();
      const due = this.timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.timers = this.timers.filter((t) => t !== due);
      this.time = due.at;
      due.fn();
    }
    this.time = end;
    await flush();
  }

  get held(): number {
    return this.sentinels.filter((s) => !s.released).length;
  }
}

const flush = () => new Promise<void>((r) => setImmediate(r));

describe('touch: the screen stays on while a level is played', () => {
  it('asks again after the browser released the lock while the page is visible', async () => {
    const b = new FakeBrowser();
    const lock = new ScreenWakeLock(b);
    lock.set(true);
    await flush();
    expect([b.requests, b.held, lock.held]).toEqual([1, 1, true]);
    b.sentinels[0].release(); // a battery saver, the system
    await flush();
    expect(lock.held).toBe(false);
    await b.advance(WAKE_RETRY_MS[0]);
    expect([b.requests, b.held, lock.held]).toEqual([2, 1, true]);
  });

  it('does not loop when the browser refuses: a few delayed tries, then touches and keys at most every few seconds', async () => {
    const b = new FakeBrowser();
    b.refuse = 'NotAllowedError';
    const lock = new ScreenWakeLock(b);
    lock.set(true);
    await b.advance(10 * 60 * 1000);
    expect(b.requests).toBe(1 + WAKE_RETRY_MS.length);
    expect(lock.status).toBe('refused: NotAllowedError');
    lock.interaction();
    await flush();
    expect(b.requests).toBe(2 + WAKE_RETRY_MS.length);
    lock.interaction(); // too soon
    await b.advance(WAKE_INTERACTION_MS - 1);
    lock.interaction(); // still too soon
    await flush();
    expect(b.requests).toBe(2 + WAKE_RETRY_MS.length);
    await b.advance(1);
    b.refuse = null;
    lock.interaction();
    await flush();
    expect([b.requests, lock.held]).toEqual([3 + WAKE_RETRY_MS.length, true]);
  });

  it('waits while the page is hidden and asks again when it shows', async () => {
    const b = new FakeBrowser();
    const lock = new ScreenWakeLock(b);
    lock.set(true);
    await flush();
    b.shown = false;
    b.sentinels[0].release(); // the browser releases the lock of a hidden page
    lock.visibilityChanged();
    await b.advance(120000);
    expect([b.requests, lock.held]).toEqual([1, false]);
    b.shown = true;
    lock.visibilityChanged();
    await flush();
    expect([b.requests, lock.held]).toEqual([2, true]);
  });

  it('lets go at the end of the level, also of a lock that is still on its way', async () => {
    const b = new FakeBrowser();
    const lock = new ScreenWakeLock(b);
    lock.set(true);
    await flush();
    lock.set(false);
    await flush();
    expect([b.held, lock.held, lock.status]).toEqual([0, false, 'off']);
    lock.visibilityChanged();
    lock.interaction();
    await b.advance(120000);
    expect(b.requests).toBe(1);
    // a request still on its way when the level ends
    lock.set(true);
    lock.set(false);
    await flush();
    expect([b.requests, b.held, lock.held]).toEqual([2, 0, false]);
  });

  it('works without a wake lock in the browser', async () => {
    const b = new FakeBrowser();
    const lock = new ScreenWakeLock({ ...b, request: null, visible: b.visible, now: b.now, setTimer: b.setTimer, clearTimer: b.clearTimer });
    lock.set(true);
    lock.interaction();
    await flush();
    expect([lock.held, lock.status]).toEqual([false, 'unavailable']);
  });
});

describe('touch: taps on the level', () => {
  const data = repoDataProvider();
  const catalog = new LevelCatalog(getStyle(data, StyleDef.Orig));
  const view = { bitmapToControl: (x: number, y: number) => ({ x, y }), renderLowResText: (t: string) => new Bitmap32(t.length * 7, 14) };
  const box = (l: Lemming) => ({ x0: l.xPos + l.frameLeftDx, y0: l.yPos + l.frameTopDy });
  /** the bitmap point a finger taps for the cursor point cp (touchTapAt moves it like Lemmix moves the mouse) */
  const finger = (cp: { x: number; y: number }) => ({ x: cp.x + 3, y: cp.y - 2 });
  const options = { selectWalker: false, alwaysRegainControl: false };

  /** the lemmings whose hit box (TLemmingGame.PrioritizedHitTest) holds the cursor point */
  const under = (game: LemmingGame, cp: { x: number; y: number }) =>
    game.lemmingList.filter((l) => !l.isRemoved && box(l).x0 <= cp.x && cp.x <= box(l).x0 + 12 && box(l).y0 <= cp.y && cp.y <= box(l).y0 + 12);

  /**
   * "As long as you try your best" (Fun 9): the first lemming builds, the next ones walk into it. Returns the game at the
   * first frame where a walker overlaps the builder, and a cursor point on both of them and no other lemming.
   */
  function builderAndWalker(): { game: LemmingGame; builder: Lemming; walker: Lemming; cp: { x: number; y: number } } {
    const game = createSessionFromInfo(data, catalog.get('Orig-1-09').info, { view }).game;
    game.start(false);
    let builder: Lemming | null = null;
    for (let n = 0; n < 2000; n++) {
      game.update();
      if (!builder) {
        const first = game.lemmingList.find((l) => !l.isRemoved && l.action === LemmingAction.Walking);
        if (!first) continue;
        game.btnBuilder();
        builder = touchTapAt(game, finger({ x: box(first).x0 + 6, y: box(first).y0 + 6 }), options);
        expect(builder?.action).toBe(LemmingAction.Building);
        continue;
      }
      const a = box(builder);
      for (let y = a.y0; y <= a.y0 + 12; y++)
        for (let x = a.x0; x <= a.x0 + 12; x++) {
          const cp = { x, y };
          const lems = under(game, cp);
          const walker = lems.find((l) => l !== builder);
          if (lems.length === 2 && walker?.action === LemmingAction.Walking) return { game, builder, walker, cp };
        }
    }
    throw new Error('no walker met the builder');
  }

  it('selects the worker where a walker overlaps it, and the walker with the walker selection (the right mouse button)', () => {
    const one = builderAndWalker();
    one.game.btnExplode();
    expect(touchTapAt(one.game, finger(one.cp), options)).toBe(one.builder);
    expect([one.builder.explosionTimer > 0, one.walker.explosionTimer > 0]).toEqual([true, false]);

    const two = builderAndWalker();
    expect(two.game.currentIteration).toBe(one.game.currentIteration);
    two.game.btnExplode();
    expect(touchTapAt(two.game, finger(two.cp), { ...options, selectWalker: true })).toBe(two.walker);
    expect([two.builder.explosionTimer > 0, two.walker.explosionTimer > 0, two.builder.action]).toEqual([false, true, LemmingAction.Building]);
  });

  it('replays an assignment made with the walker selection on the walker', () => {
    const { game, builder, walker } = (() => {
      const t = builderAndWalker();
      t.game.btnExplode();
      touchTapAt(t.game, finger(t.cp), { ...options, selectWalker: true });
      return t;
    })();
    const at = game.currentIteration;
    for (let n = 0; n < 10; n++) game.update();
    game.gotoIteration(at + 3); // a rewind replays the level from the start
    const b = game.lemmingList[builder.listIndex];
    const w = game.lemmingList[walker.listIndex];
    expect([b.action, b.explosionTimer > 0, w.explosionTimer > 0]).toEqual([LemmingAction.Building, false, true]);
  });

  it('does nothing (instead of the exception of Lemmix) with the walker selection on a worker alone', () => {
    const game = createSessionFromInfo(data, catalog.get('Orig-1-01').info, { view }).game; // "Just dig!"
    game.start(false);
    game.btnDigger();
    let digger: Lemming | null = null;
    for (let n = 0; n < 2000 && !digger; n++) {
      game.update();
      const first = game.lemmingList.find((l) => !l.isRemoved && l.action === LemmingAction.Walking);
      if (first) digger = touchTapAt(game, finger({ x: box(first).x0 + 6, y: box(first).y0 + 6 }), options);
    }
    if (!digger) throw new Error('no digger');
    game.update();
    const cp = { x: box(digger).x0 + 6, y: box(digger).y0 + 6 };
    // no other lemming near enough for the tap to aim at it
    for (const l of game.lemmingList)
      if (l !== digger && !l.isRemoved) expect(Math.abs(box(l).x0 - box(digger).x0) + Math.abs(box(l).y0 - box(digger).y0)).toBeGreaterThan(12 + TOUCH_AIM_RADIUS * 2);
    const records = game.recorder.list.length;
    const count = game.currDiggerCount;
    expect(touchTapAt(game, finger(cp), { ...options, selectWalker: true })).toBeNull();
    expect([game.recorder.list.length, game.currDiggerCount]).toEqual([records, count]);
    // what a click with the right mouse button does there (see README, Differences with Lemmix)
    game.rightMouseButtonHeldDown = true;
    game.cursorPoint = cp;
    expect(() => game.processSkillAssignment(false)).toThrow();
  });

  it('aims at the nearest lemming next to the finger', () => {
    const game = createSessionFromInfo(data, catalog.get('Orig-1-01').info, { view }).game;
    game.start(false);
    game.btnDigger();
    let first: Lemming | undefined;
    for (let n = 0; n < 2000 && !first; n++) {
      game.update();
      first = game.lemmingList.find((l) => !l.isRemoved && l.action === LemmingAction.Walking);
    }
    if (!first) throw new Error('no walker');
    const b = box(first);
    expect(touchTapAt(game, finger({ x: b.x0 + 12 + TOUCH_AIM_RADIUS + 1, y: b.y0 + 6 }), options)).toBeNull();
    expect(touchTapAt(game, finger({ x: b.x0 + 12 + TOUCH_AIM_RADIUS, y: b.y0 + 6 }), options)).toBe(first);
  });
});
