# Shadow & Steel 影刃亂鬥

Ninja-style (忍者) top-down arena brawler for up to 8 fighters (4v4), built with Phaser 4: up to 4 human players,
the rest CPU. CPUs roll a random role, weapon and a sensible skill set every round. In team modes,
they avoid roles already chosen by human teammates and each other; once every role is represented,
they choose among the least-used roles. Quest balances the party and enemies separately.

```
npm install
npm run dev      # http://localhost:5173
```

In menus, the Joy-Con stick moves between options. Press its confirm button to cycle a setting
or activate a button; holding confirm changes a setting only once per press. Keyboard left/right
still adjusts settings, and Enter/Space cycles them too.

## Language
The interface defaults to Traditional Chinese (繁體中文); 設定 (Settings) on the title screen switches to English
and toggles sound effects and music. All UI text lives in `src/localization/index.ts`.

The menus share an ink-blue and brass style: illustrated fighter portraits and weapon crests,
map thumbnails, framed skill badges and clear primary actions. The lobby keeps all eight slots
on screen; each Quest lobby previews its own four stages. Mode selection, maps, controller setup,
dialogs, battle HUD panels and MVP/SVP medals follow the same visual language.

## Modes

In **闖關**, choose **自由 / Free** under the faction rules to give each active player card its own **勇者陣營 / Heroes** or **地獄陣營 / Hell** selector. P1 can play a hero while P2 (or any other players) controls a Hell enemy in the same run. Mixed factions compete over the existing stage objectives: heroes advance by completing them, Hell wins by defeating the heroes or pushing the lantern home. Each stage announces its winning faction, and both sides can continue along the randomized route. CPU fighters fill the remaining seats when Hell is playable. All-hero cooperative runs and all-Hell defensive runs remain available. In the finale, the first human Hell player controls the Oni King, or the first two human Hell players become Crimson/Jade (CPU fills a missing boss). Human bosses use four skills on the usual buttons; CPU bosses retain four. Player numbers, controls, items and stats stay with their selected faction across stages. Factions stay fixed during retry setup; weapons, skills and controls can still be edited.

