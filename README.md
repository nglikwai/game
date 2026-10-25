# Arena Duel 競技場

Ninja-style (忍者) top-down arena brawler for up to 8 fighters (4v4), built with Phaser 4: up to 4 human players,
the rest CPU. CPUs roll a random role, weapon and a sensible skill set every round.

```
npm install
npm run dev      # http://localhost:5173
```

## Language
The interface defaults to Traditional Chinese (繁體中文); 設定 (Settings) on the title screen switches to English
and toggles sound effects and music. All UI text lives in `src/i18n.ts`.

## Modes
- **混戰 Free-for-all**: last fighter standing wins.
- **團隊戰 Team Battle**: each player picks 紅隊 / 藍隊. No friendly fire. Last team standing wins.
- **拯救公主 Save the Princess**: each team's princess is walled in on the *enemy's* side. Your weapon only
  damages your own princess's wall (projectiles don't). The first team to break their wall wins. Fallen players come
  back after 3 s. Wall HP scales with team size.
- **攻城戰 Siege**: destroy all three enemy towers to win.
- **闖關 Quest**: up to 4 players (P1–P4, humans or CPU allies) fight through three underworld (地獄) stages,
  each with its own map: 第一關 三途川 Sanzu River (defeat every enemy, two waves; cross the blood river on bone
  bridges), 第二關 閻羅城 Yama's Fortress (destroy two great towers behind an obsidian wall with three gates; they
  shoot, heal and keep sending enemies back), 第三關 鬼王殿 Oni King's Hall (slay 鬼王, the Oni King: lots of HP,
  hits 60% harder, bigger, hard to knock back, plus a few grunts). Enemy numbers and tower / boss HP scale with the
  party. Between stages the fallen come back and everyone heals; items, soul and stats carry over. If the whole party
  falls you can retry the stage or start over. The underworld has its own music, with a boss theme for the last stage.

