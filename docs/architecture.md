# Game architecture

## Imports

Use `@/` for imports within `src`, for example:

```ts
import { QUEST } from '@/config';
import type { QuestState } from '@/battle/types';
import { chargeSeal } from '@/battle/quest/sealRules';
```

The alias points to `src/` in `tsconfig.json`, `vite.config.ts`, and
`test/load-source.cjs`. Package imports such as `phaser` keep their package names.
Tests can load source modules with either `load('@/battle/quest/sealRules.ts')`
or the existing `load('src/battle/quest/sealRules.ts')` form.

## Ownership

```text
src/
  main.ts                   Application bootstrap and scene registration
  vite-env.d.ts             Vite's ambient TypeScript declarations
  scenes/                   Phaser screens and lifecycle orchestration
  gameplay/                 Fighter state machine, roles, weapons, skills and items
  ai/                       CPU decisions and balanced random loadouts
  input/                    Player controllers, keyboard, browser pads, Nintendo HID
    contracts.ts            Intent, world-view and controller data contracts
    actions.ts              Saved action indices and display order
    controllerIds.ts        Controller identifiers and lobby options
    keyboard.ts             Key sets, labels and keyboard input
    controllers.ts          Human controller adapters and controller factory
    gamepads.ts             Browser button/stick decoding
    nintendoHid.ts          Direct Joy-Con / Pro Controller protocols
    padSettings.ts          Saved calibration, split and grip settings
    menuInput.ts            Deduplicated controller sources for menus
  battle/                   Round state and battle systems
    combat/                 Hits, projectiles, summons and their rules
    environment/            Hazards, terrain and interactive map features
    objectives/             Towers, princesses, treasure and respawns
    quest/                  Stage mechanics, pure rules and campaign progression
    presentation/           Rendering, effects, HUD and result dialogs
    results/                Pure match statistics, scoring and awards
    BattleState.ts          Shared scene-owned round state
    types.ts                Projectile, tower, chest and checkpoint contracts
    coordinates.ts          Screen/world coordinate conversions
  maps/
    arenas/                 Versus map definitions
    quest/                  Quest map definitions, including the dragon lair
    art/                    Map painting helpers and finishing passes
    common.ts               Shared map types, bounds, placement and paint helpers
    layout.ts               Seeded terrain variation
    index.ts                Registry and arena texture creation
  config/
    display.ts              Dimensions, palette, render scale and scene timing
    gameplay.ts             Combat, movement, resource and objective tuning
    modes.ts                Mode types, difficulty and player limits
    quest.ts                Stage configuration, route selection and checkpoints
    index.ts                Public configuration API
  ui/                       Menu framework, theme and reusable controls
    UIScene.ts              Modal stack, menu routing and input hooks
    FocusNav.ts             Mouse/keyboard/controller focus navigation
    components.ts           Buttons, selectors and toast messages
    theme.ts                Typography, colors, text and panel frames
    skillIcons.ts           Skill badges
    backdrop.ts             Shared menu background and header
    particles.ts            Ambient particle objects
    index.ts                Public UI API
  rendering/                Fighter/weapon art, battle effects and menu artwork
  audio/                    Procedural music and sound effects
  localization/
    locales/en.ts           English strings
    locales/zh.ts           Traditional Chinese strings, checked against English
    index.ts                Language selection and lookup
  state/gameSettings.ts     Saved lobby setup, loadout validation and assignment
```

## State and lifecycle

`BattleScene` extends `BattleState`. The state belongs to the scene instance,
so separate scene instances cannot share timers, fighters or checkpoints.
`init()` resets each round's mutable state, `create()` builds the arena and
fighters, and `update()` controls the order in which systems run.

Systems export functions with an explicit typed receiver. Each module's context
is a `Pick<BattleScene, ...>` listing the state and operations it uses, together
with the Phaser scene API. The night system also uses the fighter `Arena`
contract when it creates its captain. Imports of `BattleScene` in systems are
**type-only**, so they do not create a runtime dependency back to the scene.

