import type { FocusNav } from '@/ui/FocusNav';

/** Cards are columns of fields; header and footer buttons each form a separate row. */
export function connectLobbyNavigation(nav: FocusNav, cardCount: number) {
  const columns = 4;
  const headers = ['mode', 'difficulty', 'shuffle', 'quest-side', 'map'].filter((id) => nav.has(id));
  const footer = ['back', 'pads', 'fight'];
  const fields = Array.from({ length: cardCount }, (_, i) =>
    ['team', 'faction', 'control', 'edit'].map((field) => `c${i}-${field}`).filter((id) => nav.has(id)));
  const headerColumn: Record<string, number> = { mode: 0, difficulty: 1, shuffle: 2, 'quest-side': 2, map: 3 };
  const footerFor = (column: number) => column === 0 ? 'back' : column === 1 ? 'pads' : 'fight';
  const headerFor = (column: number) => headers.find((id) => headerColumn[id] === column)
    ?? headers.reduce<string | null>((best, id) => !best || Math.abs(headerColumn[id] - column) < Math.abs(headerColumn[best] - column) ? id : best, null);
  const horizontalRow = (ids: string[]) => ids.forEach((id, i) => nav.setNeighbors(id, {
    left: ids[i - 1] ?? null, right: ids[i + 1] ?? null,
  }));
  horizontalRow(headers);
  horizontalRow(footer);
  for (const id of headers) nav.setNeighbors(id, { up: null, down: fields[headerColumn[id]]?.[0] ?? null });
  for (let i = 0; i < cardCount; i++) {
    const column = i % columns, stack = fields[i];
    const neighbor = (offset: number, field: string) => {
      if (column + offset < 0 || column + offset >= columns) return null;
      const target = fields[i + offset];
      return target?.find((id) => id.endsWith(`-${field}`)) ?? target?.find((id) => id.endsWith('-control')) ?? null;
    };
    stack.forEach((id, n) => {
      const field = id.slice(id.indexOf('-') + 1);
      nav.setNeighbors(id, {
        left: neighbor(-1, field), right: neighbor(1, field),
        up: stack[n - 1] ?? fields[i - columns]?.at(-1) ?? headerFor(column),
        down: stack[n + 1] ?? fields[i + columns]?.[0] ?? footerFor(column),
      });
    });
  }
  for (const [id, column] of [['back', 0], ['pads', 1], ['fight', 3]] as const) {
    const bottom = column + (cardCount > columns ? columns : 0);
    nav.setNeighbors(id, { up: fields[bottom]?.at(-1) ?? null, down: null });
  }
}
