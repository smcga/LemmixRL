# LemmixRL (Lematro)

A faithful copy of Lemmings, with a roguelike run around it: **Lematro**, Lemmings x Balatro. The base: **Lemmix, the Delphi Lemmings clone by Eric
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
npm run designer     # Power Card Designer: animations, palette, layout and JSON import/export
npm run build        # the game as static files in dist/ (any web server can serve them)
npm test             # unit tests and the regression cases
npm run oracle:build # compile the original game units with Free Pascal (fpc 3.2.2)
npm run difftest     # compare the TypeScript engine with the original on every level
```

Use the [Power Card Designer](docs/power-card-designer.md) to create and edit card
artwork and metadata. Exported JSON is the game's card presentation source; new
designs stay out of gameplay until their effects are implemented.

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

`?music` at the end of the address shows a debug panel with the music of the levels, to compare how loud the tracks
are: every track of Orig, Oh No and Holiday 94 with the levels that play it, the loudness of its file (LUFS, after
ITU-R BS.1770) and the gain the game plays it with. A click plays a track like a level plays it, looping; *Play all*
plays every track for some seconds, one after the other; with *Normalise* off the tracks play as loud as their files.
`?music=0` hides the panel again.

### On a phone or a tablet

The game can be played with a finger (an addition of LemmixRL). It switches to touch controls at the first touch and
back to the mouse at the first click; with a mouse nothing changes.

To open it on a phone: the workflow `.github/workflows/pages.yml` publishes the default branch on GitHub Pages at
`https://<owner>.github.io/<repo>/` and every pull request at `https://<owner>.github.io/<repo>/pr-<number>/` (with a
comment on the pull request that links to it), once GitHub Pages serves the `gh-pages` branch (Settings > Pages >
Build and deployment > Deploy from a branch > `gh-pages`, `/ (root)`). Otherwise: put the files of `npm run build`
(`dist/`) on any web server, or run `npm run dev -- --host` and open the *Network* address it prints on a phone in the
same network. `?diag` at the end of the address shows what the browser reports (the build, the safe area, full
screen, the sideways lock, the wake lock, the audio); `?diag=0` hides it again.

* Hold the phone sideways: the level is drawn at the resolution of the screen, scaled by whole device pixels, with
  the touch buttons next to it. Upright, it is smaller (the run screens ask you to turn the phone). Every screen
  stays out of the notch, the rounded corners and the home indicator.
* Full screen: the FULLSCREEN button in the menu (Android browsers), or install it as an app: *Install* on the title
  of Lematro installs it with one click where the browser can (Chrome, Edge, Android), and says how elsewhere (on an
  iPhone: Share > *Add to Home Screen*). Installed, it starts full screen with a lemming icon (the page has to be
  served over HTTPS for that).
* Menu of Classic Lemmings: tap a sign to do what its key does (1 Player, New Level, music, the style, the arrows of
  the difficulty sign; Exit goes back to the title of Lematro). LEMATRO, OPTIONS and STYLE are buttons next to the
  menu. The level
  code screen gets a text box for the phone's keyboard.
* Preview and result screens: a tap is a click; BACK and MENU do what Escape and the right mouse button do.
* In a level: tap a skill in the panel, then tap a lemming. The skill is assigned when the finger comes up; while
  the finger is down the cursor shows which lemming it is on, and a tap a little next to a lemming (up to 8 pixels of
  the game) still selects the nearest one. Drag the level sideways to scroll, or tap and drag the minimap. Hold the
  release rate buttons; the nuke wants two taps on it. The touch buttons are the keys a phone does not have: PAUSE,
  FAST (fast forward), WALKER (the right mouse button: the next tap selects the lemming that is not working where
  lemmings overlap, a walker rather than a builder, and the cursor shows it), STEP (the next frame, while paused),
  -1 SEC (rewind one second), RESTART and END (Escape), the last two after a second tap. Turning the phone cancels
  what a finger was doing, and a second tap that was asked for. The screen stays on while a level is played. With
  WALKER on, a tap on a worker with nobody else under the finger does nothing (with the right mouse button Lemmix
  raises an exception there, see below).
