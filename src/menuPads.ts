import { connectedPads, isJoyConPair, padKind, readPadHalf, type PadSide, type PadState } from './gamepads';
import { hidPads, hidState, type HidJoyCon } from './joyhid';
import { isSplit, readController } from './padconfig';

export type MenuPadKey = string | HidJoyCon;

/** Use one input path per Joy-Con, and the same split/grip settings as the fight. */
export function menuPadSources(): { key: MenuPadKey; st: PadState }[] {
  const direct = hidPads().filter((p) => p.connected && p.ready);
  const directSides = new Set(direct.map((p) => p.side));
  const sources: { key: MenuPadKey; st: PadState }[] = [];
  for (const pad of connectedPads()) {
    const kind = padKind(pad.id);
    const singleSide = kind === 'joyconL' ? 'L' : kind === 'joyconR' ? 'R' : undefined;
    if (singleSide && directSides.has(singleSide)) continue;
    const pair = isJoyConPair(pad.id);
    const split = isSplit(pad);
    if (split || (pair && direct.length > 0)) {
      for (const side of ['L', 'R'] as PadSide[]) {
        // The browser can expose the very same Joy-Con already read through WebHID.
        if (pair && directSides.has(side)) continue;
        sources.push({ key: `pad:${pad.index}:${pad.id}:${side}`, st: split ? readController(pad, side) : readPadHalf(pad, side) });
      }
    } else {
      sources.push({ key: `pad:${pad.index}:${pad.id}`, st: readController(pad) });
    }
  }
  for (const p of direct) sources.push({ key: p, st: hidState(p) });
  return sources;
}
