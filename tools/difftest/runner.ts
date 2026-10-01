/**
 * Executes a game script on the TypeScript engine, exactly like oracle/driver/LemmixOracle.dpr does
 * on the original code, and produces the same output lines.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { ByteStream } from '../../engine/src/base/stream.ts';
import { Bitmap32 } from '../../engine/src/gr32/bitmap32.ts';
import { delphiTrim } from '../../engine/src/dos/structures.ts';
import { DEFAULT_GAME_OPTIONS, type GameOption, type LemmingGame, type OptionalMechanic, type PauseCommandMode } from '../../engine/src/game/game.ts';
import { repoDataProvider } from '../../engine/src/node/repoData.ts';
import { createSession, type Session } from '../../engine/src/session.ts';
import { StyleDef, STYLE_NAMES } from '../../engine/src/styles/base.ts';
import { dumpGame } from './dump.ts';

export interface RunOptions {
  style: string;
  section: number;
  level: number;
  script: string[];
  full?: boolean;
  gameOptions?: GameOption[];
  optionalMechanics?: OptionalMechanic[];
  /** Replaces "$DIR" in script arguments (save/load file names). */
  dir?: string;
}

export function styleDefFromName(name: string): StyleDef {
  const ix = STYLE_NAMES.findIndex((n) => n.toLowerCase() === name.toLowerCase());
  if (ix < 0 || ix > StyleDef.X92) throw new Error('unsupported style ' + name);
  return ix as StyleDef;
}

export class TsScriptRunner {
  readonly session: Session;
  readonly game: LemmingGame;
  readonly out: string[] = [];
  readonly script: string[] = [];
  private stepNo = 0;
  private readonly full: boolean;
  private readonly dir?: string;

  constructor(opts: Omit<RunOptions, 'script'>) {
    const data = repoDataProvider();
    this.session = createSession(data, styleDefFromName(opts.style), opts.section, opts.level, {
      gameOptions: new Set(opts.gameOptions ?? DEFAULT_GAME_OPTIONS),
      optionalMechanics: new Set(opts.optionalMechanics ?? []),
      // the same stand-in for the (display only) font rendering as the oracle (oracle/stubs/GR32.pas, TextExtent):
      // a low resolution message is 7 pixels per character wide and 14 high, the text itself is not drawn
      view: {
        bitmapToControl: (x, y) => ({ x, y }),
        renderLowResText: (text) => new Bitmap32(text.length * 7, 14),
      },
    });
    this.game = this.session.game;
    // like TGameScreenPlayer.Game_Finished -> CloseScreen -> BeforeCloseScreen: the result is taken immediately
    this.game.onFinish = () => this.game.setGameResult();
    this.full = opts.full ?? false;
    this.dir = opts.dir;
    const info = this.session.info;
    this.out.push(`LEVEL ${delphiTrim(this.session.level.info.title)} ${info.getLevelHash().toString(16).toUpperCase().padStart(16, '0')} ${info.getLevelCode()}`);
  }

  /** called after every step (for coverage statistics) */
  afterStep: (() => void) | null = null;

  private dump(what: string): void {
    this.out.push(`S ${this.stepNo} ${what}`);
    dumpGame(this.game, this.full, this.out);
    this.stepNo++;
    this.afterStep?.();
  }

  private sub(s: string): string {
    return this.dir ? s.split('$DIR').join(this.dir) : s;
  }

