import { createQuestLayout, layoutPoint } from '@/maps/layout';
import * as Phaser from 'phaser';
import { isQuestMode, prepareQuest, HARD_CPU_HP, QUEST_MAX_CHESTS, chestsWithinCap, randomChestInterval, startRandomChests, BATTLE_READY_SECONDS, COUNTDOWN, QUEST, QUEST_TACTICS, QUEST_BOSSES, EMPTY_CHEST_CHANCE, HEIGHT, HUD_HEIGHT, PLAYER_COLORS, RES, TEAM_COLORS, WIDTH } from '@/config';
import { createController } from '@/input/controllers';
import { Fighter, type Arena } from '@/gameplay/Fighter';
import { hellSlots, hellBossSlots, questFactions, questSideOf } from '@/battle/quest/factions';
import { SKILL_SLOTS, skillById } from '@/gameplay/skills';
import { roleById, type Role } from '@/gameplay/roles';
import { CPU_ENEMY_SKILLS, QUEST_ENEMY_BANNED, questBossSkills, randomCpuEquipment, rollCpuLoadouts } from '@/ai/loadouts';
import { WEAPONS, rollOniWeapon } from '@/gameplay/weapons';
import { T } from '@/localization';
import { sfx } from '@/audio/sfx';
import { ARENA_MID_Y as SCREEN_MID_Y, MAPS, MAP_RES, addArenaTexture, chestsFor, getMap, obstaclesFor, sideOf, spawnPoint } from '@/maps';
import { ninjaTexture } from '@/rendering/fighterArt';
import { createMatchStats } from '@/battle/results/stats';
import { createLantern } from '@/battle/quest/escortRules';
import { Fx } from '@/rendering/effects';
import { getSettings } from '@/state/gameSettings';
import { FONT, addButton, toHex, txt } from '@/ui';
import { type BattleStartData } from '@/battle/types';
import { S, toWorld, toWorldRect, toDesign, ARENA, WORLD_CENTER } from '@/battle/coordinates';
import { BOSS_COLOR, BOSS_GEAR, DIRGE_GEAR, WARDEN_GEAR, wardenRole, bossRole, dirgeRole, questSlots } from '@/battle/quest/roster';
import { BattleState } from '@/battle/BattleState';
import * as environmentHazardsSystem from '@/battle/environment/hazards';
import * as environmentFeaturesSystem from '@/battle/environment/features';
import * as environmentTerrainSystem from '@/battle/environment/terrain';
import { renderSandPits, updateSandPits, sandPitContains, sandPitDangers } from '@/battle/environment/sandPits';
import * as questTreeSystem from '@/battle/quest/tree';
import * as questGroveSystem from '@/battle/quest/grove';
import * as questSnareSystem from '@/battle/quest/snare';
import * as questNightSystem from '@/battle/quest/night';
import * as questDirgeSystem from '@/battle/quest/dirge';
import * as questDragonSystem from '@/battle/quest/dragon';
import * as questWyvernSystem from '@/battle/quest/wyverns';
import * as questProgressionSystem from '@/battle/quest/progression';
import * as questBossesSystem from '@/battle/quest/bosses';
import * as questEscortSystem from '@/battle/quest/escort';
import * as questSealsSystem from '@/battle/quest/seals';
import { questSealConfig } from '@/battle/quest/sealRules';
import { createSpiritRelay, updateSpiritRelay, renderSpiritRelay } from '@/battle/quest/soulRelay';
import * as questHudSystem from '@/battle/quest/hud';
import * as combatSummonsSystem from '@/battle/combat/summons';
import * as objectivesTowersSystem from '@/battle/objectives/towers';
import * as objectivesPrincessSystem from '@/battle/objectives/princess';
import * as objectivesChestsSystem from '@/battle/objectives/chests';
import * as presentationEffectsSystem from '@/battle/presentation/effects';
import * as presentationRendererSystem from '@/battle/presentation/renderer';
import * as presentationHudSystem from '@/battle/presentation/hud';
import * as presentationResultsSystem from '@/battle/presentation/results';
import * as combatActionsSystem from '@/battle/combat/actions';
import * as combatProjectilesSystem from '@/battle/combat/projectiles';


/** Phaser lifecycle, input, fighter setup and the wiring between battle systems. */
export class BattleScene extends BattleState implements Arena {
  constructor() {
    super('Battle');
  }

  get hasHellPlayers() { return !!this.quest && questFactions(this.lobbySlots, this.quest.side).hell; }
  get isMixedQuest() { return !!this.quest && questFactions(this.lobbySlots, this.quest.side).mixed; }
  get isHell() { return !!this.quest && questFactions(this.lobbySlots, this.quest.side).side === 'hell'; }

  /** Stable lobby identity even when P2, for example, plays battlefield seat 6. */
  private questPlayerSlot(index: number): number | null {
    const slot = index % QUEST.partySlots;
    const config = this.lobbySlots[slot];
    if (!config || config.control === 'off') return null;
    const team = questSideOf(config, this.quest?.side) === 'hell' ? 1 : 0;
    return Math.floor(index / QUEST.partySlots) === team ? slot : null;
  }
  get questTeam() { return this.isHell ? 1 : 0; }

  /** Versus keeps red then blue. In a quest the heroes are blue and the other side is red. */
  sideColor(team: number) {
    if (!this.quest) return TEAM_COLORS[team] ?? TEAM_COLORS[0];
    return team === 0 ? TEAM_COLORS[1] : TEAM_COLORS[0];
  }

  /** Four readable shades so teammates stay distinct inside the blue or red side. */
  private questOutfit(team: number, nth: number) {
    const blues = [0x3b82f6, 0x60a5fa, 0x1d4ed8, 0xbfdbfe];
    const reds = [0xe8473c, 0xff6b63, 0xb42318, 0xffc1bb];
    return (team === 0 ? blues : reds)[nth % 4]!;
  }

  questGoal(stage: number) {
    return this.isMixedQuest ? `${T().questVersus} · ${T().questGoals[stage]}` : (this.isHell ? T().hellGoals : T().questGoals)[stage];
  }

  fighterLabel(f: Fighter): string {
    if (!this.hasHellPlayers) return `P${f.index + 1}`;
    const slot = this.questPlayerSlot(f.index);
    if (slot !== null) return `P${slot + 1}`;
    return f.team === 0 ? `${T().heroTag} ${f.index + 1}` : T().hellGuard;
  }