At the bottom of `BattleScene`, every operation is explicitly bound once to its
scene. The `OmitThisParameter` declarations give callers ordinary callable
methods while `.bind(this)` checks that the scene satisfies each module's
receiver type. Callbacks therefore keep the correct scene instance. Systems
share live state and call through scene operations, so cross-system changes and
existing test overrides remain visible; they do not copy the scene's state.

Keep pure rules independent from Phaser where possible. Shared data contracts
come from `battle/types.ts`; consumers should not import those types or boss
configuration from `BattleScene`.

## Making changes

- **Balance:** edit `config/`, `gameplay/roles.ts`, `gameplay/skills.ts`, `gameplay/weapons.ts`, or the
  relevant quest rule module. Do not put balance values in rendering code.
- **Stage behavior:** edit the corresponding `battle/quest/` module. For a new
  stage, add its map, config/route registration, localized goal, roster setup,
  initialization/reset state and progression handling. Bind any new operations
  in `BattleScene` and keep their context lists explicit.
- **Visuals:** edit `maps/` for arena art, `battle/presentation/` for battle UI
  and draw order, or the owning objective/stage module for its local graphics.
- **Input/CPU:** edit `input/` for human controls and `ai/` for CPU decisions. Keep
  input mapping separate from stage objectives.

## Verification

Run `npm test` after gameplay changes and `npm run build` before committing.
`npm run check` runs strict TypeScript and the architecture guard. The build also
runs these checks before bundling.
The tests execute gameplay logic with a small Phaser stub; they cover stage
objectives, faction/controller ownership, respawns, retries, results, balance
and drawing geometry. They do not replace a browser/WebGL or physical-gamepad
playtest. The build checks strict TypeScript types and Vite's alias resolution.

## Layout variation and action assignment

`QuestState.layoutSeed` is generated at the start of a new run and retained by
stage advancement and retries. `maps/layout.ts` derives a per-map seed and moves
the two center anchors of an otherwise fixed arena. The monotonic, piecewise
affine mapping keeps existing passages connected. `layoutPoint` maps authored
objective/spawn positions; `layoutRect` maps obstacle edges. Route hints are
queried in authored coordinates and their waypoints are mapped back. Variant
painting clips the four affine sections from the original map artwork with a
consistent art seed. Definitions in `config/quest.ts` and source maps are never mutated.
The battle removes its variant texture on shutdown to bound texture memory.

`input/actions.ts` owns the saved action order. Skill 4 is index 6, preserving
use-item/next-item indices 4/5 in older keyboard and controller saves. UI code
uses `skillAction()` and `DISPLAY_ACTIONS` rather than assuming every skill is
at index `slot + 1`. Loadout assignments go through `state/gameSettings.assignSkill()`.
`UIScene` offers key/pad hooks before normal navigation; `LobbyScene` consumes
skill presses only for the edited character and a focused skill-pool tile.
This prevents a shared skill/Back button from also closing the window.

## Folder and dependency rules

This is a modular, feature-oriented structure for this Phaser project; there is
no universal industry folder tree. The root contains the application entry and
environment declarations. Put behavior with the feature that owns it, and use
shared folders only for genuinely shared responsibilities. Avoid a catch-all
`utils/` or a folder for every individual function.

Player input emits contracts consumed by gameplay and AI. AI decisions live in
`ai/`, not in the player controller implementation. Audio and rendering own their
platform-specific work. Locale data is separate from language selection. The
configuration directory exposes a small public barrel while its implementation
files import each other directly. UI follows the same rule: external consumers
may use `@/ui`, but UI internals use their owning leaf modules.

`scripts/check-architecture.mjs` checks source import resolution, requires `@/`
for internal imports, reserves the source root for entry files, prevents runtime
imports from battle systems back into scenes, and detects runtime import cycles.
Type-only scene references used by battle contexts are permitted. This is run by
`npm run check` and `npm run build` so the layout stays consistent as the game grows.
