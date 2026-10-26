import type { MatchStats } from '@/matchStats';

interface AwardPlayer {
  index: number;
  team: number;
  stats: MatchStats;
}

/** Reward combat, objectives and rescues; taking damage or spending items earns no points. */
export function performanceScore(stats: MatchStats): number {
  return Math.max(0, stats.dealt + stats.wall + 100 * stats.kos + 75 * stats.revives - 25 * stats.deaths);
}

function comparePerformance(a: AwardPlayer, b: AwardPlayer): number {
  return performanceScore(b.stats) - performanceScore(a.stats) || b.stats.kos - a.stats.kos || a.stats.deaths - b.stats.deaths || a.index - b.index;
}

/** Keep each team together, winners first, then rank teammates by the award score. */
export function rankMatchResults<T extends AwardPlayer>(players: readonly T[], winningTeam: number | null, groupTeams = true): T[] {
  return [...players].sort((a, b) => {
    if (a.team !== b.team) {
      const winnerFirst = Number(b.team === winningTeam) - Number(a.team === winningTeam);
      if (winnerFirst) return winnerFirst;
      if (groupTeams) return a.team - b.team;
    }
    return comparePerformance(a, b);
  });
}

export function selectMatchAwards<T extends AwardPlayer>(players: readonly T[], winningTeam: number | null, cooperative = false): { mvp?: T; svp?: T } {
  const ranked = [...players].sort(comparePerformance);
  // Quest lists only the party: recognise its best two contributors across all stages.
  if (cooperative) return { mvp: ranked[0], svp: ranked[1] };
  if (winningTeam === null) return {};
  return {
    mvp: ranked.find((p) => p.team === winningTeam),
    svp: ranked.find((p) => p.team !== winningTeam),
  };
}