  init(data: BattleStartData) {
    this.lobbySlots = data.slots;
    this.mode = data.mode ?? 'ffa';
    this.quest = isQuestMode(this.mode) ? { ...data.quest, ...prepareQuest(data.quest) } : null;
    if (this.quest && !Number.isInteger(this.quest.layoutSeed)) this.quest.layoutSeed = Math.floor(Math.random() * 0x100000000);
    // The underworld has its own music; the last stage gets the boss theme.
    this.bgm = this.quest ? (this.quest.stage === QUEST.bossStage || this.quest.stage === QUEST.wardenStage || this.quest.stage === QUEST.dirgeStage || this.quest.stage === QUEST.dragonStage || this.quest.stage === QUEST.wyvernStage ? 'boss' : 'hell') : 'battle';
    this.slots = this.hasHellPlayers ? hellSlots(data.slots, this.quest?.side ?? 'heroes') : this.quest ? questSlots(data.slots, this.quest.stage) : data.slots;
    // Hell fills every left seat. The Night Oni is an extra foe, so only two invaders walk in with him.
    if (this.quest?.stage === QUEST.nightStage && this.hasHellPlayers) {
      let foes = 0;
      for (let i = 0; i < QUEST.partySlots; i++) {
        if (this.slots[i].control === 'off') continue;
        if (foes < QUEST.night.enemies) { foes++; continue; }
        if (this.slots[i].control === 'cpu') this.slots[i] = { ...this.slots[i], control: 'off' };
      }
    }
    this.questBossSeats = this.hasHellPlayers ? hellBossSlots(data.slots, this.quest!.stage, this.quest?.side ?? 'heroes')
      : this.quest?.stage === QUEST.bossStage || this.quest?.stage === QUEST.dirgeStage ? [QUEST.partySlots] : this.quest?.stage === QUEST.wardenStage ? [QUEST.partySlots, QUEST.partySlots + 1] : [];
    // 'random' picks a new map each round (and rematches keep it random). Quest stages have their own maps.
    this.mapChoice = this.quest ? QUEST.maps[this.quest.stage] : data.mapId ?? 'courtyard';
    this.wave = 1;
    this.waveT = -1;
    this.stormMarks = [];
    this.ventMarks = [];
    this.flameMarks = [];
    this.flamePatches = [];
    this.flameT = 0;
    this.portalLock = new Map();
    this.rollWarn = null;
    this.boulders = [];
    this.spikeTick = new Map();
    this.bouncers = [];
    this.padLock = new Set();
    this.altarTeam = -1;
    this.doors = [];
    this.kegs = [];
    this.barrierTick = new Map();
    this.barrierAnnounced = false;
    this.herbs = [];
    this.map = this.mapChoice === 'random' ? MAPS[Math.floor(Math.random() * MAPS.length)] : getMap(this.mapChoice);
    if (this.quest) this.map = createQuestLayout(this.map, this.quest.layoutSeed!);
    this.spiritRelay = this.quest?.stage === QUEST.beaconStage ? createSpiritRelay(this.map) : null;
    this.shotBlockers = [];
    this.walls = [];
    this.princessText = undefined;
    this.questTreeT = QUEST.rescue.tree.initialDelay;
    this.questTreeCast = null;
    this.questTree = null;
    this.rescueGateOpen = false;
    this.rescueGateX = this.quest?.stage === QUEST.rescueStage ? layoutPoint(this.map, { x: QUEST.rescue.tree.gateX, y: 0 }).x * S : 0;
    this.groveTrees = [];
    this.groveLabels = [];
    this.groveVeil = undefined;
    this.groveT = 0;
    this.groveIllusion = 'sand';
    this.groveCast = null;
    this.groveSummonT = QUEST.grove.summonInterval;
    this.groveRespawnT = QUEST.grove.respawnEvery;
    this.groveAnnounced = '';
    this.snareTrees = [];
    this.snareLabels = [];
    this.snareVeil = undefined;
    this.snareCast = null;
    this.snareSummonT = QUEST.snare.summonInterval;
    this.snareIllusion = 'sand';
    this.nightShade = undefined;
    this.nightLights = undefined;
    this.nightFlames = undefined;
    this.nightCandles = this.quest?.stage === QUEST.nightStage
      ? this.map.obstacles.filter((o) => o.kind === 'lantern').map((o, i) => ({
        ...toWorld(o), lit: true, timer: QUEST.night.flareEvery * (0.45 + i * 0.22), warn: null,
      }))
      : [];
    this.dirgeTollT = QUEST.dirge.tollEvery;
    this.dirgeWarn = null;
    this.dragonBody = null;
    this.dragonHeads = [];
    this.dragonShots = [];
    this.dragonBursts = [];
    this.dragonGuardT = 0;
    this.dragonCast = null;
    this.dragonBeam = null;
    this.dragonT = 0;
    this.dragonLast = null;
    this.dragonChains = [];
    this.dragonEmberT = 0;
    this.wyverns = [];
    this.wyvernRings = [];
    this.wyvernBursts = [];
    this.wyvernTetherT = 0;
    this.wyvernGuardT = 0;
    const sealConfig = questSealConfig(this.quest?.stage);
    this.seals = sealConfig ? sealConfig.spots.map((p, i) => ({
      ...toWorld(layoutPoint(this.map, p)), team: 0, radius: sealConfig.radius * S, allies: sealConfig.allies[i] ?? 1, progress: 0, sealed: false, contested: false,
    })) : [];
    this.sealRespawnT = sealConfig?.respawnEvery ?? QUEST.seals.respawnEvery;
    this.lantern = this.quest?.stage === QUEST.escortStage
      ? createLantern(data.slots.slice(0, QUEST.partySlots).filter((sl) => sl.control !== 'off').length, S, HUD_HEIGHT, QUEST.escort.path.map((p) => layoutPoint(this.map, p))) : null;
    this.escortRespawnT = QUEST.escort.respawnEvery;
    this.wardenReviveT = -1;
    this.wardenGruntT = QUEST.wardens.gruntRespawn;
    this.bossRespawnT = QUEST.boss.respawnInterval;
    this.bossReserves.clear();
    this.spawns = [];
    this.chests = [];
    this.caltrops = [];
    this.towers = [];
    this.towerHeals = [];
    this.elapsed = 0;
    this.teamRespawnT = [-1, -1];
    this.deathTime = new Map();
    this.chestTimer = 0; // set once we know how many fighters there are
    this.fx = new Fx();
    this.sprites = [];
    this.prevStates = [];
    this.logs = new Map();
    this.respawnTimers = new Map();
    this.tagTexts = [];
    this.helpTexts = [];
    this.fighters = [];
    this.projectiles = [];
    this.obstacleRects = [];
    this.paused = false;
    this.stats = PLAYER_COLORS.map((_, i) => createMatchStats(this.quest?.carry?.stats[i]));
    this.nameTags = [];
    this.hudNames = [];
    this.hudSkillGlyphs = [];
    this.keyLabels = [];
    this.over = false;
    this.winningTeam = null;
    this.overT = 0;
    this.countdown = BATTLE_READY_SECONDS + COUNTDOWN;
  }

  /** Party bonuses use a copy so enemies and later versus matches retain their role stats. */
  roleForSlot(base: Role, index: number): Role {
    return this.quest && (index < QUEST.partySlots || this.hasHellPlayers && !this.questBossSeats.includes(index))
      ? { ...base, peRegen: base.peRegen * QUEST.partyPeRegen, speed: base.speed * QUEST.partySpeed }
      : base;
  }