- **混戰 Free-for-all**: last fighter standing wins.
- **團隊戰 Team Battle**: each player picks 紅隊 / 藍隊. No friendly fire. Last team standing wins.
- **拯救公主 Save the Princess**: four princesses occupy the four corners, two per team on the *enemy's* side.
  Your weapon only damages walls holding your own princesses (projectiles don't). Rescue both to win; a live
  counter shows each team's progress. Freed enclosures stop blocking movement. Reinforced walls have 680 HP
  each for a two-player team (scaled with team size), twice their previous HP, and thicker brickwork.
  Fallen players can respawn while their main tower stands.
- **攻城戰 Siege**: destroy all three enemy towers to win.
- **遠征闖關 Expedition — 霧林破陣 Mistwood Breach**: a connected forest world for up to four heroes,
  roughly 5,000 × 3,200 battlefield pixels. The camera follows the human party and smoothly zooms out for
  local co-op; a movement boundary keeps human players together. CPU allies follow and protect the party.
  Explore the village and river outpost in either order, defeat both captains and their guards, then enter
  the fortress to defeat the Thorn Commander. An optional healer rescue unlocks a one-use healing station.
  The commander aims a charge for 0.5 seconds, crashes into stone pillars, raises temporary thorn walls,
  and calls guards at half health. Destroy his rally banner to stop further reinforcements.
  Stand beside a fallen ally for three uninterrupted seconds, away from nearby enemies, to revive them.
  A party wipe offers checkpoint retry or equipment editing; cleared camps and the map seed survive both.
  The fortress checkpoint activates after both captains fall. The minimap tracks exploration and objectives;
  foreground trees fade near fighters. Trees vary between runs while roads and objectives remain connected.
  CPU-only parties can navigate and demonstrate the stage. This first expedition uses the existing weapons,
  four equipped skills, loading sequence and MVP/SVP results.
- **闖關2 Quest 2**: a separate four-stage campaign containing 妖樹苑 Cursed Grove, 封印祭壇 Sealed Altars, 引魂燈道 Spirit Lantern Road, and the new 雙煞鬼門 Twin Warden Gate. Hold each altar for 8 seconds; escort the lantern against guards returning every 14 seconds. The finale pairs a hammer-wielding Crimson Warden with a talisman/fire-casting Jade Warden. Defeat both within 12 seconds of each other or the fallen one revives at 60% HP. Each warden has 180 + 70 HP per party member. Both campaigns keep the same party bonuses, loading sequence, setup editing, checkpoint retries and item/soul/stat carry; completing one does not enter the other.
- **闖關 Quest**: up to 4 players (P1–P4, humans or CPU allies), with 5% faster movement, fight through four underworld (地獄) stages,
  each with its own map: 第一關 三途川 Sanzu River (defeat every enemy, two waves with a five-second break; cross the blood river on bone
  bridges), 第二關 閻羅城 Yama's Fortress (destroy two great towers behind an obsidian wall with three gates; they
  shoot, heal and keep sending enemies back; CPU allies prioritise fighting guards and protecting teammates,
  attacking towers while the guards are defeated or respawning; enemy respawns cost their tower 10% of its max HP,
  can exhaust the tower, and take 10–35 seconds each as the fight progresses), 第三關 幽樹囚庭 Cursed Tree Prison (rescue both princesses from
  reinforced walls while a tree behind them randomly calls Holy Fire, Thunder, Reaper or Sacred Tree on living
  party members), 第四關 鬼王殿 Oni King's Hall (slay 鬼王, the Oni King: lots of HP,
  hits 60% harder, bigger, hard to knock back, plus a few grunts). The boss moves at 105% of normal player speed,
  has 25% shorter skill cooldowns and takes at most one second of paralysis per episode; further hits cannot extend it.
  Every 10 seconds it can spend 8% of its max HP to bring back a guard (or fill a reserve slot),
  up to four living enemies including itself. Each returned guard rolls a random weapon and three role-appropriate skills, never Lifeline; its role, scaled HP and stats remain intact. Boss summons gain ten percentage points of hit chance (capped at 100%); ordinary player summons are unchanged. It cannot spend its last HP this way. Enemy numbers and tower / boss HP scale with the
  party. Between stages the fallen come back and everyone heals; items, soul and stats carry over. If the whole party
  falls you can retry the stage, change your party's setup before retrying that same stage, or start over.
  Changing setup preserves the stage-start items, soul and stats checkpoint. The underworld has its own music, with a boss theme for the last stage.
  **龍巢 Dragon's Lair** is one of the two semi-finals (each run draws one fight, two tactics, one dragon semi-final, then the finale): a three-headed dragon walks the
  right half of the cave, keeps its distance from the nearest fighter and turns to face it, so its heads can shoot in
  any direction. Each head is a separate target riding on the body (90 + 450 HP per party member), and the heads take
  turns aiming at a fighter (the head glows while it takes aim, then locks for a moment before the shot). Shots are fast,
  reach across the whole cave and burst where they land (on a fighter, a stone or the wall) over a wide area, so step
  out of the way when a head starts glowing, or put a standing stone between you and the dragon. 炎首 fires a wide fan of three fireballs
  (灼燒 burn: 2 HP/s for 3 s, healing on you halved), 冰首 fires a fast ice shard and a second re-aimed one (凍傷 frostbite:
  40% slower and slower swings for 2.5 s; a second ice hit while frostbitten 冰封 freezes you for 1 s), and 雷首 fires one
  very fast bolt (感電: 0.8 s paralysis, −15 PE, and it chains to the nearest teammate for half). Fire melts a freeze;
  lightning does +50% to the frostbitten. Cutting off a head stops its element, but the others shoot 20% faster for each
  head lost; while any guard stands the dragon holds back a little. Each head randomly chooses, with equal chances,
  between its usual projectiles and a
  three-second beam sweeping through 90 degrees. Its head glows for 0.5 s first, with no warning lines. Fire breath
  burns, ice breath chills and freezes, and lightning breath shocks; beam control effects last at most 0.15 s and
  it hurts the moment it touches someone (with a flaring splash on them), then every 0.5 s while they stay in it, at half projectile damage. Stone pillars and chests block the beam. Cutting off the firing
  head interrupts it. Three guards (cave cultists: 70% HP, 85% damage)
  start in front of it, and while any head lives a fallen guard comes back beside the dragon every 12 s, up to three
  standing. To pass, cut off all three heads, then defeat the remaining guards. Healing herbs grow in the left half of
  the cave. CPU allies fight guards that come close and otherwise chase the heads. In a Hell run the dragon fights on
  Hell's side, which loses only when the guards and all heads fall.
  **日月峽 Eclipse Gorge** is the other semi-final: the **日月雙龍 Sun & Moon Wyverns**, two single-headed wyverns
  (250 + 900 HP per party member each) that walk the gorge, the Sun in the upper half and the Moon in the lower, keeping
  their distance from the party and 280–620 px from each other. A **lightning chain** joins them while both stand and
  shocks anyone touching it every 0.5 s (short paralysis), so it sweeps the gorge as they move. 曜日龍 the Sun Wyvern
  either drops **烈日墜 Sunfall** (a sun bomb marked under up to three fighters, landing 1.3 s later with a fire burst)
  or lines up a **烈焰衝鋒 Blaze Charge** (its lane shows for 1 s, then it rushes down it, burning and knocking aside
  everyone in the way). 蝕月龍 the Moon Wyvern sends out a **寒月環 Frost Ring** that spreads across the gorge with
  three safe gaps (bright wedges show where they will open; anywhere else on the ring is frostbite, or a freeze if
  already frostbitten) or a fan of five **月影冰刺 Moon Shards**. **The bond**: when one wyvern falls, the other attacks
  60% faster and raises it 15 s later at half HP; fell both within 15 s and they stay down for good. Two guards
  (bandits: 80% HP, 85% damage) fight in front; while both wyverns stand, a fallen guard returns every 18 s. To pass,
  fell both wyverns and the guards. Boulders and a standing stone give cover; herbs grow at the mouth of the gorge.
  In a Hell run the wyverns fight on Hell's side, which loses only when both wyverns and every guard fall.
  **赤砂伏擊 Red Sand Ambush** joins the first 「擊敗敵人」 phase, which draws one of four opening fights.
  Heroes start together on a ring of skulls in a hellish waste of scorched black rock and glowing lava cracks; enemies attack from both side walls. Clear every enemy
  to pass. Ambushers retain their original 125% role HP, normal damage, and two-to-four enemy scaling.
  Four huge funnels of blood-red sand (580 × 280 design pixels) cover about 70% of the arena, leaving a cross of rock
  between them. Inside one, the pull and the damage (3 up to 10 per second) grow toward the middle.
  The small round core (10% of the pit's shorter radius) is instantly fatal, including while casting or holding a Revival Pill.
  Weapon and barrel knockback can push either side into the pits. CPUs fight on the sand but route around each pit's
  deep middle (the inner 40%), and never dash or shadow-step into it; forced spawn positions and random chests stay clear. Stone cover, explosive barrels and healing herbs provide room to fight back.
  Hell players take the ambushers' side. Randomized pit geometry and visible funnels stay aligned on retry.
  **引魂古道 Spirit Lantern Path** is a carrying trial in the six-stage tactical pool (two are drawn per run).
  Collect blue wandering spirits at the three springs and bring six back to the green lantern on the left.
  Each hero can carry one; being defeated or trapped drops it for another hero to recover. Delivery is immediate.
  Up to three spirits are available at once, with replacements every eight seconds until six can be delivered.
  Guards return one at a time every ten seconds and prioritize couriers; CPU heroes collect and return spirits.
  Delivering the sixth clears immediately, without needing to defeat the remaining guards. Hell players intercept
  the couriers and win by defeating the heroes. Both new stages keep the run's randomized layout on retry.
  The party fights with 120% of its role's max HP and recovers PE 10% faster in every Quest stage (including
  CPU allies, stacking with role and tower bonuses). Enemy and boss PE recovery stays unchanged.
  In stage 2 the party also has a small tower of its own that shoots enemies and buffs allies standing near it (it can be destroyed, and it doesn't bring anyone back). Enemies never get 續命 Lifeline. Stage 2 towers revive guards at 2.5 times the normal wait (10–35 seconds); the stage 3 tree uses twice the normal wait (8–28 seconds).
  Stage 3 walls each have 900 + 250 HP per party member (1,150 solo; 1,400 for two; 1,900 for four). The tree
  marks a fixed spot before casting: Holy Fire lands after 0.8 seconds, Thunder after 1.1 seconds,
  while Sacred Tree and Reaper retain their 1.6-second warning (plus the Reaper's existing scythe swing).
  Leave the circle to avoid both damage and paralysis.
  Its summons use level-two hit chances with 25% more damage and a five-second cooldown between casts.
  The tree stays a tree, shoots no arrows, and acts as an enemy main tower with 900 + 300 HP per party member.
  It heals nearby guards and spends 10% of its max HP per guard respawn; that cost can exhaust it.
  CPU allies prioritise defending teammates and fighting guards before the princess walls or tree, as in stage 2.
  Rescue both princesses, destroy the tree and defeat all remaining guards to advance. The tree keeps casting until
  destroyed, then stops both attacks and respawns. Retry resets this stage; advancing preserves items, soul, stats and award totals.
  In Quest 2 stage 1 (the grove), tree effects rotate after 40 seconds of activity with a five-second rest between effects. The summoning tree has 50% more HP than the other two trees.
  Quest 2 stage 2 uses a golden stone courtyard with three nonblocking altars. CPU allies capture safe altars and defend threatened teammates; guards return one at a time every twelve seconds while any seal remains. Break all three seals to advance, even if guards remain alive.

**Watchtowers (箭塔)** appear in every team mode: two front towers per team (one smaller and weaker; the small ones sit diagonally) plus a
bigger main tower (本陣) at the back. Towers shoot the nearest enemy in range (arrows fly over obstacles); teammates inside a tower's aura recover PE
twice as fast and take 20% less damage. Wounded teammates inside their main tower's aura slowly draw HP from it (+4 HP/s, the
tower loses the same; it never drains below 10%). Weapons and projectiles can destroy enemy towers, and the attacking team gets
a 5 s War Drum when one falls. Only the main tower can bring players back (the small towers can't): while a team's main tower stands, its fallen players come back one at a time there, with 75% HP, an empty pocket and half their 魂 (each respawn costs that tower 10% of its max HP; in normal modes this never destroys it, while Quest stage 2 enemy towers can be exhausted); the normal wait starts at 4 s and grows to
14 s as the battle goes on. In Team Battle a team is out once it has no
one standing and no main tower left. Tower and respawn numbers are in `src/config/index.ts`.

Starting from the lobby and entering any Quest stage (including retries) shows a silent five-second loading screen, followed by a transition sound over one second of black. The arena music begins when the game scene appears.
Every round then shows the frozen battlefield for three seconds before a five-second
5-4-3-2-1 countdown; nobody can move until it ends.

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
All 42 versus maps and eight Quest maps share a finishing pass with individually chosen materials and palettes:
stone bevels and wear, timber grain, woven tatami, sand ripples, frost crystals, leaf litter, reflections and border crests.
The finishing pass avoids objectives and functional terrain, preserves every layout, and is baked into the cached map
texture so the same art appears in battle and in previews without extra per-frame work.

Skills have distinct cast flourishes: healing lotuses, faceted golden shields, wind streaks, fury flares, spirit diamonds
and departure seals for ninja tricks. Team skills mark their living recipients, and Lifeline draws a thread to the revived
ally. Thunder, Holy Fire, Sacred Tree and Reaper have separate ritual glyphs and matching target marks; their lighting
stays within the caster's local circle. Holy Fire blooms into tapered flames and roots rise into a leafy cage.
All sixteen weapons have their own motion and impact treatment: tapered fire and frost crescents, shuriken
afterimages, three kunai trails, hammer debris, visible chain links and a spiked flail head, crossing dagger cuts,
a pointed sword lunge, a travelling spear pressure ring, paper lightning charms and layered bomb pressure waves, nunchaku sticks whirled out to both sides,
and a nine-section chain whip lashed along its S. 雙節棍 Nunchaku hits only to your left and right (nothing straight ahead
or behind), so turn side-on to strike; 九節鞭 Chain Whip hits along an S-shaped band in front, leaving pockets in its bends; 風車刃 Windmill Blade
whirls three curved blades all round you, missing whoever stands between them; 月牙鏟 Crescent Spade scoops a U in front
with its horns pointing forward, never reaching far ahead.
Weapon-specific hit accents appear only when damage lands. Throwing glints use the game clock, so pausing
also freezes them; all visual effects expire without changing weapon reach, damage or attack timing.
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
茶屋露臺 Tea House Terrace (healing pools and a fast golden path) · 風暴神社 Storm Shrine (opposing winds and
warned lightning strikes) · 水沒古城 Sunken Ruins (tidal courtyards around a dry causeway) · 冰焰鍛冶場 Frostfire
Forge (slippery ice and erupting fire vents) · 月下果園 Moonlit Orchard (foggy groves and regrowing herbs) ·
星象觀測臺 Astral Observatory (paired star gates, reflecting crystals and a soul altar).
The map selection screen (six maps per page, ◀ ▶ to flip pages) opens from the 地圖 chip in the lobby; it isn't a
separate step on the way to a battle.
Maps are designed in screen coordinates and scaled up by `MAP_SCALE` for battle, so there's room for 8 fighters.
Start positions are fixed but shuffled every round, and in team modes red's side is random.

## Rules
- **Roles**: 浪人 Ronin (balanced) · 武士 Samurai (140 HP, hard to interrupt, +40% healing received, 15% slower) · 忍者 Shinobi (80 HP,
  15% faster, cheaper movement skills) · 術士 Mystic (90 HP, 120 PE that recovers 25% faster, 10% shorter skill cooldowns). Set in the loadout window.
- **HP** (red) never regenerates by itself. **PE / 體力** (yellow) does, at a steady 12 per second
  (Mystic ×1.25, ×2 in a friendly tower's aura), pausing 0.5 s after you spend some. Only skills cost PE.
- **Weapons** use a shared hit-area baseline (`WEAPON_AREA`); Shuriken cover 25% more area with a wider lane at the same reach, and the Flail covers 15% more area. Swinging costs no PE; PE only pays for skills.
  Damage and knockback scale with swing time, so fast weapons hit soft and slow ones hit hard. Each weapon's damage rate is
  then scaled by its `power` (0.8–1.3): weapons that are easy or safe to land (long reach, all-round cover, a lunge) hit
  softer, and short, slow or blind-spotted ones hit harder. While swinging, hits
  weaker than half your weapon's force don't interrupt you (poise).
  火扇 Fire Fan · 手裡劍 Shuriken · 大錘 Hammer · 雙匕 twin kunai · 流星錘 chain weight ·
  鎖鐮 Kusarigama (mid-range band, blind spot up close) · 焙烙玉 Fire Bomb (lands ~175 px away) ·
  忍刀 Ninjato (lunging slash) · 雷符 Thunder Talisman (lightning in a cross around you) ·
  冰棍 Ice Staff (a bar of ice through you: hits in front and behind at once, with a frosty trail and ice crystals on whoever it hits) · 苦無 Kunai Volley (three thin rays fanning out:
  long reach, gaps between them) · 長槍 Yari Spear (a long, narrow thrust with a red tassel; strong reach,
  slower strikes and precise aiming, without moving the fighter forward).
- **Skills**: each fighter equips up to 3 skills from one shared pool, in any combination, in the loadout window:
  調息 Meditate, 回春 Second Wind, 飛箭 Arrow, 火球 Fireball, 鉤鎖 Hook Chain (a hook on a chain that drags the first enemy
  it catches right up to you), 飛輪 Chakram (out 300 px and back, cutting everyone it passes each way), 甘露 Sweet Dew (heal
  30 over 8 s while you keep fighting), 影步 Shadow Step (blink behind the nearest enemy), 換影 Shadow Swap (trade places
  with the nearest enemy), 見切 Counter (block the next hit within 0.6 s and strike back), 疾走 Sprint, 閃步 Blink Dash, 霸氣 Fury (+35% attack, 8 s), 噬血 Bloodthirst (heal 40% of all the damage you deal
  for 6 s),
  金鐘罩 Golden Bell (−35% damage taken, 7 s), 隱身術 Vanish (nearly invisible, +25% move speed; CPUs lose you), 替身術 Substitution
  (the next hit lands on a log), 撒菱 Caltrops (spikes that slow and hurt enemies), 捨身 Self-Sacrifice (charge for 0.7 s, rooted, with the blast area shown on the ground; then spend 30 of your own HP for a blast that deals 60 to every enemy around you; with 30 HP or less it costs your life, but still hits for 60), 瞬身術 Body Flicker (teleport far from enemies), 癒之陣 Healing Circle
  (heal the whole team), 回氣陣 Spirit Circle (team PE), 戰鼓 War Drum (team +20% damage, 10 s), 護體陣 Ward Circle (whole team −30% damage and knockback, 8 s), 聖火 Holy Fire / 天雷 Thunder / 死神 Reaper (see 魂 below),
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
  | 神樹 Sacred Tree | 75% (2 enemies per soul level) | 5 damage, 3.5 s paralysis |

  A miss still paralyses for 0.8 s (paralysed fighters can't act or move, but they still take 40% damage (on top of any tower aura or guard); only a summon caster mid-call is untouchable). Calling a summon takes
  1 s (the caster can't act and can't be hurt), and the strikes land when the call finishes.
  Summon light and shadow stay in a large circle around the caster, including player, boss and tree summons.
  死神 shows up in person: a hooded reaper rises behind each target and swings his scythe; on a hit, skeletal hands
  grab the victim, a chain binds them and their soul is torn out.
- **Treasure chests (寶箱)**: each map places a fixed, mirrored set at the start (corner piles are often empty, the
  contested middle rarely is; big red chests are never empty and hold 2 items). More drop in at random during the
  fight, and more players means more chests. Break one with your weapon and its item goes into your pocket
  (3 slots): 飯團 +25 HP, 體力茶 +60 PE, 靈氣丹 full PE, 霸氣丹 Fury, 金鐘符 Golden Bell, 疾風符 Sprint,
  火球符 a fireball, 還魂丹 revive a teammate, or save you: if you die with one in your pocket it is used up and revives you on the spot with 40 HP. Items cost no PE. With a full pocket, a new item is used
  immediately.

## Screens
Title → Mode select → Fighter setup (lobby, where the map is picked too) → Battle. The lobby also has a **CPU difficulty** chip (電腦：標準 / 困難, saved between sessions): *Standard* is the original CPU behaviour; *Hard* reacts about twice as fast, picks its targets more cleverly (weak ones first, sticking with a target, and teammates focus the same enemy), keeps its distance by weapon reach (away from a shorter weapon, tight against a longer one), steps out of an enemy's swing sooner and dashes away more often, punishes an enemy that is recovering or stunned, and leads its shots better. On top of that, Hard CPU fighters have +30% max HP (in Quest only the enemies get it, never your party or the boss). The smarter behaviour applies to every CPU, allies and enemies, in every mode. In team modes the lobby also has a **🎲 隨機分隊 (random teams)** button that deals everyone who is playing into two teams at random, as evenly as possible. In the lobby, each player card has 編輯裝備 (Edit Loadout),
which opens a window for weapon, skills and key bindings. Arrow keys / Enter / Esc work everywhere; the mouse works
too. In battle, Esc pauses; the round ends with a results table showing damage dealt, KOs, deaths,
damage taken (including terrain), HP recovered, successful skill/item uses, teammate revives and
wall/tower damage where applicable. HP recovered includes actual healing and automatic revival
pills, but excludes respawn HP; automatic item uses count too. All totals carry across Quest stages.
Each player's top HUD panel also shows their equipped weapon's artwork beside the HP/PE bars.
The results highlight **MVP** (best contributor on the winning team) and **SVP** (best contributor on the
losing side; runner-up in free-for-all). Quest recognises the party's top two across all stages. Draws
award neither title. Scores combine damage dealt and wall/tower damage, +100 per KO, +75 per teammate
revived and −25 per death, with a minimum of zero; ties prefer more KOs, fewer deaths, then player number.

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
| Joy-Con (L) half of a joined pair | Left stick | ← | → / ↓ / ↑ | ZL / L |
| Joy-Con (R) half of a joined pair | Right stick | A | Y / X / B | ZR / R |

Esc returns to the menu. Enter rematches after a round.

**Gamepads and Switch Joy-Cons** also drive the menus: stick / D-pad moves, + / − pauses a fight. To confirm / go back:
A / B on a Switch Pro Controller, a whole Joy-Con pair, or a standard-mapped / directly connected Joy-Con (R);
A / X on a native sideways Joy-Con (R); ← / ↓ on a split, standard-mapped, or directly connected Joy-Con (L),
and the bottom / right face buttons on other gamepads. To use Joy-Cons, pair them with the computer over Bluetooth first, then press
a button so the browser sees them. Each single Joy-Con, held sideways, is its own player (手把 1, 手把 2, …), and the
lobby card shows which controller is on that slot. A single Joy-Con has no aiming stick, so you aim where you move.
Menus respect the split-pad grip settings too. When WebHID is ready for a Joy-Con side, it takes
priority over browser gamepad input for that side, so a press cannot confirm and go Back through two input paths.
**暴走 Berserk.** Every human player can spend 魂 on a short super state: hold the **next item** button
(SL on a sideways Joy-Con, ZL / L on a Joy-Con half, LT on a gamepad, C / [ / B / Num− on the keyboard sets) for 0.4 s
with at least one full 魂 level. A tap still just switches items. It spends every full level; more 魂 lasts longer and
buffs harder (levels 1 / 2 / 3 / 4, tuned in `SOUL_RAGE`):

| | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| Lasts | 6 s | 8 s | 10 s | 12 s |
| Damage dealt | +15% | +30% | +45% | +60% |
| Damage taken | −15% | −25% | −35% | −45% |
| Knockback taken | −20% | −40% | −55% | −70% |
| Walk speed | +10% | +17% | +24% | +32% |
| Swing speed | +10% | +18% | +25% | +32% |
| Weapon area | +20% | +35% | +50% | +70% |
| Skill cooldowns / PE regen | ×1.25 / ×1.5 | ×1.5 / ×1.75 | ×1.75 / ×2 | ×2 / ×2.5 |
| Extra | | | super armour (hits don't interrupt) | + 20% weapon lifesteal |

PE refills when it starts, and no 魂 is gained while it lasts. CPUs and bosses never berserk. The player turns into an
oni: a little larger and tinted, with horns, glowing eyes, burning headband tails and afterimages, inside a ring of
flames whose colour shows the level (orange, crimson, violet, blue) and a ring that burns down with the time left.
The 魂 diamonds glow in that colour when ready, the controller roars, and the first time you have 魂 a tip names your button.

**Vibration and lights.** Controllers that can vibrate do so during fights (Chrome / Edge for normal gamepads); every
pattern is tuned in `RUMBLE` (`src/input/rumble.ts`):
| Event | Feel |
|---|---|
| Your weapon lands | crisp kick, harder and longer for heavier hits |
| You're hit | deep thud by damage taken |
| Knocked out / swallowed by a sand pit | one long full-strength rumble |
| Low HP (under 30%) | a heartbeat, once until you heal back above it |
| 魂 reaches level N | N pulses, stronger each level; level 4 ends on a long one |
| 暴走 begins | deep roar, longer and stronger with the level |
| Skill cast | light sharp tick |
| A 魂 summon lands | deep boom that grows with the level spent |
| 見切 blocks a hit | sharp snap |
| A barrel blows up nearby | deep blast, fading with distance |
| A Revival Pill saves you | three rising pulses |

Joy-Cons and Pro Controllers connected directly (WebHID) also get HD rumble pitch (deep thuds are low, kicks are high),
show the player number on their side lights (flashing while HP is low or knocked out), and light the HOME ring
(Joy-Con (R) / Pro): a slow glow while a 魂 summon is ready, a fast pulse when the meter is full.

**Controller Setup (手把設定)**, from the title screen or the 🎮 button in the fighter setup, lists every controller the browser reports (Chrome has 8 gamepad slots) with a live readout of every button and stick axis the browser reports (so you can see exactly what your Joy-Con sends), and what each one is doing in the game. For each controller you can:
- pick **用法 (use as)**: *automatic* (by its name), *one player*, or *two players (left / right)*, which splits a joined Joy-Con pair into a left and a right Joy-Con (offered in the fighter setup's control selector as `手把 N・左 Joy-Con` / `右 Joy-Con`). Use this when the browser names your pair something the game doesn't recognise;
- **握法 (grip)**, for split pads: *sideways* (the default, one Joy-Con per player) turns each stick and arrow set 90° the way the Joy-Con is held, the left one counter-clockwise and the right one clockwise, so "up" on the stick is "up" for you; *upright* leaves them as they are;
- **設定按鍵 / 設定左邊 / 設定右邊 (set buttons)**: press the stick or button for move, attack, skill 1–3, use item and next item, one step at a time (Enter skips a step, Esc cancels); a step is accepted the moment you press, with no need to let go first, and the game remembers it for that controller. **重設** clears it.
Settings are stored per controller name in the browser.
**Connect Joy-Cons directly (WebHID, Chrome only)**: the big 🔌 button on the Controller Setup page reads each Joy-Con's own data, so the **SL / SR** rail buttons work (a Joy-Con pair that the system joined reaches the browser as one gamepad without them) and every Joy-Con can be its own player, left or right, even a third or fourth one. Click it, choose your Joy-Cons in the browser window, and they show up live on the page; once allowed they reconnect by themselves. Each row also shows the Joy-Con's live **report rate** (a healthy one sends about 60 a second) and battery; below 30 a red warning says the Bluetooth link is slow, which makes that Joy-Con laggy (the lobby card shows it too). Press a button on a Joy-Con and its row lights up, so you can tell which is which. Each one gets its own row with **設定按鍵**: press the button you want for attack, skill 1–3, use item and next item, and **any** button can be used, SL and SR included (the stick stays the stick; + / − always pause). The choice is remembered for left and right Joy-Cons separately, and every press is caught even if it is shorter than a frame. In the lobby's control selector they appear as `Joy-Con 直連 1`, `2`, … (numbered in the order connected). By default, held sideways, left Joy-Con: stick moves, ← attack, → / ↓ / ↑ skills 1 / 2 / 3, SR use item, SL next item. Right Joy-Con: A attack, Y / X / B skills 1 / 2 / 3, SR use item, SL next item. The stick is turned for the sideways hold, and + / − pause.

The lobby's control selector lists only what is actually connected (keyboards, CPU and Off, plus the gamepads, Joy-Con halves and directly connected Joy-Cons that are present right now; a saved choice stays visible so it can be changed). Joy-Cons fall asleep and can come back in a different slot, so each "Gamepad N" choice remembers which controller model it had and follows it if it reappears elsewhere. If a player's controller drops out mid-fight the game freezes with a "controller disconnected, press a button to reconnect" message and carries on when it is back; the lobby won't start a fight while a chosen gamepad is missing. (Browsers only list a controller after a button press on the current page, so press one after reloading.)

## Where things live
- `src/config/index.ts`: tuning numbers (HP, PE regen, balance budgets)
- `src/gameplay/weapons.ts`: weapon shapes, with dimensions solved from their area budgets; hit tests
- `src/gameplay/skills.ts`: skill pool per slot
- `src/gameplay/Fighter.ts`: fighter state machine (attack, skills, hits, PE)
- `src/input/`: keyboard, gamepad and HID controllers; `src/ai/`: CPU decisions and loadouts
- `src/input/gamepads.ts`: gamepad reading, including Switch Pro Controllers and single sideways Joy-Cons
- `src/input/nintendoHid.ts`: direct Joy-Con input over WebHID (reports, SL / SR, reconnection)
- `src/input/padSettings.ts` + `src/scenes/PadScene.ts`: the Controller Setup page: per-controller mode (whole / split Joy-Con halves) and custom button maps
- `src/localization/index.ts`: Traditional Chinese / English UI text
- `src/maps/`: 42 versus maps, eight stages across two Quest campaigns, shared map helpers, spawn points and the cached art finishing pass (`finishArt.ts`)
- `src/rendering/fighterArt.ts`: ninja characters, held weapons, weapon / item icons (all drawn in code)
- `src/rendering/effects.ts`: particles, weapon effects, skill cast flourishes and elemental summon rituals
- `src/gameplay/roles.ts`: the four roles
- `src/ai/loadouts.ts`: random CPU role / weapon / skills
- `src/gameplay/items.ts`: chest items, drop chances and pocket size
- `src/audio/sfx.ts`: sound effects generated with the Web Audio API (including menu button sounds, and a synthesized
  death scream whose voice depends on the fighter: deep for a 武士 or the boss, high for a 忍者)
- `src/audio/music.ts`: procedural background music: koto and flute in the menus, taiko and shamisen in battle, dark
  'hell' and 'boss' pieces for Quest, and victory / defeat music at the end of a round
- `src/state/gameSettings.ts`: saved lobby setup (mode, slots, loadouts) and validation
- `src/ui/`: UI kit, split into theme, components, focus navigation, particles and modal scene support
- `src/scenes/`: Title, Mode, Lobby (+ loadout window) and Battle scenes

## Code structure

Internal TypeScript imports use `@/`, which resolves to `src/` in TypeScript, Vite and the Node test loader.
Battle systems are grouped under `src/battle/`; `BattleScene.ts` owns the Phaser lifecycle and wires them together.
See [the architecture guide](docs/architecture.md) for module ownership, state flow and how to add stages.

Run `npm test` for gameplay checks and `npm run build` for type checking and the production bundle.

## Random Quest layouts and skill shortcuts

Every Quest stage receives a seeded terrain variation: rivers and bridges, trees,
gates, cover, seals, lantern lanes and fire sources shift together. Artwork,
collision rectangles, spawn placement and CPU routing share the same mapping.
Arena borders stay fixed and passage widths remain usable. Retrying a stage
(including editing its loadout) keeps its layout; a fresh run draws a new seed.
Variant arena textures are removed when the battle scene shuts down.

Human players can equip **four skills**. Highlight a skill in the loadout pool
and press the skill key/button that should cast it to assign that exact slot.
Replacing a slot moves an already-equipped skill without creating a duplicate.
Keyboard Enter and mouse clicks retain the usual equip/remove behavior.

Skill 4 defaults to **T** (WASD), **\** (arrows), **P** (IJKL) or **Num7**.
On a directly connected Joy-Con it uses the free outer shoulder: **L** on the
left Joy-Con or **R** on the right. SL/SR keep their item actions. Full Switch
Pro / Xbox-style pads use **L / LB**. Browser-split Joy-Con pairs fall back to
the stick click because their SL/SR buttons are not exposed in that mapping;
Controller Setup can assign a different physical button. Existing saved
six-action maps and keyboard bindings retain their original action indices;
skill 4 is appended, and an unused key is chosen if its default is already bound.

The source root contains only `main.ts` and `vite-env.d.ts`. Gameplay, AI,
player input, audio, rendering, UI, localization, configuration and saved settings
live in their owning folders. Quest maps and versus arenas are grouped separately.
Run `npm run check` for architecture and TypeScript checks; `npm run build`
also enforces these boundaries before producing the game bundle.

## GitHub Pages deployment

The game is published at https://nglikwai.github.io/game/ using
`.github/workflows/deploy.yml`. In the repository's **Settings → Pages**, select
**GitHub Actions** as the source. Every push to `main` runs the tests, builds the
game and deploys `dist`. The workflow can also be started manually from Actions.
Vite uses relative asset paths so the game works under the `/game/` project path.

## Map scenery assets

Normal and Quest maps share original Blender-rendered pine, cherry, bamboo,
rock, ruin, pillar, lantern, shrine, crate, barrel and cursed-tree scenery, with material-specific ground
wear and map palettes. Previews use the same artwork as battles. Source models
are in `assets/blender/map-scenery.blend`; the reproducible export script is
`scripts/blender/build_map_props.py`. See the architecture guide for regeneration
and fallback rendering details. Blender is not needed to run or build the game.

Towers use original Blender watchtower and two-tier keep models with team banners
and visible roof damage. Rivers, ponds, springs and coastal water have clipped
depth and caustic detail. Each fighter role has its own outfit, and walking steps
animate beneath the body. These visuals share the existing gameplay geometry.