* Run screens: the cards are handled as in Balatro on a phone. A tap on a card (a Power Card, a boost, a card of the
  shop) selects it: it shows what it is and its buttons (Buy, Sell, Use). A card can also be dragged: the areas it can
  be dropped on light up (Buy over the Power Cards, Sell over the other row, Use above the colony). A tap on anything else
  shows what it is; hiring a skill wants a second tap. A tap on an empty spot closes the information.

## Deployment

Cloudflare Pages serves the production build at <https://lemmings.steves.tools>. The Pages project is connected to
this GitHub repository and treats `main` as its production branch, so merging a pull request into `main` triggers a
new production deployment automatically. Cloudflare runs `npm run build` and publishes the generated `dist/`
directory. The checked-in `wrangler.jsonc` records the Pages project name and build output directory.

Every build Cloudflare makes shows up on GitHub as a *Cloudflare Pages* check on its commit. A push to `main` without
that check never reached Cloudflare: the Cloudflare app in GitHub (Settings > Applications > Installed GitHub Apps)
needs access to this repository. Pull requests should target `main`; `master` is not deployed.

## The roguelike run

The title credits Lemmings (David Jones and DMA Design; the lemmings began as an animation by Mike Dailly), Lemmix (Eric
Langedijk) and Balatro (LocalThunk), with links, and says what Lematro is: an unofficial fan remix, made for fun.

The program starts with the title of Lematro: *Play* (or Enter) starts or continues a run, *Settings* has the volumes
of the sounds and of the music (a slider each; at 0 it is off, as F3 turns it off in the menu of Lemmix), full screen
and the options of Lemmix, *Collection* shows every Power Card, boost, pack, Skip Bonus and Super Lemming of the game, face
down until you first come across it in a run (as Balatro's collection), and *Classic Lemmings* (or C) opens the menu of
Lemmix, the original game as it was (Escape goes back to the title). In a run, Options has the volumes and the
collection too (and, for now, an *Unlock all* button for development). A run wraps the original game; it does not
replace it.

Before a level of a run, its own screen shows what the preview of Lemmings shows (the whole level, its name, the
lemmings, how many to save, the release rate, the time) with the skills you bring, laid out like a blind of Balatro.
A level of a run is played as it goes: [F]ast, [P]ause, [R]eset (the level from the start) and [E]nd are its keys (shown
under the game with a mouse); the keys that move the time (rewinding, skipping, frame steps), the replays and the
selection of the walker with the right mouse button are for Classic Lemmings only, and so are the WALKER, STEP and
-1 SEC buttons on a phone.

The Lematro screens are drawn over a swirl of paint in the colours of what is going on (the level, the shop, the pack
that is open), and their large text is in the pixel font of the run screens; the buttons click, and the "Let's go!"
of the lemmings is kept for the levels.

The screens use Lemmings names for Balatro's things: a *round* (Balatro's ante) has three levels, *Level 1, 2 and 3*
(the small, big and boss blind), and the *Game* counter is Balatro's round; jokers are *Power Cards*, tarots *boosts*
and the tags for skipping a level *Skip Bonuses*. Below, the Balatro names are used for the design.

