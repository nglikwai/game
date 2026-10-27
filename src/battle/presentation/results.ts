import type * as Phaser from 'phaser';
import { playMusic } from '@/audio/music';
import { isQuestMode, prepareQuest, WIDTH } from '@/config';
import { Fighter } from '@/gameplay/Fighter';
import { T } from '@/localization';
import { sfx } from '@/audio/sfx';
import { ARENA_MID_Y as SCREEN_MID_Y } from '@/maps';
import { drawWeaponIcon } from '@/rendering/fighterArt';
import { type MatchStats } from '@/battle/results/stats';
import { performanceScore, rankMatchResults, selectMatchAwards } from '@/battle/results/awards';
import { C, addButton, toHex, txt } from '@/ui';
import type { BattleScene } from '@/scenes/BattleScene';

/** The state and operations this system needs from the scene. No runtime scene dependency. */
type PresentationResultsContext = Phaser.Scene & Pick<BattleScene,
  'add' | 'enterRound' | 'fighterLabel' | 'fighters' | 'isMixedQuest'
  | 'lobbySlots' | 'mapChoice' | 'mode' | 'openModal' | 'openResults'
  | 'over' | 'quest' | 'questTeam' | 'scene' | 'showEndBanner'
  | 'sideColor' | 'stats' | 'time' | 'tweens' | 'winningTeam'
>;

export function openResults(this: PresentationResultsContext, msg: string, color: string): void {
  // Extra column: wall damage (Save the Princess) or tower damage (Siege).
  const objective = this.mode === 'princess' || this.mode === 'siege' || isQuestMode(this.mode);
  // In Quest only the party is listed.
  const listed = this.quest && !this.isMixedQuest ? this.fighters.filter((f) => f.team === this.questTeam) : this.fighters;
  const awards = selectMatchAwards(listed, this.winningTeam, !!this.quest && !this.isMixedQuest);
  this.openModal({
    w: 1160,
    // Grows with the number of fighters (up to 8 rows).
    h: 350 + listed.length * 42,
    title: T().results,
    depth: 400,
    closable: false,
    build: (m) => {
      m.content.add(txt(this, WIDTH / 2, m.y + 92, msg, 40, color, { title: true, bold: true, origin: 0.5, stroke: '#000000', strokeThickness: 5 }));
      const awardW = (m.w - 80) / 2;
      ([{ label: 'MVP', fighter: awards.mvp, color: C.gold, textColor: C.goldHex },
        { label: 'SVP', fighter: awards.svp, color: 0xa8a4e8, textColor: '#c1bdff' }]).forEach((award, n) => {
        const x = m.x + 32 + n * (awardW + 16);
        const y = m.y + 122;
        const ag = this.add.graphics();
        ag.fillStyle(award.color, 0.1).fillRoundedRect(x, y, awardW, 52, 8);
        ag.lineStyle(1, award.color, 0.7).strokeRoundedRect(x, y, awardW, 52, 8);
        ag.fillStyle(award.color, 0.08).fillCircle(x + 28, y + 27, 19);
        // Small laurel sprigs frame the winner's weapon like a medal.
        for (const side of [-1, 1]) for (let k = 0; k < 4; k++) {
          ag.lineStyle(1, award.color, 0.45).lineBetween(x + 28 + side * (16 + k), y + 40 - k * 7, x + 28 + side * (22 + k), y + 37 - k * 7);
        }
        const f = award.fighter;
        if (f) drawWeaponIcon(ag, f.weapon.id, x + 28, y + 28, 27, f.color);
        m.content.add(ag);
        m.content.add(txt(this, x + 52, y + 14, award.label, 13, award.textColor, { bold: true, origin: [0, 0.5] }));
        m.content.add(txt(this, x + 52, y + 35, f ? `${this.fighterLabel(f)}  ${T().weaponName(f.weapon)}` : T().noAward, 17, C.text, { bold: true, origin: [0, 0.5] }));
        if (f) m.content.add(txt(this, x + awardW - 18, y + 28, T().awardScore(Math.round(performanceScore(f.stats))), 18, award.textColor, { bold: true, origin: [1, 0.5] }));
      });
      const left = m.x + 32;
      const playerW = 200;
      const columns: { label: string; key: keyof MatchStats | 'score' }[] = [
        { label: T().score, key: 'score' },
        { label: T().dealt, key: 'dealt' },
        { label: T().kos, key: 'kos' },
        { label: T().deaths, key: 'deaths' },
        { label: T().taken, key: 'taken' },
        { label: T().recovered, key: 'recovered' },
        { label: T().skillsUsed, key: 'skills' },
        { label: T().itemsUsed, key: 'items' },
        { label: T().revives, key: 'revives' },
        ...(objective ? [{ label: this.quest ? T().objectiveDmg : this.mode === 'princess' ? T().wallDmg : T().towerDmg, key: 'wall' as const }] : []),
      ];
      const colW = (m.w - 64 - playerW) / columns.length;
      const colX = (n: number) => left + playerW + (n + 0.5) * colW;
      const headY = m.y + 210;
      m.content.add(txt(this, left + 12, headY, T().weapon, 14, C.dim, { origin: [0, 0.5] }));
      columns.forEach((c, n) => m.content.add(txt(this, colX(n), headY, c.label, 14, C.dim, { origin: 0.5, align: 'center' })));
      const g = this.add.graphics();
      g.lineStyle(1, C.border, 1).lineBetween(left, headY + 20, m.x + m.w - 32, headY + 20);
      m.content.add(g);
      const rows = rankMatchResults(listed, this.winningTeam, this.mode !== 'ffa');
      rows.forEach((f, r) => {
        const y = headY + 40 + r * 42;
        const st = this.stats[f.index];
        const award = f === awards.mvp ? 'MVP' : f === awards.svp ? 'SVP' : null;
        const awardColor = award === 'MVP' ? C.gold : 0xa8a4e8;
        const rg = this.add.graphics();
        rg.fillStyle(r % 2 ? 0x1a1f2a : 0x161a23, 1).fillRoundedRect(left, y - 18, m.w - 64, 36, 6);
        if (award) rg.lineStyle(1, awardColor, 0.7).strokeRoundedRect(left, y - 18, m.w - 64, 36, 6);
        rg.fillStyle(f.color, 1).fillCircle(left + 14, y, 7);
        if (this.mode !== 'ffa') rg.lineStyle(2, this.sideColor(f.team), 1).strokeCircle(left + 14, y, 10);
        m.content.add(rg);
        const player = txt(this, left + 30, y - (award ? 5 : 0), `${this.fighterLabel(f)}  ${T().weaponName(f.weapon)}`, 16, C.text, { bold: true, origin: [0, 0.5] });
        player.setScale(Math.min(1, (playerW - 38) / player.width));
        m.content.add(player);
        if (award) m.content.add(txt(this, left + 30, y + 11, award, 10, toHex(awardColor), { bold: true, origin: [0, 0.5] }));
        columns.forEach((c, n) => m.content.add(txt(this, colX(n), y, String(Math.round(c.key === 'score' ? performanceScore(st) : st[c.key])), 20, C.text, { bold: true, origin: 0.5 })));
      });
      m.content.add(txt(this, WIDTH / 2, m.y + m.h - 106, T().resultsHint, 12, C.dim, { origin: 0.5, align: 'center', wrap: m.w - 80 }));
      m.content.add(txt(this, WIDTH / 2, m.y + m.h - 82, T().awardHint, 11, C.dim, { origin: 0.5, align: 'center', wrap: m.w - 80 }));
      const by = m.y + m.h - 46;
      // A finished game goes back to the fighter setup (no instant rematch); Quest keeps its own retry.
      const buttons: { id: string; label: string; onPress: () => void }[] = [
        ...(this.quest ? [{ id: 'again', label: T().questRestart, onPress: () => this.enterRound({ slots: this.lobbySlots, mode: this.mode, mapId: this.mapChoice, quest: { ...prepareQuest(), side: this.quest?.side, rule: this.quest?.rule } }) }] : []),
        { id: 'lobby', label: T().toLobby, onPress: () => this.scene.start('Lobby') },
        { id: 'title', label: T().toTitle, onPress: () => this.scene.start('Title') },
      ];
      buttons.forEach((b, i) => addButton(this, m.content, m.nav, {
        id: b.id, x: WIDTH / 2 + (i - (buttons.length - 1) / 2) * 220, y: by, w: 200, h: 48, label: b.label, primary: i === 0, onPress: b.onPress,
      }));
    },
  });
}

