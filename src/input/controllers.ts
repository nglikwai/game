import * as Phaser from 'phaser';
import { halfLabels, labelsForPad, type PadSide } from '@/input/gamepads';
import { readController, resolvePad } from '@/input/padSettings';
import { directLabels, hidPad, hidState, isProPad } from '@/input/nintendoHid';
import type { Difficulty } from '@/config';
import { type Intent, emptyIntent, type Controller, type ControlId, type Binds, type Labels, type KeySetId } from '@/input/contracts';
import { parsePad } from '@/input/controllerIds';
import { KEY_SETS, KeyboardController } from '@/input/keyboard';
import { AIController } from '@/ai/AIController';

export function createController(scene: Phaser.Scene, id: ControlId, binds: Binds, difficulty: Difficulty = 'standard'): Controller | null {
  if (id === 'off') return null;
  if (id === 'cpu') return new AIController(difficulty);
  const hid = /^hid(\d)$/.exec(id);
  if (hid) return new HidController(Number(hid[1]));
  const pad = parsePad(id);
  if (pad) return new GamepadController(pad.index, pad.side);
  return new KeyboardController(scene, KEY_SETS[id as KeySetId].move, binds);
}

// ---------- gamepad ----------

class GamepadController implements Controller {
  private prev = [false, false, false, false, false, false, false];

  constructor(private index: number, private side?: PadSide) {}

  private get pad(): Gamepad | null {
    return resolvePad(this.index);
  }

  get connected() {
    return !!this.pad;
  }

  /** Button names follow whatever is plugged in (Xbox-style, Switch, or a sideways Joy-Con). */
  get labels(): Labels {
    return this.side ? halfLabels(this.side) : labelsForPad(this.pad);
  }

  read(): Intent {
    const pad = this.pad;
    if (!pad) return emptyIntent();
    const st = readController(pad, this.side);
    const edge = st.actions.map((v, i) => v && !this.prev[i]);
    this.prev = [...st.actions];
    return {
      mx: st.mx, my: st.my,
      ax: st.ax, ay: st.ay,
      attack: edge[0],
      skills: [edge[1], edge[2], edge[3], edge[6]],
      useItem: edge[4],
      nextItem: edge[5],
    };
  }
}

/** A Joy-Con read directly over WebHID, held sideways (so its SL / SR work). */
class HidController implements Controller {
  private prev = [false, false, false, false, false, false, false];

  constructor(private n: number) {}

  get connected() {
    return !!hidPad(this.n);
  }

  get labels(): Labels {
    const pad = hidPad(this.n);
    return directLabels(pad);
  }

  read(): Intent {
    const pad = hidPad(this.n);
    if (!pad) return emptyIntent();
    const st = hidState(pad, true);
    const edge = st.actions.map((v, i) => v && !this.prev[i]);
    this.prev = [...st.actions];
    // A Joy-Con has no second stick. A Pro Controller aims with its right stick.
    const aim = isProPad(pad);
    return { mx: st.mx, my: st.my, ax: aim ? st.ax : 0, ay: aim ? st.ay : 0, attack: edge[0], skills: [edge[1], edge[2], edge[3], edge[6]], useItem: edge[4], nextItem: edge[5] };
  }
}