The screen is laid out like Balatro's: on the left what is going on, the colony, the abilities, Run Info and Options,
the money, the round and the game; along the top the Power Cards and the boosts; in the corner the colony as the deck
(click it to see every lemming of it walking about a little level of its own); in the middle the levels, the cash out or the shop, coming up from below. It fills the
window, as the screens of Lemmix do. The cards work as in Balatro, with its mobile way of dragging on every device:
click a card for its buttons, or drag it. A card of the shop dragged up to the Power Cards is bought; a boost of the shop
dragged to the area above the colony is bought and used at once (it needs no free slot); a Power Card dragged to the boosts
is sold (a boost to the Power Cards), a boost dragged above the colony is used, and a Power Card dragged along its row goes to
another place. The colony (the deck in the corner) lives at home: a little level of its own, played by the game, with a trapdoor
and an exit (`app/src/run/home.ts`). *Pick* shows who a lemming is in the panel at the side (a drag picks every lemming
in a box), and the eight skills can be used there as often as you like, for nothing: build bridges, dig, bash and blow
up the ground, put blockers in the way, to keep lemmings in groups; *Dirt* and *Erase* paint the ground where they
are dragged; *Poof* takes a lemming away at once without a hole (it comes back in by the trapdoor), and *Trapdoor*
puts the trapdoor where it is clicked, so lemmings can be sent to a pen. A home starts as three shelves of three pens
(walls from floor to floor), the exit in a nook of its own. The home is kept with the run as it was left (its
ground, where every lemming is, its blockers); nothing is lost there (a lemming that dies or goes out comes back in by
the trapdoor), and new lemmings come in by the trapdoor. The lemmings picked can be *preferred* or *avoided*: a squad
is drawn from the preferred lemmings first and the avoided ones last (drawn again at once while its level has not
begun). Where a boost asks for lemmings, the same home comes up and the lemmings picked are the ones it is used on.
*Run Info* shows the levels of the round with their pictures, their previews and their hazards (water, fire,
traps), to judge Power Cards like Lifeguard by. Next to the name of every level, *Wiki* opens its page on the
[Lemmings Wiki](https://lemmings.fandom.com) (how it goes, how others solved it). Once a blind starts, it is the original
level: the same terrain, objects, traps, physics, release rate, timer and rescue requirement, played with the original
preview, game and result screens. The run decides only *what you bring*: how many lemmings and how many of each
skill.

| Balatro | Lemmings |
|---|---|
| Ante (8) | Three original levels from a band of the 120 levels of the original game, moving from Fun to Mayhem |
| Small, Big, Boss blind | A level from the easier half, the middle half and the harder half of the ante's band (no level twice in a run) |
| Deck | Your colony: 80 lemmings at the start |
| Hand | The squad of a level: min(colony, level lemmings), drawn at random; the same squad for every attempt |
| Hand levels | Abilities: 60 points you spread over the eight skills at the start (at most 20 in one); a level gets **min(your ability, the level's allocation)** of every skill |
| Destroyed cards | Lemmings that die in an accepted result leave the colony for good; survivors and rescued lemmings stay |
| Card editions | Gold ($2 when it exits), Lucky (chance of $4 or a tarot), Mentor (+1 ability when it exits), Champion (multiplies the rescue bonus when it exits), Insured (comes back once), permanent Climbers and Floaters |
| Score, chips and mult | The rescue count: the lemmings saved, then the Power Cards from left to right add their **+Rescues** and multiply by their **X Rescues**. It has to reach the requirement, which grows with the rounds (the level's own up to round 2, then ×1.1, 1.25, 1.4, 1.6, 1.8 and ×2 in round 8), so later rounds need Power Cards |
| Suits | Every lemming has a colour of hair and a colour of clothes (Green, Orange, Red, Purple, Blue), drawn in the level and the colony; Power Cards count them (Fully: hair and clothes of one colour). The colony a run starts with is nearly all classic lemmings (green hair, blue clothes); the lemmings that join later bring the colours |
| Jokers (5) | Passive Power Cards: protection against kinds of deaths, money for performance, abilities (also more points to place or move after every boss), and a few rule breakers (+1 Builder above the level maximum, +1 minute, starting climbers or floaters) |
| Tarots (2) | Consumables that change selected lemmings (floaters, climbers, gold, lucky, mentor, champion, insured, clones, retraining into abilities) or the abilities (5 new points, moving 10) |
| Skip | The small and big blind can be skipped for a tag (recruits, floaters, a doubled boss payout, a free shop, ...) |
| Director's Cut | The boss of an ante can be rerolled once ($6), for a level your colony cannot do |
| Hands | A level is played once: in it, Restart starts it again as often as you like, but a level that is not won ends the run |
| Booster packs | Every shop has two packs: a Lemmings Pack and a Training, Boost or Power Pack. Opened, a pack shows 3 cards (a Power Pack 2) to choose one from (or skip): lemmings for the colony (plain ones, floaters, climbers, gold, lucky, ...), abilities (+3, a trade +5/-3, +1 in every skill), boosts (used at once) or Power Cards |

A run starts with the ability assignment: 60 points to spread over the skills, at most 20 in one, with the three
levels of the first ante in view (their allocation, and below it what your team would bring, as you assign).
*Preview* shows a level as it starts at twice its size, with a strip of the whole level: drag it (or the strip, or
use the arrow keys and the mouse wheel) to look for the traps, the gaps and the exits before you choose. *Auto pick*
makes a best guess: every point goes where the levels of the round still to be played can use it (Level 3 counts
most), the rest to the skills most levels need; after a round it moves points while that gains more than it costs. The pictures
of the levels on the blind screen open the same preview. After
every boss blind, before the shop, the next ante's levels are drawn and the assignment comes back: up to 10 points can
be moved to other skills. The Personal Trainer adds 5 new points there and the Careers Advisor 5 more to move; the
Boot Camp (5 new points) and The Rethink (move 10) tarots open the assignment whenever you use them. Training, drives
and mentors add abilities on top of the assignment (also above 20).

The blind screen shows all three levels of the ante up front: the level, its numbers, a thumbnail, and per skill the
original allocation and what you would bring (green: the full allocation, yellow: part of it, red: none). The
allocation works like Balatro's score requirement: it tells you whether your colony looks ready, and invites you to
find another way. Clicking a skill (with a finger: tapping it twice) hires one more for this level ($1). Your best result on a level (over all runs) is
shown as well.

A won level goes straight to the cash out, which shows how the level went (rescued, lost, the special lemmings) and
pays: the blind ($4, $5, $6), a rescue bonus that grows from the requirement to 100% (not the number
of lemmings, so big levels are not worth more), a perfect rescue bonus, gold lemmings, jokers and interest ($1 per $5,
up to $5). A level that was not won is the end of the run. The shop sells training (abilities), recruitment drives, jokers,
tarots and two packs: a pack is opened when it is bought (drag it up, or tap it and Open), the shop makes way for its
cards, and one of them is taken by a tap and Take, or by dragging it up.

Power Cards with a keyword in their description (+Rescues, X Rescues, Respawns, Fully, Wise, Super Lemming) show a box
explaining it next to their tooltip, as in Balatro. The cash out shows how the rescue count was made, card by card.
Some Power Cards make lemmings drop in besides the squad (they are not of your colony), let the money go into debt
(the Payday Loan), give free rerolls, gain sell value or X Rescues as the run goes on, or act after a level (lemmings
join, money for colours, a copy of a lone lemming). A few change the level itself (`app/src/run/level-rules.ts`,
through opt-in hooks of the engine that are off outside a run, and replayed exactly by a rewind): lemmings that drop in
at the first splat or across the level (Paratroopers), walkers that speed up after explosions, the last 30 seconds at
five times the speed, a skill used that goes to the closest lemming too, and skills that come back.

In a level, special lemmings of the squad carry a small mark in the colour of their card. Pressing Escape (or E) ends
a level as in Lemmix: the lemmings that are still out survive (no need to nuke your blockers). The run is saved after
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
the game speed) and of a roguelike run (from the title, a blind played and cashed out, the shop and a pack, a skip, and continuing
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
* The music of the levels is normalised: every track plays as loud as the median track (the files differ by up to
  11 dB; their loudness is in `app/src/musicloudness.ts`). The sounds are 6 dB quieter than in Lemmix, where they were
  about 20 dB louder than the music.
* Replay files are downloaded (`u`) and loaded with a file dialog (`l`); there is no replay finder, level finder,
  autosave or result text file. The options are browser dialogs. User styles (custom levels) are not available yet.
* Touch screens are an addition (see [On a phone or a tablet](#on-a-phone-or-a-tablet)); with a mouse the screens
  work as in Lemmix. The canvas has the resolution of the screen (device pixels), so the level is scaled by whole
  pixels of the screen, as Lemmix scales by whole pixels of its window (the zoom factor option counts pixels as the
  browser shows them).
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
