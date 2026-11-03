/** First expedition. Positions use map design coordinates, just like the arena maps. */
export const EXPEDITION = {
  width: 3600, height: 2400, partySlots: 4,
  start: { x: 1800, y: 2100 }, checkpoint: { x: 1800, y: 870 },
  gate: { x: 1800, y: 740, w: 240, h: 52 },
  healer: { x: 2860, y: 1980 }, healing: { x: 1970, y: 870 },
  activation: 430, reviveDistance: 70, reviveSeconds: 3,
  camps: [
    { id: 'entrance', x: 1800, y: 1760, kind: 'patrol', guards: 2 },
    { id: 'village', x: 780, y: 1260, kind: 'melee', guards: 3 },
    { id: 'river', x: 2860, y: 1260, kind: 'ranged', guards: 3 },
    { id: 'rescue', x: 2860, y: 1980, kind: 'rescue', guards: 2 },
    { id: 'fortress', x: 1800, y: 390, kind: 'boss', guards: 1 },
  ] as const,
  boss: { chargeEvery: 7, chargeWarn: 0.5, chargeSpeed: 650, chargeDuration: 0.85, chargeDamage: 22,
    thornsEvery: 11, thornsDuration: 5, rallyEvery: 16 },
} as const;
