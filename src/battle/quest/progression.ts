import type * as Phaser from 'phaser';
import { playMusic } from '@/audio/music';
import { isQuestMode, prepareQuest, questStageNumber, nextQuestStage, QUEST, WIDTH } from '@/config';
import { Fighter } from '@/gameplay/Fighter';
import { type Item } from '@/gameplay/items';
import { T } from '@/localization';
import { sfx } from '@/audio/sfx';
import { C, addButton, txt } from '@/ui';
import { type QuestState, type BattleStartData } from '@/battle/types';
import { questSealConfig } from '@/battle/quest/sealRules';
import type { BattleScene } from '@/scenes/BattleScene';

/** The state and operations this system needs from the scene. No runtime scene dependency. */
type QuestProgressionContext = Phaser.Scene & Pick<BattleScene,
  'countdown' | 'deathTime' | 'endRound' | 'enterRound' | 'fighters'
  | 'freeSpot' | 'fx' | 'groveTrees' | 'isHell' | 'isMixedQuest'
  | 'lantern' | 'lobbySlots' | 'mapChoice' | 'mode' | 'nextWave'
  | 'openModal' | 'over' | 'paused' | 'quest' | 'questCarry'
  | 'questClear' | 'questFail' | 'questTeam' | 'questTree' | 'questTreeCast'
  | 'restartRound' | 'scene' | 'seals' | 'showBanner' | 'showEndBanner'
  | 'sideColor' | 'snareTrees' | 'spawns' | 'stats' | 'time'
  | 'towers' | 'dragonHeads' | 'updateDragon' | 'wyverns' | 'updateWyverns' | 'updateBossReinforcements' | 'updateDirge' | 'updateEscort' | 'updateGrove'
  | 'updateHellQuest' | 'updateNight' | 'updateQuestTree' | 'updateSeals' | 'updateSnare'
  | 'updateWardens' | 'walls' | 'wave' | 'waveT' | 'winningTeam'
  | 'spiritRelay' | 'updateSpiritRelay'
>;

/** Every Quest stage entry, including retries, goes through the shared loading screen. */
export function enterRound(this: QuestProgressionContext, data: BattleStartData): void {
  if (isQuestMode(data.mode)) {
    const next = structuredClone(data);
    next.quest = { ...next.quest, ...prepareQuest(next.quest) };
    this.scene.start('Loading', next);
  } else this.scene.restart(data);
}

export function restartRound(this: QuestProgressionContext): void {
  this.enterRound({ slots: this.lobbySlots, mode: this.mode, mapId: this.mapChoice, quest: this.quest ?? undefined });
}

