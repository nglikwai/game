import { MAIN_TOWER, SMALL_TOWER, TOWER_AURA, TOWER_FIRE_INTERVAL, TOWER_HP, TOWER_RANGE } from '@/config';

/** The arrow a tower fires (the main tower's hits harder and flies further). */
export const TOWER_ARROW = { kind: 'projectile' as const, speed: 720, radius: 5, damage: 5, knockback: 110, hitstun: 0.1, range: TOWER_RANGE + 60, color: 0xe8e8e8 };

export const MAIN_TOWER_ARROW = { ...TOWER_ARROW, damage: MAIN_TOWER.damage, range: MAIN_TOWER.range + 60 };

export const SMALL_TOWER_ARROW = { ...TOWER_ARROW, damage: SMALL_TOWER.damage, range: SMALL_TOWER.range + 60 };

/** Stats for each kind of tower (HP is per 2 team members). */
export const TOWER_STATS = {
  main: { ...MAIN_TOWER, arrow: MAIN_TOWER_ARROW },
  front: { hp: TOWER_HP, size: 44, range: TOWER_RANGE, fireInterval: TOWER_FIRE_INTERVAL, aura: TOWER_AURA, arrow: TOWER_ARROW },
  small: { ...SMALL_TOWER, arrow: SMALL_TOWER_ARROW },
};