export function endRound(this: PresentationResultsContext, winner: Fighter | undefined, message?: string, messageColor?: number): void {
  this.over = true;
  this.winningTeam = winner?.team ?? this.winningTeam ?? (this.quest ? this.questTeam : null);
  // Let the final hit / wall crash ring out before the fanfare.
  this.time.delayedCall(message ? 700 : 350, () => sfx.win());
  // Someone always wins a versus round; only a draw gets the sad music.
  const won = !!winner || !!message;
  this.time.delayedCall(message ? 1500 : 1150, () => playMusic(won ? 'victory' : 'defeat'));
  let msg = winner ? T().wins(winner.index + 1) : T().draw;
  let color = winner ? toHex(winner.color) : '#ffffff';
  if (message) {
    msg = message;
    if (messageColor !== undefined) color = toHex(messageColor);
  }
  else if (winner && this.mode === 'team') {
    msg = T().teamWins(T().teamNames[winner.team]);
    color = toHex(this.sideColor(winner.team));
  }
  this.showEndBanner(msg, color, () => this.openResults(msg, color));
}

/** A big banner across the arena; `then` runs when it goes away. */
export function showEndBanner(this: PresentationResultsContext, msg: string, color: string, then: () => void): void {
  const band = this.add.rectangle(WIDTH / 2, SCREEN_MID_Y, WIDTH, 150, 0x000000, 0.6).setDepth(20);
  const banner = txt(this, WIDTH / 2, SCREEN_MID_Y, msg, 68, color, { title: true, bold: true, origin: 0.5, stroke: '#000000', strokeThickness: 7, depth: 21 });
  banner.setScale(1.4).setAlpha(0);
  this.tweens.add({ targets: banner, scale: 1, alpha: 1, duration: 300, ease: 'Back.easeOut' });
  this.time.delayedCall(1700, () => {
    band.destroy();
    banner.destroy();
    then();
  });
}
