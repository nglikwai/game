import { QUEST } from '@/config';

interface SealStageConfig {
  spots: readonly { x: number; y: number }[];
  allies: readonly number[];
  chargeTime: number;
  radius: number;
  respawnEvery: number;
  enemies: number;
  guardHp: number;
}

/** The altar trial's capture rules. Other trials use their own objectives. */
export function questSealConfig(stage?: number): SealStageConfig | null {
  return stage === QUEST.sealStage ? QUEST.seals : null;
}

export interface SealPoint {
  team: number;
  x: number;
  y: number;
  radius: number;
  /** Living allies who must stand inside before this ring charges. */
  allies: number;
  progress: number;
  sealed: boolean;
  contested: boolean;
}

/** One charge rate regardless of how many extra allies are inside. Leaving or contesting preserves earned progress. */
export function chargeSeal(seal: SealPoint, occupants: { team: number; x: number; y: number; alive: boolean }[], dt: number, chargeTime = QUEST.seals.chargeTime): boolean {
  if (seal.sealed) return false;
  const inside = occupants.filter((f) => f.alive && Math.hypot(f.x - seal.x, f.y - seal.y) <= seal.radius);
  const allies = inside.filter((f) => f.team === seal.team).length;
  seal.contested = inside.some((f) => f.team !== seal.team);
  if (dt <= 0 || seal.contested || allies < seal.allies) return false;
  seal.progress = Math.min(1, seal.progress + dt / chargeTime);
  if (seal.progress < 1 - 1e-9) return false;
  seal.progress = 1;
  seal.sealed = true;
  seal.contested = false;
  return true;
}
