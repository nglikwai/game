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
  scenes/                  Phaser screens and lifecycle orchestration
    BattleScene.ts         Round setup, input, update order, system bindings
  battle/
    BattleState.ts         Shared round state and its initial values
    types.ts               Fighters' projectiles, towers, chests, quest checkpoints
    coordinates.ts         Design/world conversions and arena bounds
    combat/
      actions.ts           Weapon hits, damage, healing, revives, movement skills
      projectiles.ts       Projectile collision and caltrops
      summons.ts           Summon targeting, strikes and feedback
      summonRules.ts       Pure summon probability rules
    environment/
      hazards.ts           Storms, fire, vents, portals, rollers and spikes
      features.ts          Doors, kegs, bells, barriers and herbs
      terrain.ts           Terrain effects, pads, altars, fog, tides and wind
    objectives/
      chests.ts            Treasure spawning, opening and drawing
      princess.ts          Walls, princess rescue and the rescue gate
      towers.ts            Tower damage, healing, arrows, drawing and respawns
      towerConfig.ts       Tower stats and projectile definitions
    quest/
      progression.ts       Win/loss rules, waves, carry-over, retries and advancement
      roster.ts            Stage enemy counts, boss gear and scaled boss roles
      factions.ts          Per-player factions, lobby rules and boss seat selection
      tree.ts              Princess/warden trees and their summon attacks
      treeRules.ts         Pure tree spell selection and timing rules
      grove.ts             Rotating cursed-grove tree effects
      snare.ts             Trapped teammates and the snare trees
      night.ts             Night captain, darkness and candle mechanics
      dirge.ts             Bell Oni mechanics
      bosses.ts            Boss reinforcements and paired warden revival
      escort.ts            Lantern updates, damage handling and drawing
      escortRules.ts       Pure lantern movement and contest rules
      seals.ts             Seal updates, enemy respawns and drawing
      sealRules.ts         Pure seal charging rules
      hud.ts               Stage objectives and boss bars
    presentation/
      effects.ts           Battle animation hooks, poses, banners and floating text
      renderer.ts          Battlefield draw order and fighter rendering
      hud.ts               Player panels, skill layout and loadout refresh
      results.ts           Ranked result table, awards and round-end dialogs
  maps/                    Map layouts, terrain definitions and arena artwork
  config.ts                Balance values, stage registry and randomized routes
  controls.ts              Controller implementations and CPU decisions
  Fighter.ts               Individual fighter state and skill execution
  i18n.ts                  English and Traditional Chinese text
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

- **Balance:** edit `config.ts`, `roles.ts`, `skills.ts`, `weapons.ts`, or the
  relevant quest rule module. Do not put balance values in rendering code.
- **Stage behavior:** edit the corresponding `battle/quest/` module. For a new
  stage, add its map, config/route registration, localized goal, roster setup,
  initialization/reset state and progression handling. Bind any new operations
  in `BattleScene` and keep their context lists explicit.
- **Visuals:** edit `maps/` for arena art, `battle/presentation/` for battle UI
  and draw order, or the owning objective/stage module for its local graphics.
- **Input/CPU:** edit `controls.ts`, gamepad helpers and menu navigation. Keep
  input mapping separate from stage objectives.

## Verification

Run `npm test` after gameplay changes and `npm run build` before committing.
The tests execute gameplay logic with a small Phaser stub; they cover stage
objectives, faction/controller ownership, respawns, retries, results, balance
and drawing geometry. They do not replace a browser/WebGL or physical-gamepad
playtest. The build checks strict TypeScript types and Vite's alias resolution.
