# LemmixRL

A faithful copy of Lemmings, with a roguelike run around it. The base: **Lemmix, the Delphi Lemmings clone by Eric
Langedijk (in `src/`), ported to TypeScript and Phaser, with the same game behaviour.** Around it: a run in the spirit
of Balatro, where the original levels are the blinds and your lemmings are the deck (see [The roguelike
run](#the-roguelike-run)).

The port is a behaviour-preserving engine port, not a rewrite by feature. Every unit, class, method and quirk of the
original simulation has its counterpart in TypeScript (with the same names), and the port is checked step by step
against the original code: the Delphi game units are compiled with Free Pascal and run side by side with the
TypeScript engine on hundreds of thousands of randomly generated game situations.

```
npm install
npm run dev          # the game: http://localhost:5173
npm run build        # the game as static files in dist/ (any web server can serve them)
npm test             # unit tests and the regression cases
npm run oracle:build # compile the original game units with Free Pascal (fpc 3.2.2)
npm run difftest     # compare the TypeScript engine with the original on every level
```

## Layout

| directory | contents |
|---|---|
| `src/` | The original Lemmix 3.0.0 source code (Delphi 10.3) and data. Unchanged: it is the reference. |
| `engine/` | The TypeScript port of the simulation, without any browser dependency: the DOS data files (`dos/`, `level/`, `styles/`), the Graphics32 subset the game uses (`gr32/`), the renderer, `TLemmingGame` (`game/game.ts`) and the replay recorder (`game/recorder.ts`, .lrb files are compatible with Lemmix). |
| `app/` | The Phaser front-end: the Lemmix screens ported (`screens/`: menu, level code, preview, game, skill panel, postview), shown by Phaser scenes (`scenes/`), with Web Audio sound effects, a ProTracker player for the music and Web Speech for the voice. |
| `app/src/run/`, `app/src/scenes/run.ts` | The roguelike run: its rules (`session.ts`), content (`content.ts`), levels (`catalog.ts`), seeded randomness and saving, and its screens. |
| `oracle/`, `tools/oracle/` | The *oracle*: the original game units compiled with Free Pascal. |
| `tools/difftest/` | The differential test of the TypeScript engine against the oracle. |

The port follows the Delphi units one to one:

| Lemmix (`src/`) | TypeScript |
|---|---|
| `Game.pas` (TLemmingGame, TLemming, TRecorder, ...) | `engine/src/game/game.ts`, `engine/src/game/recorder.ts` |
| `Game.Rendering.pas` | `engine/src/game/rendering.ts` |
| `Styles.Base.pas`, `Styles.Dos.pas`, `Styles.Factory.pas` | `engine/src/styles/base.ts`, `engine/src/styles/dos.ts`, `engine/src/session.ts` |
| `Level.Base.pas`, `Level.Loader.pas`, `Level.Hash.pas` | `engine/src/level/` |
| `Dos.Compression.pas`, `Dos.Bitmaps.pas`, `Dos.Structures.pas`, `Dos.Consts.pas`, `Meta.Structures.pas` | `engine/src/dos/`, `engine/src/meta/structures.ts` |
| Graphics32 (the parts the game uses) | `engine/src/gr32/` |
| `Prog.Data.pas` | `engine/src/data/datasource.ts`, `app/src/data.ts` |
| `GameScreen.Base.pas`, `Dos.MainDat.pas` | `app/src/screens/base.ts` |
| `GameScreen.Menu.pas`, `.LevelCode.pas`, `.Preview.pas`, `.Postview.pas` | `app/src/screens/menu.ts`, `levelcode.ts`, `preview.ts`, `postview.ts` |
| `GameScreen.Player.pas`, `Game.SkillPanel.pas` | `app/src/screens/player.ts`, `app/src/screens/skillpanel.ts` |
| `Game.Sound.pas`, `Prog.Voice.pas`, `Prog.Config.pas`, `Prog.App.pas` | `app/src/sound.ts` (+ `modplayer.ts`), `voice.ts`, `config.ts`, `app.ts` |

## Playing

The controls are those of Lemmix: click the skill panel or use F1..F12 (release rate, skills, pause, nuke twice),
click a lemming to assign the selected skill, keep the right mouse button down to select a non-prioritized lemming,
move the mouse against the left or right side (or use the arrow keys, Alt+drag, the minimap) to scroll. In the game
`?` lists all keys: rewinding and skipping (`b`, `n`, `!`, `1`, space, `D`, `F`, `z`), replaying (`r`), saving the
replay (`u`), loading a replay (`l`), fast forward (`f`), sound and music (`s`, `m`, `+`, `-`) and more.
In the menu F2 opens the level code screen, F3 the sound setting, F4 selects the style (Original Lemmings, Oh No More
Lemmings, Holiday Lemmings 94, XMas Lemmings 91 and 92), F5 the options, `l` loads a replay file.

## The roguelike run

Press F6 in the menu. A run wraps the original game; it does not replace it. Once a blind starts, it is the original
level: the same terrain, objects, traps, physics, release rate, timer and rescue requirement, played with the original
preview, game and result screens. The run decides only *what you bring*: how many lemmings and how many of each
skill.

| Balatro | Lemmings |
|---|---|
| Ante (8) | Three original levels from a band of the 120 levels of the original game, moving from Fun to Mayhem |
| Small, Big, Boss blind | An easier, a medium and a harder level of the ante's band (no level twice in a run) |
| Deck | Your colony: 80 lemmings at the start |
| Hand | The squad of a level: min(colony, level lemmings), drawn at random; the same squad for every attempt |
| Hand levels | Skill capability: a level gets **min(your capability, the level's allocation)** of every skill |
| Destroyed cards | Lemmings that die in an accepted result leave the colony for good; survivors and rescued lemmings stay |
| Card editions | Gold ($2 when it exits), Lucky (chance of $4 or a tarot), Mentor (+1 capability when it exits), Champion (multiplies the rescue bonus when it exits), Insured (comes back once), permanent Climbers and Floaters |
| Jokers (5) | Passive gadgets: protection against kinds of deaths, money for performance, capability, and a few rule breakers (+1 Builder above the level maximum, +1 minute, starting climbers or floaters) |
| Tarots (2) | Consumables that change selected lemmings (floaters, climbers, gold, lucky, mentor, champion, insured, clones, retraining into capability) |
| Skip | The small and big blind can be skipped for a tag (recruits, floaters, a doubled boss payout, a free shop, ...) |
| Director's Cut | The boss of an ante can be rerolled once ($6), for a level your colony cannot do |
| Hands left | Three attempts per blind are paid ($1 each unused); you can always retry, nothing counts until you accept |

The blind screen shows all three levels of the ante up front: the level, its numbers, a thumbnail, and per skill the
original allocation and what you would bring (green: the full allocation, yellow: part of it, red: none). The
allocation works like Balatro's score requirement: it tells you whether your colony looks ready, and invites you to
find another way. Clicking a skill hires one more for this level ($1). Your best result on a level (over all runs) is
shown as well.

Accepting a successful result pays: the blind ($3, $4, $5), unused attempts, a rescue bonus that grows from the
requirement to 100% (not the number of lemmings, so big levels are not worth more), a perfect rescue bonus, gold
lemmings, jokers and interest ($1 per $5, up to $5). The shop sells training (capability), recruitment drives,
jokers and tarots, and always 5 recruits for $3.

In a level, special lemmings of the squad carry a small mark in the colour of their card. Pressing Escape ends a
level as in Lemmix: the lemmings that are still out survive (no need to nuke your blockers). The run is saved after
every step (in the browser), the seed decides every random choice.

The only change to the engine for the run is opt-in: a callback for every released lemming and a method that makes
a lemming a permanent climber or floater (`onLemmingReleased`, `grantPermanentAbilities` in `engine/src/game/game.ts`).
Without them the game is the original, which the differential test keeps checking.

What a "normal" solution of a level needs is not in the level files: the allocation is an upper bound, and many
levels give 20 of everything. The run shows the original allocation and your own best result; a table of known
solutions (verified replays) would be the next step.

## How the port is verified

### The oracle

`npm run oracle:build` (`tools/oracle/build.ts`) compiles the original units of the simulation, as they are in `src/`,
with Free Pascal 3.2.2 in Delphi mode: `Game`, `Game.Rendering`, `Styles.Base`, `Styles.Dos`, `Level.Base`,
`Level.Loader`, `Level.Hash`, `Dos.Compression`, `Dos.Bitmaps`, `Dos.Structures`, `Dos.Consts`, `Meta.Structures` and
`Base.Types`. What is not simulation (the VCL, sound, voice, the skill panel control, caches) is replaced by small
stubs in `oracle/stubs`; the Graphics32 routines the game draws with are copied from the Graphics32 source in
`src/Graphics32`.

The original source is transformed mechanically, and only where FPC requires it:

* the `uses` clauses are mapped to the units that exist (e.g. `System.SysUtils` to `SysUtils`, `Vcl.*` to stubs);
* Delphi 10.3 inline variables (`var i := ...`, `for var i ...`) are hoisted to declarations, because FPC does not
  have them (`oracle/build/hoisted-inline-vars.txt` lists them);
* a handful of small patches, each with a reason in `tools/oracle/build.ts` (for example `WriteData` → `WriteBuffer`,
  `PByte` from another unit), plus one additive patch: the `OracleDump` method that writes the complete game state.

The build writes `oracle/build/original-vs-compiled.diff`, the complete difference between the original and the
compiled source, for review.

### The comparison

`oracle/driver/LemmixOracle.dpr` runs the original `TLemmingGame` with a script of the calls the game screen makes:
`Update`, the cursor position, mouse clicks (`ProcessSkillAssignment`), `HitTest`, all buttons (skills, release rate,
pause in its three modes, nuke), `RegainControl`, `GotoIteration` (rewind and skip), `Start` (replay), finishing,
cheating, and saving and loading replay files. After every step it writes the complete state of the game: every field
of the game, every lemming, every object and entrance, the recorder, and hashes of the terrain bitmap, the object map
and the rendered frame (the frame includes the skill panel information, messages, particles and the replay cursor).
`tools/difftest/runner.ts` does exactly the same with the TypeScript engine, and the outputs must be identical, line
for line. Saved replay files are compared byte for byte.

The scripts are generated (`tools/difftest/generate.ts`): the generator plays the level on the TypeScript engine and
aims at real lemmings, selects available (and sometimes unavailable) skills, uses all the buttons, pauses (also in the
pause glitch window), rewinds, skips, replays, regains control, saves and loads replays, toggles the game options that
influence the game or its rendering and the optional mechanics (nuke glitch, pause glitch, right click glitch), and in
some cases uses the developer commands (99 skills, lemmings created at the cursor).

```
npm run difftest -- --seeds 3                 # every level of every style, 3 scripts each
npm run difftest -- --level Orig:2:13         # one level (style:section:level)
npm run difftest:levels                       # every level: title, hash, level code, the first 40 frames
npm run difftest:recheck                      # re-run the saved cases (regressions and failures)
npm run difftest:replay -- some.lrb           # play Lemmix replay files on both engines
```

A failing case leaves the script and full dumps of both engines in `tools/difftest/failures/<case>` (with the first
difference). `ORACLE_TRACE=1` together with a debug build of the oracle (`npx tsx tools/oracle/build.ts --debug`,
used with `LEMMIX_ORACLE=oracle/bin/lemmix-oracle-debug`) prints the class and stack trace of every exception the
original code raises, and the script command `pixels X Y W H` prints part of the rendered frame.

The scripts also corrupt saved replay files before loading them (`poke` and `cut`), to compare how damaged or odd
replay files are loaded and replayed.

### Results

Every level of the five styles (292 levels) has been run with 8 different generated scripts, plus 120 scripts with
damaged replay files: 2,456 cases with together 9.4 million compared steps, 1.7 million game frames and 250,000
skill clicks. The current code passes the last 1,288 of them (the last two complete sweeps and the damaged replays,
4.8 million steps) without a single difference. In those sweeps every lemming action occurred (drowning in 118 of the
876 cases of one sweep, vaporizing in 36), games ended by time up, with all lemmings accounted for and by nuking, and
in 1,175 steps the original code raised an exception, which the port raised at the same point. All 292 levels also
have the same title, hash, level code and first 40 frames (`npm run difftest:levels`).

The deviations that were found, and fixed in the port:

* `TRecorder.Truncate` sets `TList.Count`, which *grows* the list with nil items when the new count is larger. That
  happens when a replay that ends with a pause is saved during the replay (saving deletes the trailing pause record)
  and control is regained afterwards. A later save or replay then raises halfway, with a partial replay file.
* Graphics32's `StretchTransfer` divides by the size of the source rectangle when the rectangle lies partly outside
  the bitmap. For an empty rectangle that is 0 / 0, which raises `EInvalidOp` in Delphi (the FPU exceptions are not
  masked) where JavaScript quietly gives NaN. The ratios are `Single` values in the original, so they are rounded to
  single precision in the port as well.

The test harness itself had one difference: its stand-in for the Windows font rendering of low resolution messages
(which only affects the display) was not the same as the oracle's. Such cases are kept in
`tools/difftest/regressions`, and `npm test` runs them against stored hashes of the oracle output, so they are checked
without the oracle as well.

Exceptions of the original are part of the behaviour: where the Delphi code raises (an access violation on a nil
lemming in `ProcessSkillAssignment`, a nil replay item, a division by zero), the TypeScript code raises at the same
point, leaving the same partial state behind. (The oracle driver carries on after an exception, so the state after it
is compared as well. Lemmix itself shows the error and terminates; the browser version shows the error and returns
to the menu.)

`npm run e2e` is a browser smoke test of the front-end (menu, preview, a level solved with a digger, postview, and
the game speed) and of a roguelike run (a blind played and accepted, the cash out, the shop, a skip, and continuing
the saved run after a reload). The GitHub workflow in `.github/workflows/verify.yml` runs the type check, the unit tests, the build,
the browser test, and the differential test with an oracle built from `src/` (on pull requests and manually).

## Differences with Lemmix

The simulation is the same. The program around it is a browser application, so some things are different:

* Lemmix polls its 58 ms frame timer about every millisecond; the browser updates on animation frames and catches up
  with late frames, so the game runs at the same 17.2 frames per second.
* The mouse is kept inside the game area by the game itself instead of `ClipCursor`; the cursors are drawn by the game.
* High resolution messages use the browser's fonts; the low resolution messages are rendered with an Arial font
  without anti-aliasing, like Lemmix.
* The music is played by a small ProTracker player instead of the BASS library, the voice by the Web Speech API
  instead of SAPI.
* Replay files are downloaded (`u`) and loaded with a file dialog (`l`); there is no replay finder, level finder,
  autosave or result text file. The options are browser dialogs. User styles (custom levels) are not available yet.
* A bug of the original that raises an exception during the game (for example: holding the right mouse button and
  clicking on a blocker without other lemmings under the cursor, while the selected skill is available) terminates
  Lemmix after an error message. A browser page cannot terminate itself: the game stops, the error is shown, and
  the menu follows.

---

# Original Lemmix README

# Latest release [here](https://github.com/ericlangedijk/Lemmix/releases)

Dear Reader,

Almost thirty years ago Lemmings was created by DMA.
Lemmix embeds six original DOS-games and is playable on Windows.
It is meant to be an almost exact clone of DOS-Lemmings with some extra features, like replay.
Additionally: thousands of custom (and often fantastic) levels have been created by people all over the world.
With Lemmix you can play them all. In the near future, when testing phase is over, I will upload a lot of them here.
The PDF assumes some knowledge of the game: https://github.com/ericlangedijk/Lemmix/releases.

If there is anyone who has any objections with the published data here, let me know.
The source code and the program are free to use.
Suggestions for improvements are always welcome.

Proclaimer and Legal Statement: Do whatever you want with it.

The code should compile on a modern Delphi compiler. I used Delphi 10.3.3.
Also should work with a Community edition.
Some technical history is in the Releases.txt at https://github.com/ericlangedijk/Lemmix/releases.
Hic sunt dracones, remember that.

Eric