/** Hell defends the same world objectives while the invading heroes use their normal AI. */
export function updateHellQuest(this: QuestProgressionContext, dt: number): void {
  if (!this.quest || this.over || this.paused || this.countdown > 0) return;
  const stage = this.quest.stage;
  const heroes = this.fighters.filter((f) => f.team === 0);
  const hell = this.fighters.filter((f) => f.team === 1);
  const bosses = hell.filter((f) => f.boss);
  const lost = stage === 1 ? !this.towers.some((t) => t.team === 1 && t.alive)
    : stage === QUEST.rescueStage ? this.walls.length === 2 && this.walls.every((w) => w.rescued)
    : stage === QUEST.groveStage ? this.groveTrees.length === 3 && this.groveTrees.every((t) => !t.alive)
    : stage === QUEST.snareStage ? !hell.some((f) => f.alive && !f.trapped)
    : questSealConfig(stage) ? this.seals.length > 0 && this.seals.every((s) => s.sealed)
    : stage === QUEST.beaconStage ? !!this.spiritRelay && this.spiritRelay.delivered >= QUEST.beacons.required
    : stage === QUEST.escortStage ? !!this.lantern?.arrived
    : stage === QUEST.bossStage || stage === QUEST.dirgeStage ? bosses.length > 0 && !bosses.some((f) => f.alive)
    : stage === QUEST.wardenStage ? bosses.length === 2 && !bosses.some((f) => f.alive)
    : stage === QUEST.dragonStage ? this.dragonHeads.length > 0 && this.dragonHeads.every((h) => !h.alive) && !hell.some((f) => f.alive)
    : stage === QUEST.wyvernStage ? this.wyverns.length > 0 && this.wyverns.every((w) => !w.tower.alive) && !hell.some((f) => f.alive) : false;
  if (lost) { this.questFail(); return; }

  // Existing tower/tree reinforcements are now the player's reinforcements.
  const canReturn = this.towers.some((t) => t.team === 1 && t.main && t.alive)
    || stage === QUEST.groveStage && this.groveTrees.some((t) => t.grove === 'respawn' && t.alive)
    || !!questSealConfig(stage) || stage === QUEST.escortStage
    || stage === QUEST.beaconStage && !!this.spiritRelay && this.spiritRelay.delivered < QUEST.beacons.required
    || stage === QUEST.dragonStage && this.dragonHeads.some((h) => h.alive)
    || stage === QUEST.wyvernStage && this.wyverns.some((w) => w.tower.alive);
  if (!hell.some((f) => f.alive) && !canReturn) { this.questFail(); return; }
  if (stage === QUEST.escortStage && this.lantern?.lost) { this.questClear(); return; }

  if (!heroes.some((f) => f.alive)) {
    if (stage === 0 && this.wave < QUEST.waves) {
      if (this.waveT < 0) {
        this.waveT = QUEST.waveDelay;
        this.showBanner(T().questWave(this.wave + 1), this.sideColor(0));
      } else {
        this.waveT -= dt;
        if (this.waveT <= 0) this.nextWave(heroes);
      }
    } else this.questClear();
    return;
  }
  if (stage === QUEST.groveStage) this.updateGrove(dt);
  else if (stage === QUEST.snareStage) this.updateSnare(dt);
  else if (questSealConfig(stage)) this.updateSeals(dt);
  else if (stage === QUEST.beaconStage) {
    this.updateSpiritRelay(dt);
    if (this.spiritRelay && this.spiritRelay.delivered >= QUEST.beacons.required) this.questFail();
  }
  else if (stage === QUEST.escortStage) this.updateEscort(dt);
  else if (stage === QUEST.bossStage) this.updateBossReinforcements(dt);
  else if (stage === QUEST.dirgeStage) this.updateDirge(dt);
  else if (stage === QUEST.dragonStage) this.updateDragon(dt);
  else if (stage === QUEST.wyvernStage) this.updateWyverns(dt);
  else if (stage === QUEST.nightStage) this.updateNight(dt);
  else if (stage === QUEST.wardenStage) { this.updateQuestTree(dt); this.updateWardens(dt); }
}