  create() {
    // The pause menu freezes the clock, tweens and physics. Leaving it by Restart / Back skips the unpause,
    // and the clock outlives the scene, so a frozen clock would carry into the next round
    // (timed things like summon strikes then never fire). Always start unfrozen.
    this.paused = false;
    this.padHold = false;
    this.padOverlay = null;
    this.time.paused = false;
    this.tweens.resumeAll();
    // (The physics world is rebuilt for every round, so it never starts frozen.)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.time.paused = false;
    });
    this.setupUI();
    this.physics.world.setBounds(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
    const world = this.add.container(0, HUD_HEIGHT).setScale(1 / S).setDepth(1);
    this.lFloor = this.add.container();
    this.lSprites = this.add.container();
    this.lOver = this.add.container();
    this.lTop = this.add.container();
    world.add([this.lFloor, this.lSprites, this.lOver, this.lTop]);
    const arenaTexture = addArenaTexture(this, this.map);
    if (this.map.layout) this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.textures.remove(arenaTexture));
    this.lFloor.add(this.add.image(0, 0, arenaTexture).setOrigin(0, 0).setScale(S / MAP_RES));

    // Random each round: which side red starts on (team modes) and who starts where.
    const flip = this.mode !== 'ffa' && !this.quest && Math.random() < 0.5;
    const obstacles = obstaclesFor(this.map, this.mode, flip)
      .filter((o) => !(o.kind === 'deadtree' && (
        (this.quest?.stage === QUEST.rescueStage) ||
        this.quest?.stage === QUEST.groveStage)))
      .map(toWorldRect);
    const walls = obstacles.map((o) => {
      const wall = o.kind === 'cage' ? this.makeWall(o) : undefined;
      if (wall) this.walls.push(wall);
      const rect = new Phaser.Geom.Rectangle(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
      this.obstacleRects.push(rect);
      // Crystals bounce shots off instead of stopping them.
      if (o.kind === 'crystal') this.bouncers.push(rect);
      else if (!o.low) this.shotBlockers.push(rect);
      const body = this.physics.add.staticBody(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
      if (wall) { wall.body = body; wall.rect = rect; }
      return body;
    });
    this.startAmbience();
    this.stormT = this.map.lightning?.interval ?? 0;
    this.ventT = this.map.vents?.interval ?? 0;
    this.flameT = this.map.flames ? this.map.flames.interval * 0.55 : 0;
    this.fightStart = this.time.now / 1000 + BATTLE_READY_SECONDS + COUNTDOWN;
    this.rollT = this.map.rollers?.interval ?? 0;

    this.g = this.add.graphics();
    this.gOver = this.add.graphics();
    this.gGlow = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.lFloor.add(this.g);
    this.lOver.add([this.gOver, this.gGlow]);
    this.hud = this.add.graphics().setDepth(40);
    this.hudIcons = this.add.graphics().setDepth(42);

    const teams = this.mode !== 'ffa';
    const startAt = this.assignStarts(flip);
    const partySize = this.slots.slice(0, QUEST.partySlots).filter((sl) => sl.control !== 'off').length;
    const fixedRoles = new Map<number, Role['id']>();
    if (this.quest?.stage === QUEST.bossStage) fixedRoles.set(this.questBossSeats[0], BOSS_GEAR.role);
    if (this.quest?.stage === QUEST.dirgeStage) fixedRoles.set(this.questBossSeats[0], DIRGE_GEAR.role);
    if (this.quest?.stage === QUEST.wardenStage) WARDEN_GEAR.forEach((gear, k) => fixedRoles.set(this.questBossSeats[k], gear.role));
    const cpuGear = rollCpuLoadouts(this.mode, this.slots, fixedRoles);
    const oniWeapon = this.quest?.stage === QUEST.bossStage ? rollOniWeapon() : null;
    this.slots.forEach((slot, i) => {
      const controller = createController(this, slot.control, slot.binds, getSettings().difficulty);
      if (!controller) return;
      // The final Quest stage: the first enemy is the boss, waiting by his throne.
      const warden = this.quest?.stage === QUEST.wardenStage ? this.questBossSeats.indexOf(i) : -1;
      const isBoss = this.questBossSeats.includes(i);
      const dirge = this.quest?.stage === QUEST.dirgeStage && isBoss;
      const sp = isBoss ? this.freeSpot(toWorld(layoutPoint(this.map, warden >= 0 ? { x: 900, y: warden === 0 ? 265 : 547 } : dirge ? { x: QUEST.dirge.bell.x + 90, y: QUEST.dirge.bell.y } : { x: WIDTH - 140, y: SCREEN_MID_Y })), [], (dirge ? QUEST.dirge.radius : QUEST.boss.radius) + 4) : startAt[i];
      this.spawns[i] = sp;
      const r = isBoss ? (dirge ? QUEST.dirge.radius : QUEST.boss.radius) : 18;
      const body = this.physics.add.body(sp.x - r, sp.y - r, r * 2, r * 2);
      body.setCircle(r);
      body.setCollideWorldBounds(true);
      // CPUs roll a fresh, sensible loadout every round (the lobby settings aren't touched).
      const gear = warden >= 0 ? WARDEN_GEAR[warden] : dirge ? DIRGE_GEAR : isBoss ? BOSS_GEAR : cpuGear.get(i) ?? slot;
      const finaleBoss = isBoss && slot.control === 'cpu' && QUEST_BOSSES.includes(this.quest?.stage ?? -1);
      const middleFoe = !!this.quest && QUEST_TACTICS.includes(this.quest.stage) && slot.control === 'cpu' && !isBoss
        && (this.isHell ? slot.team === 0 : i >= QUEST.partySlots);
      // Tactic-stage enemies (in Hell, the hero side) roll the same four sensible skills as any CPU enemy.
      const skillIds = finaleBoss ? questBossSkills()
        : middleFoe ? randomCpuEquipment(this.mode, gear.role, QUEST_ENEMY_BANNED, CPU_ENEMY_SKILLS).skills
          : isBoss && slot.control !== 'cpu' ? gear.skills.slice(0, SKILL_SLOTS) : gear.skills;
      const skills = skillIds.map(skillById);
      const weapon = oniWeapon && isBoss ? oniWeapon : WEAPONS[gear.weapon];
      const baseRole = warden >= 0 ? wardenRole(partySize, warden) : dirge ? dirgeRole(partySize) : isBoss ? bossRole(partySize) : roleById(gear.role);
      const role = this.roleForSlot(baseRole, i);
      const dyed = this.quest
        ? this.questOutfit(slot.team, (this.hasHellPlayers ? this.questPlayerSlot(i) ?? i : i) % QUEST.partySlots)
        : PLAYER_COLORS[this.hasHellPlayers ? this.questPlayerSlot(i) ?? i : i];
      const color = warden >= 0 ? [0xe8473c, 0xff8f7a][warden] : dirge ? 0xc4453c : isBoss ? BOSS_COLOR : dyed;
      const f = new Fighter(i, color, weapon, skills, role, controller, body, this);
      Object.assign(f.stats, this.stats[i]);
      this.stats[i] = f.stats;
      if (teams) f.team = slot.team;
      const nightFoe = this.quest?.stage === QUEST.nightStage && f.team === (this.isHell ? 0 : 1);
      // Quest: the party is sturdier than usual. The night squad is tougher than a normal wave.
      if (nightFoe) {
        const hard = slot.control === 'cpu' && getSettings().difficulty === 'hard' ? HARD_CPU_HP : 1;
        f.maxHp = f.hp = Math.round(role.maxHp * QUEST.night.hp * hard);
      } else if (this.quest && i < QUEST.partySlots) f.maxHp = f.hp = Math.round(role.maxHp * QUEST.partyHp * (this.isHell && getSettings().difficulty === 'hard' ? HARD_CPU_HP : 1));
      else if (this.quest?.stage === QUEST.ambushStage && f.team === 1) {
        const hard = !this.isHell && slot.control === 'cpu' && getSettings().difficulty === 'hard' ? HARD_CPU_HP : 1;
        f.maxHp = f.hp = Math.round(role.maxHp * QUEST.ambush.enemyHp * hard);
      }
      else if (this.quest && i >= QUEST.partySlots && this.quest.stage === QUEST.dragonStage) {
        // The dragon's guards are cave cultists: less HP and softer hits.
        const hard = !this.isHell && slot.control === 'cpu' && getSettings().difficulty === 'hard' ? HARD_CPU_HP : 1;
        f.maxHp = f.hp = Math.round(role.maxHp * QUEST.dragon.guardHp * hard);
        f.damageScale = QUEST.dragon.guardDamage;
      }
      else if (this.quest && i >= QUEST.partySlots && this.quest.stage === QUEST.wyvernStage) {
        // The wyverns' guards are gorge bandits: less HP and softer hits.
        const hard = !this.isHell && slot.control === 'cpu' && getSettings().difficulty === 'hard' ? HARD_CPU_HP : 1;
        f.maxHp = f.hp = Math.round(role.maxHp * QUEST.wyverns.guardHp * hard);
        f.damageScale = QUEST.wyverns.guardDamage;
      }
      else if (this.quest && i >= QUEST.partySlots && (questSealConfig(this.quest.stage) || this.quest.stage === QUEST.escortStage || this.quest.stage === QUEST.beaconStage)) {
        const tougher = this.quest.stage === QUEST.beaconStage ? QUEST.beacons.guardHp : questSealConfig(this.quest.stage)?.guardHp ?? QUEST.escort.guardHp;
        const hard = !this.isHell && slot.control === 'cpu' && getSettings().difficulty === 'hard' ? HARD_CPU_HP : 1;
        f.maxHp = f.hp = Math.round(role.maxHp * tougher * hard);
      }
      // Hard: the CPU fighters on the other side are tougher too.
      else if (this.isHell && !isBoss && i >= QUEST.partySlots) f.maxHp = f.hp = Math.round(role.maxHp * QUEST.partyHp);
      else if (!this.isHell && slot.control === 'cpu' && !isBoss && getSettings().difficulty === 'hard') f.maxHp = f.hp = Math.round(role.maxHp * HARD_CPU_HP);
      if (isBoss) {
        f.boss = true;
        f.radius = r;
        f.damageScale = warden >= 0 ? QUEST.wardens.damage : dirge ? QUEST.dirge.damage : QUEST.boss.damage;
        if (QUEST_BOSSES.includes(this.quest?.stage ?? -1)) f.soulGainScale = QUEST.boss.soulGainScale;
      }
      this.prepareBossReserve(f, partySize);
      // Quest: items and soul carry over from the last stage.
      const carried = this.quest?.carry?.players[i];
      if (carried) {
        f.pocket.push(...carried.pocket);
        f.soul = carried.soul;
      }
      this.sprites[i] = this.add.image(sp.x, sp.y, ninjaTexture(this, color)).setScale(r / 18 / RES);
      this.lSprites.add(this.sprites[i]);
      this.prevStates[i] = f.state;
      f.facing = Math.atan2(WORLD_CENTER.y - sp.y, WORLD_CENTER.x - sp.x);
      this.fighters.push(f);
      this.tagTexts[i] = this.hasHellPlayers ? `${this.fighterLabel(f)}${f.boss ? `・${this.bossTitle(f)}` : ''}` : this.quest && i >= QUEST.partySlots
        ? isBoss ? `${T().bossTag}・${this.bossTitle(f)}` : T().enemyTag
        : slot.control === 'cpu' ? `P${i + 1} ${T().cpuTag}` : `P${i + 1}`;
      const tagColor = teams ? toHex(this.sideColor(slot.team)) : '#ffffff';
      this.nameTags[i] = this.add
        .text(0, 0, this.tagTexts[i], { fontFamily: FONT, resolution: RES, fontSize: '16px', fontStyle: 'bold', color: tagColor, stroke: '#000000', strokeThickness: 3 })
        .setOrigin(0.5, 1);
      this.lTop.add(this.nameTags[i]);
    });
    this.spawnNightBoss(partySize);
    this.holdRescueReserves();

    const bodies = this.fighters.map((f) => f.body);
    this.physics.add.collider(bodies, walls);
    this.physics.add.collider(bodies, bodies);
    this.configurePrincessWalls();
    // The round's chests are all there from the start; they drop in one by one during the countdown.
    // Stagger the drop-ins so they all land during the countdown.
    if (this.quest) {
      if (this.quest.stage === 1) this.placeQuestTowers(partySize);
      if (this.quest.stage === QUEST.rescueStage) this.placeQuestTree(partySize);
      if (this.quest.stage === QUEST.groveStage) this.placeGroveTrees(partySize);
      if (this.quest.stage === QUEST.wardenStage) this.placeWardenTree(partySize);
      if (this.quest.stage === QUEST.snareStage) this.placeSnareTrees(partySize);
      if (this.quest.stage === QUEST.dragonStage) this.placeDragon(partySize);
      if (this.quest.stage === QUEST.wyvernStage) this.placeWyverns(partySize);
      if (this.quest.stage === QUEST.nightStage) {
        this.nightShade = this.add.renderTexture(0, 0, WIDTH, HEIGHT).setOrigin(0, 0).setDepth(3);
        this.nightLights = this.add.graphics().setVisible(false);
        this.nightFlames = this.add.graphics().setDepth(4);
      }
    } else if (teams) this.placeTowers(flip);
    this.setupMapFeatures();
    const spots = chestsFor(this.map, this.mode)
      .map((p) => ({ ...p, ...toWorld(p) }))
      .filter((p) => !this.towers.some((tw) => Math.abs(p.x - tw.x) < 60 && Math.abs(p.y - tw.y) < 55));
    const placed = this.quest ? chestsWithinCap(spots, QUEST_MAX_CHESTS) : spots;
    placed.forEach((p, n) => this.addChest(p.x, p.y, -0.3 - (n * 2.4) / Math.max(1, placed.length), !!p.big, p.empty ?? EMPTY_CHEST_CHANCE));
    // More fighters, more chests: a few random extras from the start, and more often during the fight.
    // Quest stops at QUEST_MAX_CHESTS, counting the map chests already placed.
    const n = this.fighters.length;
    const extras = this.quest ? Math.max(0, QUEST_MAX_CHESTS - this.chests.length) : startRandomChests(n);
    for (let k = 0; k < extras; k++) this.dropRandomChest(-0.5 - k * 0.3);
    this.chestTimer = randomChestInterval(n);

    this.world = {
      fighters: this.fighters,
      projectiles: this.projectiles,
      objectives: this.walls.map((w) => ({ team: w.team, x: w.o.x, y: w.o.y, w: w.o.w, h: w.o.h })),
      route: this.map.route
        ? (fx: number, fy: number, tx: number, ty: number) => {
            const a = toDesign(fx, fy);
            const b = toDesign(tx, ty);
            const wp = this.map.route!(a.x, a.y, b.x, b.y);
            return wp && toWorld(wp);
          }
        : undefined,
      chests: this.chests,
      lootChests: !this.quest,
      towers: this.towers,
      capturePoints: this.seals,
      spiritRelay: this.spiritRelay ?? undefined,
      escort: this.lantern ?? undefined,
      siege: this.mode === 'siege' || this.quest?.stage === 1 || this.quest?.stage === QUEST.rescueStage || this.quest?.stage === QUEST.groveStage || this.quest?.stage === QUEST.snareStage,
      towersWhenClear: this.quest?.stage === QUEST.dragonStage || this.quest?.stage === QUEST.wyvernStage ? 220 : undefined,
      coordinateCaptures: this.hasHellPlayers,
      defendTeam: this.isHell ? 1 : this.quest?.stage === 1 || this.quest?.stage === QUEST.rescueStage || this.quest?.stage === QUEST.groveStage || questSealConfig(this.quest?.stage) || this.quest?.stage === QUEST.escortStage || this.quest?.stage === QUEST.snareStage || this.quest?.stage === QUEST.ambushStage || this.quest?.stage === QUEST.beaconStage ? 0 : undefined,
      safe: this.map.barrier ? () => this.barrierCircle() : undefined,
      herbs: this.map.herbs ? () => this.herbs.filter((h) => h.grown) : undefined,
      fires: () => [
        ...this.flameMarks.map((m) => ({ x: m.x, y: m.y, r: m.r })),
        ...this.flamePatches.map((p) => ({ x: p.x, y: p.y, r: p.r })),
        ...(this.map.vents ? this.ventMarks.map((m) => ({ x: m.x, y: m.y, r: this.map.vents!.radius })) : []),
        ...this.wyvernDangers(),
        ...sandPitDangers(this.map),
      ],
    };
    if (this.walls.length > 0) this.showPrincessIntro();
    if (this.mode === 'siege') this.showBanner(T().siegeGoal);
    if (this.quest) this.createQuestHud();
    this.startCountdown();

    // Everything the HUD creates sits above the arena.
    const before = this.children.list.length;
    this.createHudText();
    this.children.list.slice(before).forEach((o) => (o as unknown as Phaser.GameObjects.Components.Depth).setDepth?.(41));

  }

  /**
   * Start positions for this round: the positions themselves are fixed, but who gets
   * which is shuffled, and in team modes each team uses its side (random via `flip`).
   * Anything overlapping an obstacle (e.g. a princess wall) is nudged to a free spot.
   */
  private assignStarts(flip: boolean): { x: number; y: number }[] {
    const shuffle = <T,>(a: T[]) => {
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    const active = this.slots.map((s, i) => ({ s, i })).filter(({ s }) => s.control !== 'off');
    const out: { x: number; y: number }[] = [];
    if (this.quest?.stage === QUEST.ambushStage) {
      for (const team of [0, 1]) {
        const spots = team === 0 ? QUEST.ambush.heroes : QUEST.ambush.enemies;
        shuffle(active.filter(({ s }) => s.team === team)).forEach(({ i }, k) => {
          out[i] = toWorld(layoutPoint(this.map, spots[k % spots.length]!));
        });
      }
    } else if (this.mode === 'ffa') {
      const order = shuffle(active.map((_, k) => k));
      active.forEach(({ i }, k) => (out[i] = toWorld(layoutPoint(this.map, spawnPoint(order[k], null, 0)))));
    } else {
      // The dragon's (or wyverns') guards start in front of it instead of at the back wall, where the dragon lies.
      const guards = this.quest?.stage === QUEST.dragonStage ? QUEST.dragon.guards : this.quest?.stage === QUEST.wyvernStage ? QUEST.wyverns.guards : null;
      for (const team of [0, 1]) {
        const members = shuffle(active.filter(({ s }) => s.team === team));
        members.forEach(({ i }, k) => (out[i] = toWorld(layoutPoint(this.map, guards && team === 1 ? guards[k % guards.length]! : spawnPoint(0, sideOf(team, flip), k)))));
      }
    }
    const taken: { x: number; y: number }[] = [];
    for (const { i } of active) {
      out[i] = this.freeSpot(out[i], taken);
      taken.push(out[i]);
    }
    return out;
  }

  /** The nearest point to `p` that's clear of obstacles and other fighters' starts. */
  freeSpot(p: { x: number; y: number }, taken: { x: number; y: number }[], r = 20) {
    const clear = (x: number, y: number) =>
      x > ARENA.x + r && x < ARENA.x + ARENA.w - r && y > ARENA.y + r && y < ARENA.y + ARENA.h - r &&
      !this.obstacleRects.some((o) => x > o.x - r && x < o.right + r && y > o.y - r && y < o.bottom + r) &&
      !(this.map?.zones ?? []).some((zone) => sandPitContains(zone, x, y, r)) &&
      !taken.some((t) => Math.hypot(t.x - x, t.y - y) < r * 2.2);
    if (clear(p.x, p.y)) return p;
    for (let d = 20; d < 300; d += 20) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const x = p.x + Math.cos(a) * d;
        const y = p.y + Math.sin(a) * d;
        if (clear(x, y)) return { x, y };
      }
    }
    return p;
  }

  protected onUnhandledKey(e: KeyboardEvent) {
    if (e.keyCode === Phaser.Input.Keyboard.KeyCodes.ESC && !this.over) this.openPause();
  }

  update(_time: number, deltaMs: number) {
    const dt = Math.min(deltaMs / 1000, 0.05);
    if (this.holdForLostPads()) return;
    if (this.paused) return;

    // Frozen during the pre-round countdown and on the end-of-round screen.
    if (this.countdown > 0 || this.over) {
      this.countdown -= dt;
      for (const f of this.fighters) f.body.setVelocity(0, 0);
    } else {
      for (const f of this.fighters) f.update(dt, f.controller.read(f, this.world, dt));
    }
    if (!this.over) this.updateRescueGate();
    this.updateProjectiles(dt);
    this.updateCaltrops(dt);
    this.petals.update(dt);
    this.updateFx(dt);
    if (this.mode !== 'ffa' && !this.over && this.countdown <= 0) this.updateTeamRespawns(dt);
    if (this.countdown <= 0 && !this.over) {
      this.updateTowers(dt);
      this.updateTowerHealing(dt);
    }
    for (const tw of this.towers) tw.shakeT = Math.max(0, tw.shakeT - dt);
    for (const w of this.walls) w.shakeT = Math.max(0, w.shakeT - dt);
    if (this.countdown <= 0 && !this.over) this.updateRandomChests(dt);
    if (this.countdown <= 0 && !this.over) {
      this.updateStorm(dt);
      this.updateVents(dt);
      this.updateFlames(dt);
      this.updateSandPits(dt);
      this.updatePortals();
      this.updateRollers(dt);
      this.updateSpikes(dt);
      this.updatePads();
      this.updateAltar(dt);
      this.updateKegs(dt);
      this.updateBell(dt);
      this.updateBarrier(dt);
      this.updateHerbs(dt);
      this.updateQuestTree(dt);
    }
    this.updateDoors();
    for (const f of this.fighters) f.inFog = f.alive && this.terrainAt(f.x, f.y) === 'fog';
    for (const c of this.chests) {
      c.shakeT = Math.max(0, c.shakeT - dt);
      const before = c.age;
      c.age += dt;
      if (before < 0 && c.age >= 0) sfx.chestDrop();
    }

    this.render();
    this.renderHud();

    // Free-for-all / Team: last team standing (in free-for-all every fighter is their own team).
    // Save the Princess ends when both of a team's princesses are free; Siege when its towers fall.
    if (!this.over && this.mode === 'siege') {
      for (const team of [0, 1]) {
        if (this.towers.some((tw) => tw.team === team && tw.alive)) continue;
        const winner = this.fighters.find((f) => f.team === 1 - team);
        this.endRound(winner, T().siegeWin(T().teamNames[1 - team]), this.sideColor(1 - team));
        break;
      }
    }
    if (!this.over && this.quest) this.updateQuest(dt);
    if (this.quest) this.renderQuestHud();
    if (!this.over && this.mode === 'ffa') {
      const alive = this.fighters.filter((f) => f.alive);
      if (alive.length <= 1) this.endRound(alive[0]);
    }
    // Team Battle: a team is out once it has nobody standing and no main tower left to bring anyone back.
    if (!this.over && this.mode === 'team') {
      for (const team of [0, 1]) {
        const out = !this.fighters.some((f) => f.team === team && f.alive) && !this.towers.some((tw) => tw.team === team && tw.main && tw.alive);
        if (!out) continue;
        this.endRound(this.fighters.find((f) => f.team === 1 - team && f.alive) ?? this.fighters.find((f) => f.team === 1 - team));
        break;
      }
    }
    if (this.over) this.overT += dt;
  }

  private holdForLostPads(): boolean {
    const lost = this.over ? [] : this.fighters.filter((f) => f.controller.connected === false);
    if (lost.length === 0) {
      if (this.padHold) {
        this.padHold = false;
        this.padOverlay?.destroy();
        this.padOverlay = null;
        if (this.padHoldPaused) this.setPaused(false);
      }
      return false;
    }
    if (!this.padHold) {
      this.padHold = true;
      this.padHoldPaused = !this.paused;
      if (this.padHoldPaused) this.setPaused(true);
    }
    const who = lost.map((f) => this.fighterLabel(f)).join(' ');
    if (!this.padOverlay) {
      const dim = this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x000000, 0.55).setOrigin(0, 0);
      const msg = txt(this, WIDTH / 2, HEIGHT / 2, T().padLost(who), 28, '#ffd27a', { title: true, bold: true, origin: 0.5, stroke: '#000000', strokeThickness: 5, wrap: 900, align: 'center' });
      this.padOverlay = this.add.container(0, 0, [dim, msg]).setDepth(900);
    } else {
      (this.padOverlay.list[1] as Phaser.GameObjects.Text).setText(T().padLost(who));
    }
    return true;
  }

  private setPaused(on: boolean) {
    this.paused = on;
    if (on) {
      this.physics.pause();
      this.tweens.pauseAll();
    } else {
      this.physics.resume();
      this.tweens.resumeAll();
    }
    this.time.paused = on;
  }

  private openPause() {
    this.setPaused(true);
    this.openModal({
      w: 440,
      h: 420,
      title: T().pauseTitle,
      depth: 400,
      onClose: () => this.setPaused(false),
      build: (m) => {
        const items: [string, () => void][] = [
          [T().resume, () => m.close()],
          [this.quest ? T().questRetry : T().restart, () => this.restartRound()],
          [T().toLobby, () => this.scene.start('Lobby')],
          [T().toTitle, () => this.scene.start('Title')],
        ];
        items.forEach(([label, onPress], i) => {
          addButton(this, m.content, m.nav, { id: `p${i}`, x: WIDTH / 2, y: m.y + 110 + i * 66, w: 280, h: 50, label, primary: i === 0, size: 20, onPress });
        });
      },
    });
  }

  /** Big 5, 4, 3, 2, 1, FIGHT! in the middle of the arena. */
  private startCountdown() {
    const labels = [...Array.from({ length: COUNTDOWN }, (_, i) => String(COUNTDOWN - i)), T().fight];
    labels.forEach((label, i) => {
      this.time.delayedCall((BATTLE_READY_SECONDS + i) * 1000, () => {
        const go = i === labels.length - 1;
        if (go) sfx.countdownGo();
        else sfx.countdownTick();
        const t = this.add
          .text(WIDTH / 2, SCREEN_MID_Y, label, {
            fontFamily: FONT, resolution: RES, fontSize: go ? '96px' : '120px', fontStyle: 'bold',
            color: go ? '#f2c94c' : '#ffffff', stroke: '#000000', strokeThickness: 10,
          })
          .setOrigin(0.5)
          .setDepth(30)
          .setScale(1.6)
          .setAlpha(0);
        this.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 180, ease: 'Back.easeOut' });
        this.tweens.add({ targets: t, alpha: 0, scale: 0.8, delay: go ? 650 : 700, duration: 250, onComplete: () => t.destroy() });
      });
    });
  }

  // Systems bind once per scene. Typed receivers verify every dependency at this boundary.

  // quest night
  spawnNightBoss: OmitThisParameter<typeof questNightSystem.spawnNightBoss> = questNightSystem.spawnNightBoss.bind(this);
  renderNight: OmitThisParameter<typeof questNightSystem.renderNight> = questNightSystem.renderNight.bind(this);
  updateNight: OmitThisParameter<typeof questNightSystem.updateNight> = questNightSystem.updateNight.bind(this);
  flareCandle: OmitThisParameter<typeof questNightSystem.flareCandle> = questNightSystem.flareCandle.bind(this);
  snuffCandle: OmitThisParameter<typeof questNightSystem.snuffCandle> = questNightSystem.snuffCandle.bind(this);
  renderNightFlames: OmitThisParameter<typeof questNightSystem.renderNightFlames> = questNightSystem.renderNightFlames.bind(this);

  // combat actions
  onSwingActive: OmitThisParameter<typeof combatActionsSystem.onSwingActive> = combatActionsSystem.onSwingActive.bind(this);
  spawnProjectile: OmitThisParameter<typeof combatActionsSystem.spawnProjectile> = combatActionsSystem.spawnProjectile.bind(this);
  onSkillCast: OmitThisParameter<typeof combatActionsSystem.onSkillCast> = combatActionsSystem.onSkillCast.bind(this);
  dealDamage: OmitThisParameter<typeof combatActionsSystem.dealDamage> = combatActionsSystem.dealDamage.bind(this);
  findReviveTarget: OmitThisParameter<typeof combatActionsSystem.findReviveTarget> = combatActionsSystem.findReviveTarget.bind(this);
  reviveSpot: OmitThisParameter<typeof combatActionsSystem.reviveSpot> = combatActionsSystem.reviveSpot.bind(this);
  onSubstitute: OmitThisParameter<typeof combatActionsSystem.onSubstitute> = combatActionsSystem.onSubstitute.bind(this);
  teleportSafe: OmitThisParameter<typeof combatActionsSystem.teleportSafe> = combatActionsSystem.teleportSafe.bind(this);
  forTeam: OmitThisParameter<typeof combatActionsSystem.forTeam> = combatActionsSystem.forTeam.bind(this);
  healTeam: OmitThisParameter<typeof combatActionsSystem.healTeam> = combatActionsSystem.healTeam.bind(this);
  onPillRevived: OmitThisParameter<typeof combatActionsSystem.onPillRevived> = combatActionsSystem.onPillRevived.bind(this);
  onRevived: OmitThisParameter<typeof combatActionsSystem.onRevived> = combatActionsSystem.onRevived.bind(this);

  // presentation effects
  popText: OmitThisParameter<typeof presentationEffectsSystem.popText> = presentationEffectsSystem.popText.bind(this);
  screenFlash: OmitThisParameter<typeof presentationEffectsSystem.screenFlash> = presentationEffectsSystem.screenFlash.bind(this);
  showBanner: OmitThisParameter<typeof presentationEffectsSystem.showBanner> = presentationEffectsSystem.showBanner.bind(this);
  startAmbience: OmitThisParameter<typeof presentationEffectsSystem.startAmbience> = presentationEffectsSystem.startAmbience.bind(this);
  updateFx: OmitThisParameter<typeof presentationEffectsSystem.updateFx> = presentationEffectsSystem.updateFx.bind(this);
  weaponFx: OmitThisParameter<typeof presentationEffectsSystem.weaponFx> = presentationEffectsSystem.weaponFx.bind(this);
  poseOf: OmitThisParameter<typeof presentationEffectsSystem.poseOf> = presentationEffectsSystem.poseOf.bind(this);
  drawScarf: OmitThisParameter<typeof presentationEffectsSystem.drawScarf> = presentationEffectsSystem.drawScarf.bind(this);

  // presentation results
  openResults: OmitThisParameter<typeof presentationResultsSystem.openResults> = presentationResultsSystem.openResults.bind(this);
  endRound: OmitThisParameter<typeof presentationResultsSystem.endRound> = presentationResultsSystem.endRound.bind(this);
  showEndBanner: OmitThisParameter<typeof presentationResultsSystem.showEndBanner> = presentationResultsSystem.showEndBanner.bind(this);

  // combat projectiles
  updateProjectiles: OmitThisParameter<typeof combatProjectilesSystem.updateProjectiles> = combatProjectilesSystem.updateProjectiles.bind(this);
  dropCaltrops: OmitThisParameter<typeof combatProjectilesSystem.dropCaltrops> = combatProjectilesSystem.dropCaltrops.bind(this);
  updateCaltrops: OmitThisParameter<typeof combatProjectilesSystem.updateCaltrops> = combatProjectilesSystem.updateCaltrops.bind(this);

  // objectives towers
  placeTowers: OmitThisParameter<typeof objectivesTowersSystem.placeTowers> = objectivesTowersSystem.placeTowers.bind(this);
  updateTowerHealing: OmitThisParameter<typeof objectivesTowersSystem.updateTowerHealing> = objectivesTowersSystem.updateTowerHealing.bind(this);
  inTowerAura: OmitThisParameter<typeof objectivesTowersSystem.inTowerAura> = objectivesTowersSystem.inTowerAura.bind(this);
  updateTowers: OmitThisParameter<typeof objectivesTowersSystem.updateTowers> = objectivesTowersSystem.updateTowers.bind(this);
  damageTower: OmitThisParameter<typeof objectivesTowersSystem.damageTower> = objectivesTowersSystem.damageTower.bind(this);
  destroyTower: OmitThisParameter<typeof objectivesTowersSystem.destroyTower> = objectivesTowersSystem.destroyTower.bind(this);
  renderTower: OmitThisParameter<typeof objectivesTowersSystem.renderTower> = objectivesTowersSystem.renderTower.bind(this);
  renderTreeTower: OmitThisParameter<typeof objectivesTowersSystem.renderTreeTower> = objectivesTowersSystem.renderTreeTower.bind(this);
  updateTeamRespawns: OmitThisParameter<typeof objectivesTowersSystem.updateTeamRespawns> = objectivesTowersSystem.updateTeamRespawns.bind(this);

  // combat summons
  thunderStrike: OmitThisParameter<typeof combatSummonsSystem.thunderStrike> = combatSummonsSystem.thunderStrike.bind(this);
  summonResult: OmitThisParameter<typeof combatSummonsSystem.summonResult> = combatSummonsSystem.summonResult.bind(this);
  summonTally: OmitThisParameter<typeof combatSummonsSystem.summonTally> = combatSummonsSystem.summonTally.bind(this);
  summonBlocked: OmitThisParameter<typeof combatSummonsSystem.summonBlocked> = combatSummonsSystem.summonBlocked.bind(this);
  hasSummonTarget: OmitThisParameter<typeof combatSummonsSystem.hasSummonTarget> = combatSummonsSystem.hasSummonTarget.bind(this);
  sacrifice: OmitThisParameter<typeof combatSummonsSystem.sacrifice> = combatSummonsSystem.sacrifice.bind(this);
  holyFireStrike: OmitThisParameter<typeof combatSummonsSystem.holyFireStrike> = combatSummonsSystem.holyFireStrike.bind(this);
  treeStrike: OmitThisParameter<typeof combatSummonsSystem.treeStrike> = combatSummonsSystem.treeStrike.bind(this);
  reaperStrike: OmitThisParameter<typeof combatSummonsSystem.reaperStrike> = combatSummonsSystem.reaperStrike.bind(this);
  reaperSwing: OmitThisParameter<typeof combatSummonsSystem.reaperSwing> = combatSummonsSystem.reaperSwing.bind(this);
  reap: OmitThisParameter<typeof combatSummonsSystem.reap> = combatSummonsSystem.reap.bind(this);
  summonColor: OmitThisParameter<typeof combatSummonsSystem.summonColor> = combatSummonsSystem.summonColor.bind(this);
  summonTargets: OmitThisParameter<typeof combatSummonsSystem.summonTargets> = combatSummonsSystem.summonTargets.bind(this);
  onSummonStart: OmitThisParameter<typeof combatSummonsSystem.onSummonStart> = combatSummonsSystem.onSummonStart.bind(this);

  // environment hazards
  updateStorm: OmitThisParameter<typeof environmentHazardsSystem.updateStorm> = environmentHazardsSystem.updateStorm.bind(this);
  updateVents: OmitThisParameter<typeof environmentHazardsSystem.updateVents> = environmentHazardsSystem.updateVents.bind(this);
  ignite: OmitThisParameter<typeof environmentHazardsSystem.ignite> = environmentHazardsSystem.ignite.bind(this);
  updateFlames: OmitThisParameter<typeof environmentHazardsSystem.updateFlames> = environmentHazardsSystem.updateFlames.bind(this);
  renderFlames: OmitThisParameter<typeof environmentHazardsSystem.renderFlames> = environmentHazardsSystem.renderFlames.bind(this);
  renderVents: OmitThisParameter<typeof environmentHazardsSystem.renderVents> = environmentHazardsSystem.renderVents.bind(this);
  updatePortals: OmitThisParameter<typeof environmentHazardsSystem.updatePortals> = environmentHazardsSystem.updatePortals.bind(this);
  renderPortals: OmitThisParameter<typeof environmentHazardsSystem.renderPortals> = environmentHazardsSystem.renderPortals.bind(this);
  updateRollers: OmitThisParameter<typeof environmentHazardsSystem.updateRollers> = environmentHazardsSystem.updateRollers.bind(this);
  renderRollers: OmitThisParameter<typeof environmentHazardsSystem.renderRollers> = environmentHazardsSystem.renderRollers.bind(this);
  spikeState: OmitThisParameter<typeof environmentHazardsSystem.spikeState> = environmentHazardsSystem.spikeState.bind(this);
  elapsedFight: OmitThisParameter<typeof environmentHazardsSystem.elapsedFight> = environmentHazardsSystem.elapsedFight.bind(this);
  updateSpikes: OmitThisParameter<typeof environmentHazardsSystem.updateSpikes> = environmentHazardsSystem.updateSpikes.bind(this);
  renderSpikes: OmitThisParameter<typeof environmentHazardsSystem.renderSpikes> = environmentHazardsSystem.renderSpikes.bind(this);

  // environment features
  setupMapFeatures: OmitThisParameter<typeof environmentFeaturesSystem.setupMapFeatures> = environmentFeaturesSystem.setupMapFeatures.bind(this);
  updateDoors: OmitThisParameter<typeof environmentFeaturesSystem.updateDoors> = environmentFeaturesSystem.updateDoors.bind(this);
  renderDoors: OmitThisParameter<typeof environmentFeaturesSystem.renderDoors> = environmentFeaturesSystem.renderDoors.bind(this);
  explodeKeg: OmitThisParameter<typeof environmentFeaturesSystem.explodeKeg> = environmentFeaturesSystem.explodeKeg.bind(this);
  updateKegs: OmitThisParameter<typeof environmentFeaturesSystem.updateKegs> = environmentFeaturesSystem.updateKegs.bind(this);
  renderKegs: OmitThisParameter<typeof environmentFeaturesSystem.renderKegs> = environmentFeaturesSystem.renderKegs.bind(this);
  updateBell: OmitThisParameter<typeof environmentFeaturesSystem.updateBell> = environmentFeaturesSystem.updateBell.bind(this);
  renderBell: OmitThisParameter<typeof environmentFeaturesSystem.renderBell> = environmentFeaturesSystem.renderBell.bind(this);
  barrierCircle: OmitThisParameter<typeof environmentFeaturesSystem.barrierCircle> = environmentFeaturesSystem.barrierCircle.bind(this);
  updateBarrier: OmitThisParameter<typeof environmentFeaturesSystem.updateBarrier> = environmentFeaturesSystem.updateBarrier.bind(this);
  renderBarrier: OmitThisParameter<typeof environmentFeaturesSystem.renderBarrier> = environmentFeaturesSystem.renderBarrier.bind(this);
  updateHerbs: OmitThisParameter<typeof environmentFeaturesSystem.updateHerbs> = environmentFeaturesSystem.updateHerbs.bind(this);
  renderHerbs: OmitThisParameter<typeof environmentFeaturesSystem.renderHerbs> = environmentFeaturesSystem.renderHerbs.bind(this);

  // environment terrain
  renderVortex: OmitThisParameter<typeof environmentTerrainSystem.renderVortex> = environmentTerrainSystem.renderVortex.bind(this);
  renderSandPits: OmitThisParameter<typeof renderSandPits> = renderSandPits.bind(this);
  updateSandPits: OmitThisParameter<typeof updateSandPits> = updateSandPits.bind(this);
  updatePads: OmitThisParameter<typeof environmentTerrainSystem.updatePads> = environmentTerrainSystem.updatePads.bind(this);
  renderPads: OmitThisParameter<typeof environmentTerrainSystem.renderPads> = environmentTerrainSystem.renderPads.bind(this);
  updateAltar: OmitThisParameter<typeof environmentTerrainSystem.updateAltar> = environmentTerrainSystem.updateAltar.bind(this);
  renderAltar: OmitThisParameter<typeof environmentTerrainSystem.renderAltar> = environmentTerrainSystem.renderAltar.bind(this);
  renderFog: OmitThisParameter<typeof environmentTerrainSystem.renderFog> = environmentTerrainSystem.renderFog.bind(this);
  renderTide: OmitThisParameter<typeof environmentTerrainSystem.renderTide> = environmentTerrainSystem.renderTide.bind(this);
  renderStorm: OmitThisParameter<typeof environmentTerrainSystem.renderStorm> = environmentTerrainSystem.renderStorm.bind(this);
  renderWind: OmitThisParameter<typeof environmentTerrainSystem.renderWind> = environmentTerrainSystem.renderWind.bind(this);
  hazardSlow: OmitThisParameter<typeof environmentTerrainSystem.hazardSlow> = environmentTerrainSystem.hazardSlow.bind(this);
  zoneAt: OmitThisParameter<typeof environmentTerrainSystem.zoneAt> = environmentTerrainSystem.zoneAt.bind(this);
  terrainAt: OmitThisParameter<typeof environmentTerrainSystem.terrainAt> = environmentTerrainSystem.terrainAt.bind(this);
  tideState: OmitThisParameter<typeof environmentTerrainSystem.tideState> = environmentTerrainSystem.tideState.bind(this);
  windAt: OmitThisParameter<typeof environmentTerrainSystem.windAt> = environmentTerrainSystem.windAt.bind(this);

  // quest tree
  summonTreeConfig: OmitThisParameter<typeof questTreeSystem.summonTreeConfig> = questTreeSystem.summonTreeConfig.bind(this);
  updateQuestTree: OmitThisParameter<typeof questTreeSystem.updateQuestTree> = questTreeSystem.updateQuestTree.bind(this);
  strikeQuestTree: OmitThisParameter<typeof questTreeSystem.strikeQuestTree> = questTreeSystem.strikeQuestTree.bind(this);
  applyQuestTreeHit: OmitThisParameter<typeof questTreeSystem.applyQuestTreeHit> = questTreeSystem.applyQuestTreeHit.bind(this);
  renderQuestTree: OmitThisParameter<typeof questTreeSystem.renderQuestTree> = questTreeSystem.renderQuestTree.bind(this);
  placeQuestTowers: OmitThisParameter<typeof questTreeSystem.placeQuestTowers> = questTreeSystem.placeQuestTowers.bind(this);
  placeQuestTree: OmitThisParameter<typeof questTreeSystem.placeQuestTree> = questTreeSystem.placeQuestTree.bind(this);
  placeWardenTree: OmitThisParameter<typeof questTreeSystem.placeWardenTree> = questTreeSystem.placeWardenTree.bind(this);

  // quest grove
  placeGroveTrees: OmitThisParameter<typeof questGroveSystem.placeGroveTrees> = questGroveSystem.placeGroveTrees.bind(this);
  grovePhase: OmitThisParameter<typeof questGroveSystem.grovePhase> = questGroveSystem.grovePhase.bind(this);
  paintGroveVeil: OmitThisParameter<typeof questGroveSystem.paintGroveVeil> = questGroveSystem.paintGroveVeil.bind(this);
  updateGrove: OmitThisParameter<typeof questGroveSystem.updateGrove> = questGroveSystem.updateGrove.bind(this);
  updateGroveRespawn: OmitThisParameter<typeof questGroveSystem.updateGroveRespawn> = questGroveSystem.updateGroveRespawn.bind(this);
  updateGroveSummon: OmitThisParameter<typeof questGroveSystem.updateGroveSummon> = questGroveSystem.updateGroveSummon.bind(this);
  strikeGroveSummon: OmitThisParameter<typeof questGroveSystem.strikeGroveSummon> = questGroveSystem.strikeGroveSummon.bind(this);
  applyGroveHit: OmitThisParameter<typeof questGroveSystem.applyGroveHit> = questGroveSystem.applyGroveHit.bind(this);
  renderGroveCast: OmitThisParameter<typeof questGroveSystem.renderGroveCast> = questGroveSystem.renderGroveCast.bind(this);

  // quest snare
  snareSide: OmitThisParameter<typeof questSnareSystem.snareSide> = questSnareSystem.snareSide.bind(this);
  placeSnareTrees: OmitThisParameter<typeof questSnareSystem.placeSnareTrees> = questSnareSystem.placeSnareTrees.bind(this);
  releaseSnarePrisoner: OmitThisParameter<typeof questSnareSystem.releaseSnarePrisoner> = questSnareSystem.releaseSnarePrisoner.bind(this);
  paintSnareVeil: OmitThisParameter<typeof questSnareSystem.paintSnareVeil> = questSnareSystem.paintSnareVeil.bind(this);
  updateSnare: OmitThisParameter<typeof questSnareSystem.updateSnare> = questSnareSystem.updateSnare.bind(this);
  strikeSnare: OmitThisParameter<typeof questSnareSystem.strikeSnare> = questSnareSystem.strikeSnare.bind(this);
  applySnareHit: OmitThisParameter<typeof questSnareSystem.applySnareHit> = questSnareSystem.applySnareHit.bind(this);
  renderSnareCast: OmitThisParameter<typeof questSnareSystem.renderSnareCast> = questSnareSystem.renderSnareCast.bind(this);
  renderSnareTree: OmitThisParameter<typeof questSnareSystem.renderSnareTree> = questSnareSystem.renderSnareTree.bind(this);

  // quest dragon
  placeDragon: OmitThisParameter<typeof questDragonSystem.placeDragon> = questDragonSystem.placeDragon.bind(this);
  updateDragon: OmitThisParameter<typeof questDragonSystem.updateDragon> = questDragonSystem.updateDragon.bind(this);
  renderDragon: OmitThisParameter<typeof questDragonSystem.renderDragon> = questDragonSystem.renderDragon.bind(this);
  renderDragonHead: OmitThisParameter<typeof questDragonSystem.renderDragonHead> = questDragonSystem.renderDragonHead.bind(this);
  applyDragonHit: OmitThisParameter<typeof questDragonSystem.applyDragonHit> = questDragonSystem.applyDragonHit.bind(this);
  dragonBlast: OmitThisParameter<typeof questDragonSystem.dragonBlast> = questDragonSystem.dragonBlast.bind(this);
  // quest wyverns
  placeWyverns: OmitThisParameter<typeof questWyvernSystem.placeWyverns> = questWyvernSystem.placeWyverns.bind(this);
  updateWyverns: OmitThisParameter<typeof questWyvernSystem.updateWyverns> = questWyvernSystem.updateWyverns.bind(this);
  renderWyverns: OmitThisParameter<typeof questWyvernSystem.renderWyverns> = questWyvernSystem.renderWyverns.bind(this);
  renderWyvern: OmitThisParameter<typeof questWyvernSystem.renderWyvern> = questWyvernSystem.renderWyvern.bind(this);
  wyvernDangers: OmitThisParameter<typeof questWyvernSystem.wyvernDangers> = questWyvernSystem.wyvernDangers.bind(this);
  // quest dirge
  updateDirge: OmitThisParameter<typeof questDirgeSystem.updateDirge> = questDirgeSystem.updateDirge.bind(this);
  renderDirge: OmitThisParameter<typeof questDirgeSystem.renderDirge> = questDirgeSystem.renderDirge.bind(this);

  // quest progression
  enterRound: OmitThisParameter<typeof questProgressionSystem.enterRound> = questProgressionSystem.enterRound.bind(this);
  restartRound: OmitThisParameter<typeof questProgressionSystem.restartRound> = questProgressionSystem.restartRound.bind(this);
  updateHellQuest: OmitThisParameter<typeof questProgressionSystem.updateHellQuest> = questProgressionSystem.updateHellQuest.bind(this);
  updateQuest: OmitThisParameter<typeof questProgressionSystem.updateQuest> = questProgressionSystem.updateQuest.bind(this);
  nextWave: OmitThisParameter<typeof questProgressionSystem.nextWave> = questProgressionSystem.nextWave.bind(this);
  questCarry: OmitThisParameter<typeof questProgressionSystem.questCarry> = questProgressionSystem.questCarry.bind(this);
  questClear: OmitThisParameter<typeof questProgressionSystem.questClear> = questProgressionSystem.questClear.bind(this);
  questFail: OmitThisParameter<typeof questProgressionSystem.questFail> = questProgressionSystem.questFail.bind(this);

  // quest hud
  createQuestHud: OmitThisParameter<typeof questHudSystem.createQuestHud> = questHudSystem.createQuestHud.bind(this);
  renderQuestHud: OmitThisParameter<typeof questHudSystem.renderQuestHud> = questHudSystem.renderQuestHud.bind(this);

  // quest bosses
  bossTitle: OmitThisParameter<typeof questBossesSystem.bossTitle> = questBossesSystem.bossTitle.bind(this);
  renderWardenBond: OmitThisParameter<typeof questBossesSystem.renderWardenBond> = questBossesSystem.renderWardenBond.bind(this);
  updateWardens: OmitThisParameter<typeof questBossesSystem.updateWardens> = questBossesSystem.updateWardens.bind(this);
  updateWardenGrunt: OmitThisParameter<typeof questBossesSystem.updateWardenGrunt> = questBossesSystem.updateWardenGrunt.bind(this);
  prepareBossReserve: OmitThisParameter<typeof questBossesSystem.prepareBossReserve> = questBossesSystem.prepareBossReserve.bind(this);
  updateBossReinforcements: OmitThisParameter<typeof questBossesSystem.updateBossReinforcements> = questBossesSystem.updateBossReinforcements.bind(this);

  // quest escort
  damageLantern: OmitThisParameter<typeof questEscortSystem.damageLantern> = questEscortSystem.damageLantern.bind(this);
  updateEscort: OmitThisParameter<typeof questEscortSystem.updateEscort> = questEscortSystem.updateEscort.bind(this);
  renderLantern: OmitThisParameter<typeof questEscortSystem.renderLantern> = questEscortSystem.renderLantern.bind(this);

  // quest seals
  updateSeals: OmitThisParameter<typeof questSealsSystem.updateSeals> = questSealsSystem.updateSeals.bind(this);
  renderSeals: OmitThisParameter<typeof questSealsSystem.renderSeals> = questSealsSystem.renderSeals.bind(this);
  updateSpiritRelay: OmitThisParameter<typeof updateSpiritRelay> = updateSpiritRelay.bind(this);
  renderSpiritRelay: OmitThisParameter<typeof renderSpiritRelay> = renderSpiritRelay.bind(this);

  // objectives chests
  addChest: OmitThisParameter<typeof objectivesChestsSystem.addChest> = objectivesChestsSystem.addChest.bind(this);
  updateRandomChests: OmitThisParameter<typeof objectivesChestsSystem.updateRandomChests> = objectivesChestsSystem.updateRandomChests.bind(this);
  dropRandomChest: OmitThisParameter<typeof objectivesChestsSystem.dropRandomChest> = objectivesChestsSystem.dropRandomChest.bind(this);
  openChest: OmitThisParameter<typeof objectivesChestsSystem.openChest> = objectivesChestsSystem.openChest.bind(this);
  renderChest: OmitThisParameter<typeof objectivesChestsSystem.renderChest> = objectivesChestsSystem.renderChest.bind(this);

  // objectives princess
  configurePrincessWalls: OmitThisParameter<typeof objectivesPrincessSystem.configurePrincessWalls> = objectivesPrincessSystem.configurePrincessWalls.bind(this);
  makeWall: OmitThisParameter<typeof objectivesPrincessSystem.makeWall> = objectivesPrincessSystem.makeWall.bind(this);
  showPrincessIntro: OmitThisParameter<typeof objectivesPrincessSystem.showPrincessIntro> = objectivesPrincessSystem.showPrincessIntro.bind(this);
  helpCalloutSpot: OmitThisParameter<typeof objectivesPrincessSystem.helpCalloutSpot> = objectivesPrincessSystem.helpCalloutSpot.bind(this);
  updatePrincessProgress: OmitThisParameter<typeof objectivesPrincessSystem.updatePrincessProgress> = objectivesPrincessSystem.updatePrincessProgress.bind(this);
  breakWall: OmitThisParameter<typeof objectivesPrincessSystem.breakWall> = objectivesPrincessSystem.breakWall.bind(this);
  holdRescueReserves: OmitThisParameter<typeof objectivesPrincessSystem.holdRescueReserves> = objectivesPrincessSystem.holdRescueReserves.bind(this);
  releaseRescueGuards: OmitThisParameter<typeof objectivesPrincessSystem.releaseRescueGuards> = objectivesPrincessSystem.releaseRescueGuards.bind(this);
  rescueTreeSealed: OmitThisParameter<typeof objectivesPrincessSystem.rescueTreeSealed> = objectivesPrincessSystem.rescueTreeSealed.bind(this);
  updateRescueGate: OmitThisParameter<typeof objectivesPrincessSystem.updateRescueGate> = objectivesPrincessSystem.updateRescueGate.bind(this);
  renderRescueGate: OmitThisParameter<typeof objectivesPrincessSystem.renderRescueGate> = objectivesPrincessSystem.renderRescueGate.bind(this);
  renderWallAndPrincess: OmitThisParameter<typeof objectivesPrincessSystem.renderWallAndPrincess> = objectivesPrincessSystem.renderWallAndPrincess.bind(this);

  // presentation renderer
  render: OmitThisParameter<typeof presentationRendererSystem.render> = presentationRendererSystem.render.bind(this);

  // presentation hud
  skillLayout: OmitThisParameter<typeof presentationHudSystem.skillLayout> = presentationHudSystem.skillLayout.bind(this);
  skillAt: OmitThisParameter<typeof presentationHudSystem.skillAt> = presentationHudSystem.skillAt.bind(this);
  hudPanel: OmitThisParameter<typeof presentationHudSystem.hudPanel> = presentationHudSystem.hudPanel.bind(this);
  createHudText: OmitThisParameter<typeof presentationHudSystem.createHudText> = presentationHudSystem.createHudText.bind(this);
  refreshHudLoadout: OmitThisParameter<typeof presentationHudSystem.refreshHudLoadout> = presentationHudSystem.refreshHudLoadout.bind(this);
  renderHud: OmitThisParameter<typeof presentationHudSystem.renderHud> = presentationHudSystem.renderHud.bind(this);
}