  /** Executes one script line (with the same semantics as the Pascal driver). */
  exec(raw: string): void {
    const line = raw.trim();
    this.script.push(line);
    if (line === '' || line.startsWith('#')) return;
    const game = this.game;
    const tok = line.split(' ');
    const cmd = tok[0];
    const argI = (i: number) => {
      const v = Number.parseInt(tok[i] ?? '', 10);
      if (Number.isNaN(v)) throw new Error('bad number in ' + line);
      return v;
    };
    if (cmd === 'update' || cmd === 'run') {
      const n = tok.length > 1 ? argI(1) : 1;
      for (let k = 1; k <= n; k++) {
        // run: until the game is finished
        if (cmd === 'run' && game.isFinished) break;
        let err = '';
        try {
          game.update();
        } catch {
          err = 'EXC';
        }
        if (err) this.out.push(err);
        this.dump('update');
      }
      return;
    }

    let err = '';
    try {
      switch (cmd) {
        case 'start':
          game.start(argI(1) !== 0, argI(2) !== 0);
          break;
        case 'cursor':
          game.cursorPoint = { x: argI(1), y: argI(2) };
          break;
        case 'rmb':
          game.rightMouseButtonHeldDown = argI(1) !== 0;
          break;
        case 'click':
          game.processSkillAssignment(argI(1) !== 0);
          break;
        case 'hittest':
          game.hitTest();
          break;
        case 'slower':
          game.btnSlower(argI(1) !== 0);
          break;
        case 'faster':
          game.btnFaster(argI(1) !== 0);
          break;
        case 'stoprr':
          game.btnStopChangingReleaseRate();
          break;
        case 'select':
          switch (tok[1]) {
            case 'climber':
              game.btnClimber();
              break;
            case 'umbrella':
              game.btnUmbrella();
              break;
            case 'explode':
              game.btnExplode();
              break;
            case 'blocker':
              game.btnBlocker();
              break;
            case 'builder':
              game.btnBuilder();
              break;
            case 'basher':
              game.btnBasher();
              break;
            case 'miner':
              game.btnMiner();
              break;
            case 'digger':
              game.btnDigger();
              break;
            default:
              throw new Error('bad skill');
          }
          break;
        case 'pause':
          game.btnPause(argI(1) as PauseCommandMode);
          break;
        case 'unpause':
          game.btnPauseStop();
          break;
        case 'togglepause':
          game.btnTogglePause(argI(1) as PauseCommandMode);
          break;
        case 'nuke':
          game.btnNuke();
          break;
        case 'regain':
          game.regainControl();
          break;
        case 'goto':
          game.gotoIteration(argI(1));
          break;
        case 'finish':
          game.finish();
          break;
        case 'cheat':
          game.cheat();
          break;
        case 'setresult':
          game.setGameResult();
          break;
        case 'ff':
          game.fastForward = argI(1) !== 0;
          break;
        case 'devcreate':
          game.developerCreateLemmingAtCursorPoint();
          break;
        case 'dev99':
          game.developer99Skills();
          break;
        case 'save': {
          // TRecorder.SaveToFile: the stream is written to the file in a finally block, also when SaveToStream raises
          const s = new ByteStream();
          try {
            game.saveReplay(s);
          } finally {
            writeFileSync(this.sub(tok[1]), s.bytes);
          }
          break;
        }
        case 'pixels': {
          // the pixels of the rendered frame (debugging)
          const [x0, y0, w, h] = [argI(1), argI(2), argI(3), argI(4)];
          for (let y = y0; y < y0 + h; y++) {
            let line = 'P ' + y;
            for (let x = x0; x < x0 + w; x++) line += ' ' + (game.targetBitmap.pixelS(x, y) >>> 0).toString(16).toUpperCase().padStart(8, '0');
            this.out.push(line);
          }
          break;
        }
        case 'poke': {
          // changes a byte of a file (damaged replay files)
          const f = this.sub(tok[1]);
          const b = new Uint8Array(readFileSync(f));
          const ofs = argI(2);
          if (ofs >= 0 && ofs < b.length) {
            b[ofs] = argI(3) & 0xff;
            writeFileSync(f, b);
          }
          break;
        }
        case 'cut': {
          // truncates a file
          const f = this.sub(tok[1]);
          const b = new Uint8Array(readFileSync(f));
          const size = argI(2);
          if (size >= 0 && size < b.length) writeFileSync(f, b.subarray(0, size));
          break;
        }
        case 'load': {
          const e = game.recorder.loadFromBytes(new Uint8Array(readFileSync(this.sub(tok[1]))));
          if (e) this.out.push('LOADERR ' + e);
          break;
        }
        default:
          throw new Error('unknown command ' + cmd);
      }
    } catch {
      err = 'EXC';
    }
    if (err) this.out.push(err);
    this.dump(line);
  }
}

export function runTs(opts: RunOptions): string[] {
  const r = new TsScriptRunner(opts);
  for (const line of opts.script) r.exec(line);
  return r.out;
}
