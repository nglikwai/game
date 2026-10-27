import { connectedPads, isJoyConPair, padKind, readPadHalf, type PadSide, type PadState } from '@/input/gamepads';
import { hidPads, hidState, isProPad, type DirectPad, type HidJoyCon } from '@/input/nintendoHid';
import { isSplit, readController } from '@/input/padSettings';

export type MenuPadKey = string | DirectPad;

/** Use one input path per Joy-Con, and the same split/grip settings as the fight. */
export function menuPadSources(): { key: MenuPadKey; control: string; st: PadState }[] {
  const direct = hidPads().filter((p) => p.connected && p.ready);
  const directSides = new Set(direct.filter((p): p is HidJoyCon => !isProPad(p)).map((p) => p.side));
  const sources: { key: MenuPadKey; control: string; st: PadState }[] = [];
  for (const pad of connectedPads()) {
    // This clone is also claimed by the browser, which never delivers its buttons. Once we are reading it, ignore that empty pad.
    if (direct.some(isProPad) && /pro controller/i.test(pad.id)) continue;
    const kind = padKind(pad.id);
    const singleSide = kind === 'joyconL' ? 'L' : kind === 'joyconR' ? 'R' : undefined;
    if (singleSide && directSides.has(singleSide)) continue;
    const pair = isJoyConPair(pad.id);
    const split = isSplit(pad);
    if (split || (pair && direct.length > 0)) {
      for (const side of ['L', 'R'] as PadSide[]) {
        // The browser can expose the very same Joy-Con already read through WebHID.
        if (pair && directSides.has(side)) continue;
        sources.push({ key: `pad:${pad.index}:${pad.id}:${side}`, control: `pad${pad.index + 1}${side}`, st: split ? readController(pad, side) : readPadHalf(pad, side) });
      }
    } else {
      sources.push({ key: `pad:${pad.index}:${pad.id}`, control: `pad${pad.index + 1}`, st: readController(pad) });
    }
  }
  for (const p of direct) sources.push({ key: p, control: `hid${hidPads().indexOf(p) + 1}`, st: hidState(p) });
  return sources;
}