export function updateQuest(this: QuestProgressionContext, dt: number): void {
  if (this.isHell) { this.updateHellQuest(dt); return; }
  const q = this.quest!;
  const party = this.fighters.filter((f) => f.team === 0);
  const foes = this.fighters.filter((f) => f.team === 1);
  if (!party.some((f) => f.alive && !f.trapped)) {
    this.questFail();
    return;
  }
  if (q.stage === 0) {
    if (this.waveT >= 0) {
      this.waveT -= dt;
      if (this.waveT <= 0) this.nextWave(foes);
    } else if (!foes.some((f) => f.alive)) {
      if (this.wave < QUEST.waves) {
        this.waveT = QUEST.waveDelay;
        this.showBanner(T().questWave(this.wave + 1), this.sideColor(1));
      } else this.questClear();
    }
  } else if (q.stage === 1) {
    if (!this.towers.some((tw) => tw.team === 1 && tw.alive)) this.questClear();
  } else if (q.stage === QUEST.rescueStage) {
    if (this.walls.length === 2 && this.walls.every((w) => w.rescued) && !foes.some((f) => f.alive)) this.questClear();
  } else if (q.stage === QUEST.groveStage) {
    this.updateGrove(dt);
    if (this.groveTrees.length === 3 && this.groveTrees.every((t) => !t.alive)) this.questClear();
  } else if (q.stage === QUEST.snareStage) {
    this.updateSnare(dt);
    if (this.snareTrees.length === 2 && this.snareTrees.every((t) => !t.alive) && !foes.some((f) => f.alive)) this.questClear();
  } else if (questSealConfig(q.stage)) {
    this.updateSeals(dt);
    if (this.seals.length === questSealConfig(q.stage)!.spots.length && this.seals.every((s) => s.sealed) && !foes.some((f) => f.alive)) this.questClear();
  } else if (q.stage === QUEST.beaconStage) {
    this.updateSpiritRelay(dt);
    if (this.spiritRelay && this.spiritRelay.delivered >= QUEST.beacons.required) this.questClear();
  } else if (q.stage === QUEST.escortStage) {
    this.updateEscort(dt);
    if (this.lantern?.lost) this.questFail();
    else if (this.lantern?.arrived) this.questClear();
  } else if (q.stage === QUEST.wardenStage) {
    this.updateQuestTree(dt);
    this.updateWardens(dt);
  } else if (q.stage === QUEST.nightStage) {
    if (!foes.some((f) => f.alive)) this.questClear();
    else this.updateNight(dt);
  } else if (q.stage === QUEST.ambushStage) {
    if (!foes.some((f) => f.alive)) this.questClear();
  } else if (q.stage === QUEST.dragonStage) {
    // Every guard and all three heads must fall.
    this.updateDragon(dt);
    if (!foes.some((f) => f.alive) && this.dragonHeads.length > 0 && this.dragonHeads.every((h) => !h.alive)) this.questClear();
  } else if (q.stage === QUEST.wyvernStage) {
    // Both wyverns (down together, so neither can raise the other) and every guard.
    this.updateWyverns(dt);
    if (!foes.some((f) => f.alive) && this.wyverns.length > 0 && this.wyverns.every((w) => !w.tower.alive)) this.questClear();
  } else if (q.stage === QUEST.dirgeStage) {
    this.updateDirge(dt);
    if (!foes.some((f) => f.boss && f.alive)) this.questClear();
  } else if (!foes.some((f) => f.boss && f.alive)) this.questClear();
  else this.updateBossReinforcements(dt);
}

/** Stage 1: the beaten enemies come back in as the next wave, from their side. */
export function nextWave(this: QuestProgressionContext, foes: Fighter[]): void {
  this.wave++;
  this.waveT = -1;
  const taken = this.fighters.filter((o) => o.alive).map((o) => ({ x: o.x, y: o.y }));
  for (const f of foes) {
    const spot = this.freeSpot(this.spawns[f.index], taken);
    taken.push(spot);
    f.revive(spot.x, spot.y);
    this.deathTime.delete(f);
    this.fx.smoke(spot.x, spot.y, 12, 1);
  }
  sfx.respawn();
}

/** What the party takes into the next stage. */
export function questCarry(this: QuestProgressionContext): QuestState['carry'] {
  const players: Record<number, { pocket: Item[]; soul: number }> = {};
  for (const f of this.fighters) if (this.isMixedQuest || f.team === this.questTeam) players[f.index] = { pocket: [...f.pocket], soul: f.soul };
  return { players, stats: this.stats.map((st) => ({ ...st })) };
}

