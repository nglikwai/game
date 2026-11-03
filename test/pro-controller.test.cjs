const { test } = require('node:test');
const assert = require('node:assert/strict');
const sourceLoader = require('./load-source.cjs');

/** 0x3f payload: 16 button bits, hat nibble, then four uint16 sticks centered at 32768. */
function simple(patch = {}) {
  const bytes = new Uint8Array(11);
  const view = new DataView(bytes.buffer);
  bytes[2] = patch.hat ?? 0x0f;
  view.setUint16(3, patch.lx ?? 32768, true);
  view.setUint16(5, patch.ly ?? 32768, true);
  view.setUint16(7, patch.rx ?? 32768, true);
  view.setUint16(9, patch.ry ?? 32768, true);
  if (patch.buttons) view.setUint16(0, patch.buttons, true);
  return bytes;
}

test('a resting Pro Controller report does nothing', () => {
  const { proStateFromReport } = sourceLoader()('src/input/nintendoHid.ts');
  const got = proStateFromReport(0x3f, simple()).state;
  assert.equal(got.mx, 0);
  assert.equal(got.my, 0);
  assert.equal(got.ax, 0);
  assert.equal(got.ay, 0);
  assert.deepEqual([...got.actions], [false, false, false, false, false, false, false]);
  assert.equal(got.confirm, false);
  assert.equal(got.back, false);
  assert.equal(got.start, false);
});

test('Pro Controller face buttons follow the Switch positions', () => {
  const { proStateFromReport } = sourceLoader()('src/input/nintendoHid.ts');
  const b = proStateFromReport(0x3f, simple({ buttons: 0x0001 })).state;
  assert.equal(b.actions[0], true);
  assert.equal(b.back, true);
  assert.equal(b.confirm, false);
  const a = proStateFromReport(0x3f, simple({ buttons: 0x0002 })).state;
  assert.equal(a.confirm, true);
  assert.equal(a.actions[2], true);
  assert.equal(a.actions[0], false);
  const x = proStateFromReport(0x3f, simple({ buttons: 0x0008 })).state;
  assert.equal(x.actions[1], true);
  const y = proStateFromReport(0x3f, simple({ buttons: 0x0004 })).state;
  assert.equal(y.actions[3], true);
  const zr = proStateFromReport(0x3f, simple({ buttons: 0x0080 })).state;
  assert.equal(zr.actions[4], true);
  const zl = proStateFromReport(0x3f, simple({ buttons: 0x0040 })).state;
  assert.equal(zl.actions[5], true);
  const plus = proStateFromReport(0x3f, simple({ buttons: 0x0200 })).state;
  assert.equal(plus.start, true);
});

test('the hat moves and a centered hat leaves the sticks in charge', () => {
  const { proStateFromReport } = sourceLoader()('src/input/nintendoHid.ts');
  assert.deepEqual([proStateFromReport(0x3f, simple({ hat: 0 })).state.mx, proStateFromReport(0x3f, simple({ hat: 0 })).state.my], [0, -1]);
  assert.deepEqual([proStateFromReport(0x3f, simple({ hat: 2 })).state.mx, proStateFromReport(0x3f, simple({ hat: 2 })).state.my], [1, 0]);
  assert.deepEqual([proStateFromReport(0x3f, simple({ hat: 4 })).state.mx, proStateFromReport(0x3f, simple({ hat: 4 })).state.my], [0, 1]);
  assert.deepEqual([proStateFromReport(0x3f, simple({ hat: 6 })).state.mx, proStateFromReport(0x3f, simple({ hat: 6 })).state.my], [-1, 0]);
  const stuck = proStateFromReport(0x3f, simple({ hat: 0x0f, lx: 32768 + 24000 })).state;
  assert.equal(stuck.mx, 1);
  assert.equal(stuck.my, 0);
});

test('the left stick moves and the right stick aims; up is a smaller Y', () => {
  const { proStateFromReport } = sourceLoader()('src/input/nintendoHid.ts');
  const up = proStateFromReport(0x3f, simple({ ly: 32768 - 24000, ry: 32768 + 24000 })).state;
  assert.equal(up.my, -1);
  assert.equal(up.ay, 1);
  const nudge = proStateFromReport(0x3f, simple({ lx: 32768 + 1000 })).state;
  assert.equal(nudge.mx, 0);
});

test('a full 0x30 report uses the standard Pro Controller bytes', () => {
  const { proStateFromReport } = sourceLoader()('src/input/nintendoHid.ts');
  const bytes = new Uint8Array(11);
  bytes[2] = 0x08;
  bytes[3] = 0x02;
  const got = proStateFromReport(0x30, bytes).state;
  assert.equal(got.confirm, true);
  assert.equal(got.start, true);
  assert.equal(got.mx, 0);
  assert.equal(got.my, 0);
});

test('reading the Pro Controller directly replaces the browser pad that never delivers its buttons', () => {
  const pad = {
    id: 'Nintendo Switch Pro Controller', mapping: '', index: 0, connected: true,
    axes: [1, 0, 0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
  };
  const load = sourceLoader({ navigator: { getGamepads: () => [pad] } });
  const pro = {
    kind: 'pro', connected: true, ready: true,
    state: () => ({ mx: 0, my: -1, ax: 0, ay: 0, actions: [false, false, false, false, false, false, false], confirm: true, back: false, start: false }),
  };
  load('src/input/nintendoHid.ts').hidPads().push(pro);
  const sources = load('src/input/menuInput.ts').menuPadSources();
  assert.equal(sources.length, 1);
  assert.equal(sources[0].st.confirm, true);
  assert.equal(sources[0].st.my, -1);
  assert.equal(sources[0].st.mx, 0);
});

test('lobby controller choices list direct connections without duplicate browser pads or split halves', () => {
  const load = sourceLoader({ navigator: { getGamepads: () => [
    { id: 'Joy-Con (L+R)', index: 0, connected: true },
    { id: 'Nintendo Switch Pro Controller', index: 1, connected: true },
  ] } });
  load('src/input/nintendoHid.ts').hidPads().push({ connected: true }, { connected: false }, { connected: true });
  const { controlOptions } = load('src/scenes/LobbyScene.ts');
  for (const current of ['off', 'pad1', 'pad1R']) {
    assert.deepEqual(Array.from(controlOptions(current)), ['off', 'kb1', 'kb2', 'kb3', 'kb4', 'hid1', 'hid2', 'cpu']);
  }
  assert.ok(controlOptions('hid4').includes('hid4'), 'a selected direct controller remains visible after disconnect');
});

test('old browser controller seats can be reassigned in the direct-only lobby without losing their loadout', () => {
  const load = sourceLoader();
  const settings = load('src/state/gameSettings.ts').getSettings();
  settings.mode = 'team'; settings.slots[0].control = 'pad1L'; settings.slots[1].control = 'hid2';
  const loadout = JSON.stringify({ weapon: settings.slots[0].weapon, skills: settings.slots[0].skills, binds: settings.slots[0].binds });
  const { LobbyScene } = load('src/scenes/LobbyScene.ts');
  new LobbyScene().init();
  assert.equal(settings.slots[0].control, 'off'); assert.equal(settings.slots[1].control, 'hid2');
  assert.equal(JSON.stringify({ weapon: settings.slots[0].weapon, skills: settings.slots[0].skills, binds: settings.slots[0].binds }), loadout);
});
