/** Per-player totals, preserved across Quest stages and reset for a new game. */
export interface MatchStats {
  dealt: number;
  kos: number;
  wall: number;
  deaths: number;
  taken: number;
  recovered: number;
  skills: number;
  items: number;
  revives: number;
}

export function createMatchStats(carried: Partial<MatchStats> = {}): MatchStats {
  return { dealt: 0, kos: 0, wall: 0, deaths: 0, taken: 0, recovered: 0, skills: 0, items: 0, revives: 0, ...carried };
}