**Watchtowers (箭塔)** appear in every team mode: two front towers per team (one smaller and weaker; the small ones sit diagonally) plus a
bigger main tower (本陣) at the back. Towers shoot the nearest enemy in range (arrows fly over obstacles); teammates inside a tower's aura recover PE
twice as fast and take 20% less damage. Wounded teammates inside their main tower's aura slowly draw HP from it (+4 HP/s, the
tower loses the same; it never drains below 10%). Weapons and projectiles can destroy enemy towers, and the attacking team gets
a 5 s War Drum when one falls. Only the main tower can bring players back (the small towers can't): while a team's main tower stands, its fallen players come back one at a time there, with 75% HP, an empty pocket and half their 魂 (each respawn costs that tower 10% of its max HP, but never destroys it); the wait starts at 4 s and grows to
14 s as the battle goes on. In Team Battle a team is out once it has no
one standing and no main tower left. Tower and respawn numbers are in `src/config.ts`.

Every round starts with a 3-2-1 countdown; nobody can move until it ends.

## Maps
古寺庭院 Temple Courtyard · 竹林渡口 Bamboo River (cross by two bridges) · 雪之神社 Snow Shrine (torii ring) ·
夜之城下町 Castle Town (night streets) · 熔岩洞窟 Lava Cave (island in a lava moat, four bridges) ·
櫻花錦鯉池 Koi Pond Garden (red bridge over the pond) · 忍者道場 Ninja Dojo (three rooms, doorways) ·
稻田村莊 Rice Paddy Village (mud: half speed) · 冰湖 Frozen Lake (ice: you slide) · 港口碼頭 Harbor Docks
(piers out over the sea) · 溫泉鄉 Hot Spring Village (hot springs: 75% speed but heal 3 HP/s) ·
古墓夜 Haunted Graveyard (misty night, tombstone rows, mausoleum). 沙漠遺跡 Desert Ruins (sand: 80% speed off the stone floors; quicksand pits) ·
毒沼 Poison Swamp (toxic bog: 70% speed and −3 HP/s, never below 1 HP) · 竹林迷宮 Bamboo Maze (bamboo corridors) ·
風之谷 Wind Canyon (wind bands push you along) · 雷鳴山頂 Thunder Peak (lightning strikes marked spots every few
seconds, hurting anyone there) · 沉船海灘 Shipwreck Beach (sea and slow surf at the top and bottom, a broken wreck
with its treasure in the gap). Water, lava and the sea block walking, but projectiles fly over them.
Each map lives in `src/maps/` (obstacles, chest spots, art, CPU routing). 🎲 Random Map picks a new one every round.
火山口 Volcano Crater (fire vents erupt two at a time after a warning) · 傳送神社 Portal Shrine (three portal pairs) ·
夜市祭典 Night Festival (a golden lane that speeds you up, fireworks) · 落石山道 Rockslide Pass (boulders roll down
the roads after a warning) · 機關城 Trap Castle (two sets of spike traps take turns) · 水晶洞窟 Crystal Cave
(crystals bounce shots instead of stopping them). 斷崖吊橋 Chasm Bridges (two chasms, rope bridges only) · 機關工房 Clockwork
Workshop (conveyor belts carry you) · 濃霧森林 Fog Forest (fog hides you from CPUs and towers until they're close) ·
雲上跳台 Sky Pads (launch pads fling you across) · 魂之祭壇 Soul Altar (hold the altar alone to charge 魂 and 體力) ·
潮汐海岸 Tidal Flats (the flats flood and drain on a cycle). 開合神殿 Sliding Door Temple (shoji doors open and shut in turns) ·
火藥庫 Powder Magazine (explosive kegs that chain-react) · 大鐘寺 Great Bell Temple (the bell's toll blasts everyone
near it outward) · 結界之原 Barrier Plain (a shrinking barrier; outside it you lose HP) · 漩渦海峽 Whirlpool Strait
(whirlpools drag you in) · 藥草園 Herb Garden (healing herbs that regrow).
The map selection screen (six maps per page, ◀ ▶ to flip pages) opens from the 地圖 chip in the lobby; it isn't a
separate step on the way to a battle.
Maps are designed in screen coordinates and scaled up by `MAP_SCALE` for battle, so there's room for 8 fighters.
Start positions are fixed but shuffled every round, and in team modes red's side is random.

## Rules
- **Roles**: 浪人 Ronin (balanced) · 武士 Samurai (140 HP, hard to interrupt, +40% healing received, 15% slower) · 忍者 Shinobi (80 HP,
  15% faster, cheaper movement skills) · 術士 Mystic (90 HP, 120 PE that recovers 25% faster). Set in the loadout window.
- **HP** (red) never regenerates by itself. **PE / 體力** (yellow) does: fastest standing still (×1.7), slowest
  while moving (×0.6). Attacks and skills cost PE.
- **Weapons** all cover the same hit area (`WEAPON_AREA`). Damage, knockback and PE cost scale with swing time, so
  every weapon has equal damage- and PE-per-second: fast ones hit soft, slow ones hit hard. While swinging, hits
  weaker than half your weapon's force don't interrupt you (poise).
  火扇 Fire Fan · 手裡劍 Shuriken · 大錘 Hammer · 雙匕 twin kunai · 流星錘 chain weight ·
  鎖鐮 Kusarigama (mid-range band, blind spot up close) · 焙烙玉 Fire Bomb (lands ~175 px away) ·
  忍刀 Ninjato (lunging slash) · 雷符 Thunder Talisman (lightning in a cross around you) ·
  棍 Bō Staff (a bar through you: hits in front and behind at once) · 苦無 Kunai Volley (three thin rays fanning out:
  long reach, gaps between them).
- **Skills**: each fighter equips up to 3 skills from one shared pool, in any combination, in the loadout window:
  調息 Meditate, 回春 Second Wind, 飛箭 Arrow, 火球 Fireball, 疾走 Sprint, 閃步 Blink Dash, 霸氣 Fury (+50% attack),
  金鐘罩 Golden Bell (−50% damage taken), 隱身術 Vanish (nearly invisible, +25% move speed; CPUs lose you), 替身術 Substitution
  (the next hit lands on a log), 撒菱 Caltrops (spikes that slow and hurt enemies), 捨身 Self-Sacrifice (charge for 0.7 s, rooted, with the blast area shown on the ground; then spend 30 of your own HP for a blast that deals 60 to every enemy around you; with 30 HP or less it costs your life, but still hits for 60), 瞬身術 Body Flicker (teleport far from enemies), 癒之陣 Healing Circle
  (heal the whole team), 回氣陣 Spirit Circle (team PE), 戰鼓 War Drum (team +30% damage), 聖火 Holy Fire / 天雷 Thunder / 死神 Reaper (see 魂 below),
  續命 Lifeline (revive a fallen
  teammate from anywhere, beside you; your HP is split between you).
- **魂 Soul**: hurting enemy fighters fills a 4-level meter (24 damage per level); being hurt fills it too, at 40% of
  the damage taken. Pressing a summon without a full level shows 「魂不足」 and flashes the soul diamonds; every strike
  shows 「命中！」 or 「落空」 over its target, and a tally (e.g. 命中 2 / 3) appears over the caster. The 召喚 summoning skills spend
  every full level: one strike per level on the nearest enemies anywhere on the field (level 4 = the 4 nearest), and
  **the more soul you spend, the more likely each strike is to hit**:

  | Skill | Hit chance (soul lv 1/2/3/4) | On a hit |
  |---|---|---|
  | 聖火 Holy Fire | 85 / 90 / 95 / 100% | 5–12 damage, 1.2 s paralysis |
  | 天雷 Thunder | 55 / 65 / 75 / 85% | 5–30 damage, 2 s paralysis |
  | 死神 Reaper | 10 / 15 / 20 / 25% | 80 damage, 2.5 s paralysis |
  | 神樹 Sacred Tree | 75% (3 enemies per soul level) | 5 damage, 3.5 s paralysis |

  A miss still paralyses for 0.8 s (paralysed fighters can't act, but can't be hurt either). Calling a summon takes
  1 s (the caster can't act and can't be hurt), and the strikes land when the call finishes.
  死神 shows up in person: a hooded reaper rises behind each target and swings his scythe; on a hit, skeletal hands
  grab the victim, a chain binds them and their soul is torn out.
- **Treasure chests (寶箱)**: each map places a fixed, mirrored set at the start (corner piles are often empty, the
  contested middle rarely is; big red chests are never empty and hold 2 items). More drop in at random during the
  fight, and more players means more chests. Break one with your weapon and its item goes into your pocket
  (3 slots): 飯團 +25 HP, 體力茶 +60 PE, 靈氣丹 full PE, 霸氣丹 Fury, 金鐘符 Golden Bell, 疾風符 Sprint,
  火球符 a fireball, 還魂丹 revive a teammate, or save you: if you die with one in your pocket it is used up and revives you on the spot with 40 HP. Items cost no PE. With a full pocket, a new item is used
  immediately.

## Screens
Title → Mode select → Fighter setup (lobby, where the map is picked too) → Battle. In the lobby, each player card has 編輯裝備 (Edit Loadout),
which opens a window for weapon, skills and key bindings. Arrow keys / Enter / Esc work everywhere; the mouse works
too. In battle, Esc pauses; the round ends with a results window (damage, KOs, wall damage).

## Controls
The table shows the default keys. In the menu, each keyboard player can click their Attack / Skill 1–3 key boxes
and press any key to rebind it. Bindings are saved in the browser. Movement keys are fixed by the key set.

| Slot | Move | Attack | Skills 1 / 2 / 3 | Use item / Next item |
|---|---|---|---|---|
| Keys: WASD | WASD | F | Q / E / R | G / C |
| Keys: Arrows | Arrows | / | . / ; / ' | ] / [ |
| Keys: IJKL | IJKL | H | Y / U / O | N / B |
| Keys: Numpad | Num 8 4 5 6 | Num 0 | Num 1 / 2 / 3 | Num+ / Num− |
| Gamepad | Left stick / D-pad (right stick aims) | A or RB | Y / B / X (or LB) | RT / LT |
| Switch Pro / Joy-Con pair | Left stick / D-pad (right stick aims) | B or R | X / A / Y (or L) | ZR / ZL |
| Joy-Con (L), sideways | Stick | ← | → / ↓ / ↑ | SR / SL |
| Joy-Con (R), sideways | Stick | A | Y / X / B | SR / SL |

Esc returns to the menu. Enter rematches after a round.

**Gamepads and Switch Joy-Cons** also drive the menus: stick / D-pad moves, + / − pauses a fight. To confirm / go back:
A / B on a Switch Pro Controller or Joy-Con pair, A / X on a sideways Joy-Con (R), ← / ↓ on a sideways Joy-Con (L),
and the bottom / right face buttons on other gamepads. To use Joy-Cons, pair them with the computer over Bluetooth first, then press
a button so the browser sees them. Each single Joy-Con, held sideways, is its own player (手把 1, 手把 2, …), and the
lobby card shows which controller is on that slot. A single Joy-Con has no aiming stick, so you aim where you move.

## Where things live
- `src/config.ts`: tuning numbers (HP, PE regen, balance budgets)
- `src/weapons.ts`: weapon shapes, with dimensions solved so the area is equal; hit tests
- `src/skills.ts`: skill pool per slot
- `src/Fighter.ts`: fighter state machine (attack, skills, hits, PE)
- `src/controls.ts`: keyboard, gamepad and CPU AI controllers
- `src/gamepads.ts`: gamepad reading, including Switch Pro Controllers and single sideways Joy-Cons
- `src/i18n.ts`: Traditional Chinese / English UI text
- `src/maps/`: the thirty-six maps, the three Quest-only underworld maps (`hell.ts`), shared map helpers and spawn points
- `src/art.ts`: ninja characters, held weapons, weapon / item icons (all drawn in code)
- `src/fx.ts`: particles and strike effects (flames, shuriken streak, shockwave, slashes, smoke)
- `src/roles.ts`: the four roles
- `src/cpuLoadout.ts`: random CPU role / weapon / skills
- `src/items.ts`: chest items, drop chances and pocket size
- `src/sfx.ts`: sound effects generated with the Web Audio API (including menu button sounds, and a synthesized
  death scream whose voice depends on the fighter: deep for a 武士 or the boss, high for a 忍者)
- `src/music.ts`: procedural background music: koto and flute in the menus, taiko and shamisen in battle, dark
  'hell' and 'boss' pieces for Quest, and victory / defeat music at the end of a round
- `src/settings.ts`: saved lobby setup (mode, slots, loadouts) and validation
- `src/ui.ts`: UI kit (theme, frames, buttons, modals, arrow-key focus navigation)
- `src/scenes/`: Title, Mode, Lobby (+ loadout window) and Battle scenes
