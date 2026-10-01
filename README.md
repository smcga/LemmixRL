# LemmixRL

A faithful copy of Lemmings, with roguelike elements to come. The first step, in this repository: **Lemmix, the
Delphi Lemmings clone by Eric Langedijk (in `src/`), ported to TypeScript and Phaser, with the same game behaviour.**

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
| `oracle/`, `tools/oracle/` | The *oracle*: the original game units compiled with Free Pascal. |
| `tools/difftest/` | The differential test of the TypeScript engine against the oracle. |

## Playing

The controls are those of Lemmix: click the skill panel or use F1..F12 (release rate, skills, pause, nuke twice),
click a lemming to assign the selected skill, keep the right mouse button down to select a non-prioritized lemming,
move the mouse against the left or right side (or use the arrow keys, Alt+drag, the minimap) to scroll. In the game
`?` lists all keys: rewinding and skipping (`b`, `n`, `!`, `1`, space, `D`, `F`, `z`), replaying (`r`), saving the
replay (`u`), loading a replay (`l`), fast forward (`f`), sound and music (`s`, `m`, `+`, `-`) and more.
In the menu F2 opens the level code screen, F3 the sound setting, F4 selects the style (Original Lemmings, Oh No More
Lemmings, Holiday Lemmings 94, XMas Lemmings 91 and 92), F5 the options, `l` loads a replay file.

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

RESULTS_PLACEHOLDER

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
point, leaving the same partial state behind, and the game goes on (Lemmix shows the exception and continues).

`npm run e2e` is a browser smoke test of the front-end (menu, preview, a level solved with a digger, postview, and
the game speed). The GitHub workflow in `.github/workflows/verify.yml` runs the type check, the unit tests, the build,
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