export function questClear(this: QuestProgressionContext, winningTeam = this.questTeam): void {
  if (this.over) return;
  const q = this.quest!;
  this.winningTeam = winningTeam;
  const factionWin = T().teamWins(T().questSides[winningTeam === 1 ? 'hell' : 'heroes']);
  this.questTreeCast = null;
  const next = nextQuestStage(q.route ?? [], q.stage);
  if (next === undefined) {
    this.endRound(undefined, this.isMixedQuest ? factionWin : this.isHell ? T().hellComplete : T().questComplete, 0xf2c94c);
    return;
  }
  this.over = true;
  this.time.delayedCall(500, () => sfx.win());
  this.time.delayedCall(1300, () => playMusic('victory'));
  const msg = this.isMixedQuest ? factionWin : T().questClear(questStageNumber(q.route ?? [], q.stage));
  this.showEndBanner(msg, '#f2c94c', () => {
    this.openModal({
      w: 620, h: 300, title: msg, titleColor: C.goldHex, depth: 400, closable: false,
      build: (m) => {
        m.content.add(txt(this, WIDTH / 2, m.y + 128, T().questCarry, 16, C.text, { origin: 0.5, wrap: m.w - 80, align: 'center' }));
        const by = m.y + m.h - 50;
        addButton(this, m.content, m.nav, {
          id: 'next', x: WIDTH / 2 - 150, y: by, w: 240, h: 50, label: `${T().questNext}  ▶`, primary: true,
          onPress: () => this.enterRound({ slots: this.lobbySlots, mode: this.mode, quest: { stage: next, layoutSeed: q.layoutSeed, route: q.route, campaign: 'quest', side: q.side, rule: q.rule, carry: this.questCarry() } }),
        });
        addButton(this, m.content, m.nav, { id: 'lobby', x: WIDTH / 2 + 150, y: by, w: 200, h: 50, label: T().toLobby, onPress: () => this.scene.start('Lobby') });
      },
    });
  });
}

export function questFail(this: QuestProgressionContext): void {
  if (this.over) return;
  if (this.isMixedQuest) { this.questClear(1); return; }
  const q = this.quest!;
  this.over = true;
  this.time.delayedCall(300, () => sfx.deathGong());
  this.time.delayedCall(1500, () => playMusic('defeat'));
  this.showEndBanner(T().questFailed, '#ff5a5a', () => {
    this.openModal({
      w: 900, h: 300, title: T().questFailed, titleColor: '#ff7a7a', depth: 400, closable: false,
      build: (m) => {
        const lanternWhy = this.isHell ? T().hellLost : this.lantern && !this.lantern.alive ? T().lanternDestroyed : this.lantern?.lost ? T().lanternLost : '';
        m.content.add(txt(this, WIDTH / 2, m.y + 110, `${T().questFailedAt(questStageNumber(q.route ?? [], q.stage))}${lanternWhy ? ` · ${lanternWhy}` : ''}`, 22, C.text, { title: true, bold: true, origin: 0.5 }));
        const by = m.y + m.h - 50;
        addButton(this, m.content, m.nav, {
          id: 'edit', x: WIDTH / 2 - 315, y: by, w: 190, h: 50, label: T().questEdit, primary: true, size: 17,
          onPress: () => this.scene.start('Lobby', { retryQuest: structuredClone(q), slots: structuredClone(this.lobbySlots) }),
        });
        addButton(this, m.content, m.nav, { id: 'retry', x: WIDTH / 2 - 105, y: by, w: 190, h: 50, label: T().questRetry, size: 17, onPress: () => this.restartRound() });
        addButton(this, m.content, m.nav, {
          id: 'over', x: WIDTH / 2 + 105, y: by, w: 190, h: 50, label: T().questRestart, size: 17,
          onPress: () => this.enterRound({ slots: this.lobbySlots, mode: this.mode, quest: { ...prepareQuest(), side: this.quest?.side, rule: this.quest?.rule } }),
        });
        addButton(this, m.content, m.nav, { id: 'lobby', x: WIDTH / 2 + 315, y: by, w: 190, h: 50, label: T().toLobby, size: 17, onPress: () => this.scene.start('Lobby') });
      },
    });
  });
}
