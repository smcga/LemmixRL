# Power Card Designer

Run `npm install` once, then `npm run designer`. The tool opens at
`http://localhost:5173/designer.html` (Vite may choose another port if 5173 is busy).
There is also a **Card designer** link on the game’s title screen. A production
build includes `designer.html` alongside the game, including branch previews.

## Design a card

1. Choose an existing card, **Duplicate** it, or select **New card**.
2. Set the name, rarity, price and description. The description is the game’s tooltip text.
3. In **Artwork layers**, select the element you want to edit, or use **+ Lemming**,
   **+ Text** or **+ Icon** to add another. Each card can contain up to 16 elements.
   The list shows the frontmost element first. **↑ Front** and **↓ Back** change
   the drawing order; **Duplicate** and **Remove** work on the selected element.
4. For a lemming, choose any of the 28 original animation variants. Both directions,
   jumping, hoisting and the single-frame explosion are included.
5. Drag an element in the large preview, use the position fields, or focus the
   preview and press arrow keys. Shift + arrows moves five card pixels. Scale
   ranges from 0.25× to 12×. **Centre artwork** resets its position.
6. Replace any original sprite colour using its colour picker. Each lemming has
   its own independent palette, including after duplicating a layer. The palette includes
   colours across _all_ frames. Replacements are applied directly to original
   pixels, including opaque black; transparent pixels remain transparent.
7. Choose background and border colours independently of rarity. Check the
   actual-size preview. Artwork is cropped to the inner card field.
8. For each lemming, choose **Animated** or **Fixed frame**. Animated lemmings loop
   independently at 12 fps. **Fixed frame** exposes a saved pose slider; **Freeze
   current pose** captures the pose visible in the preview. These settings persist
   in JSON and in-game. The preview's main Pause/scrub controls only inspect time;
   they do not change the saved playback settings.

Existing icon/text cards open as editable layers. Select a text layer to change
its text (up to 16 characters) and colour, or an icon layer to choose any skill icon,
slower/faster release, pause or nuke. All layer types have their own scale and
position controls. **Selected layer type** replaces only that element with another
type; the Add buttons preserve the other artwork on the card.

## Save and exchange designs

Valid changes save automatically in this browser, under the designer’s own
storage key. They do not modify a saved run or change the running game. Export
before clearing browser storage or moving to another browser/device.

- **Export card** downloads one card in a versioned library envelope.
- **Export library** downloads all current cards as `catalogue.json`.
- **Import JSON** adds new IDs and replaces matching IDs after confirmation,
  leaving other cards intact. The entire file and resulting library are validated
  before any replacement. Invalid files leave the current draft intact.
- **Restore shipped library** discards the local designer draft after confirmation.

Single-card exports and full libraries use the same format. Import supports up to
500 cards and files up to 2 MB. Import does not publish anything or write files in
the repository. Exported descriptions are plain text, not HTML or executable code.

## Use the designs in the game

The source of names, descriptions, rarity, prices and appearance is:

`app/src/run/power-cards/catalogue.json`

Import your individual card files into the designer, then **Export library** and
replace that source file with the result. Run `npm run build` to validate it and
build the game. Shops, packs, owned cards and the collection all use the JSON
metadata and shared artwork renderer. Existing saved shop offers keep their
already-generated price; new offers use the updated catalogue price.

**No new gameplay effects are implemented by this tool.** The existing effects
remain in `POWER_CARD_EFFECTS` in `app/src/run/content.ts`, keyed by stable card ID.
Existing IDs are locked in the editor to preserve those links. Duplicating creates
a fresh ID. New designs are labelled **Draft · effect pending** and are excluded
from game shops, packs and the playable collection until an effect is explicitly
implemented under their ID. Their descriptions are design notes until then.

Keep the shipped IDs in the source catalogue so saved runs can still resolve
their cards. The normal import workflow preserves them. The designer’s local
library is deliberately separate from the source file used by the game.

## JSON format (version 2)

The designer imports both versions. Version 1 single-artwork exports and existing
browser drafts migrate to one layer automatically, preserving their metadata,
palette and layout. New exports use version 2. No manual conversion is needed.

```json
{
  "version": 2,
  "cards": [
    {
      "id": "night-shift",
      "name": "Night Shift",
      "rarity": "uncommon",
      "price": 6,
      "description": "Describe the intended effect here.",
      "appearance": {
        "background": "#162945",
        "border": "#e9bc77",
        "layers": [
          {
            "type": "lemming",
            "animation": "buildLeft",
            "scale": 3,
            "x": 0,
            "y": -2,
            "colors": { "#00b000": "#dd88ff" },
            "playback": "fixed",
            "frame": 5
          }
        ]
      }
    }
  ]
}
```

Layers are stored back to front. Lemming `playback` is `animated` or `fixed`;
`frame` is zero-based and must be within that animation (the UI shows one-based
frame numbers). Text layers use `type: "text"`, `text` and `color`; icon layers
use `type: "icon"` and `icon`. All types include `scale`, `x` and `y`.

Positions are offsets from the centre of a 66 × 88 card, in card pixels. Scale
multiplies source sprite pixels. Colour keys/values are six-digit hex colours;
unmapped source colours are retained. IDs must be unique, start with a lowercase
letter, and contain only lowercase letters, digits, `_` or `-` (maximum 64
characters). Names allow 80 characters, descriptions 1,000, prices whole numbers
from 0 to 999. Rarity is `common`, `uncommon` or `rare`. Animation keys are listed
in `app/src/run/power-cards/animations.ts`. Unknown fields and unsupported versions
are rejected rather than silently discarded.

## Verification

`npm test` covers JSON validation, unchanged effect IDs, metadata integration,
draft exclusion, version migration, layered JSON validation, independent fixed
and animated frame resolution, palette mapping and all animation/frame indices.
`npm run e2e:designer` checks the complete workflow in Chromium, including exported
artwork rendered in a running Phaser game. It checks text/icon editing, independent
palettes and poses, layer duplication/removal/order, old-draft recovery and pixel
parity with the editor for mixed animation loop lengths. Use `CHROMIUM` to point to a browser
executable, or run `npx playwright install chromium` first. The designer browser
test also runs as part of `npm run e2e` and the existing verification workflow.
