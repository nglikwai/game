const { test } = require('node:test');
const assert = require('node:assert/strict');
const sourceLoader = require('./load-source.cjs');

function menu(direct = false, { id = 'Joy-Con (L+R)', mode = 'whole', mapping = 'standard', browserAlso = false } = {}) {
  const pad = {
    id, mapping, index: 0, connected: true,
    axes: [0, 0, 0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
  };
  const load = sourceLoader({ navigator: { getGamepads: () => direct && !browserAlso ? [] : [pad] } });
  load('src/input/padSettings.ts').setPadMode(pad.id, mode);
  const { FocusNav, UIScene } = load('src/ui/index.ts');
  const graphics = new Proxy({}, { get: () => () => graphics });
  const scene = new UIScene();
  scene.add = {
    graphics: () => graphics,
    zone: () => ({ input: { enabled: true }, handlers: {},
      setDepth() { return this; }, setInteractive() { return this; },
      on(event, handler) { this.handlers[event] = handler; return this; },
    }),
  };
  const nav = new FocusNav(scene);
  const changes = [0, 0];
  let activations = 0;
  let backs = 0;
  nav.onBack = () => backs++;
  nav.add({ id: 'first', x: 0, y: 0, w: 100, h: 30, onAdjust: (d) => changes[0] += d });
  nav.add({ id: 'second', x: 200, y: 0, w: 100, h: 30, onAdjust: (d) => changes[1] += d });
  nav.add({ id: 'button', x: 200, y: 100, w: 100, h: 30, onEnter: () => activations++ });
  nav.done('first');
  scene.navs = [nav];
  const joy = { connected: true, ready: true, side: 'R', stick: [0, 0], down: {} };
  if (direct) load('src/input/nintendoHid.ts').hidPads().push(joy);
  return {
    scene, nav, changes, load, pad, joy, activations: () => activations, backs: () => backs,
    poll: () => scene.pollPads(),
    button: (index, pressed) => {
      pad.buttons[index] = { pressed, value: Number(pressed) };
      scene.pollPads();
    },
    key: (key) => scene.routeKey({ keyCode: load('phaser').Input.Keyboard.KeyCodes[key], preventDefault() {} }),
    stick: (x, y = 0) => {
      if (direct) joy.stick = [y, -x]; // sideways right Joy-Con
      else pad.axes = [x, y, 0, 0];
      scene.pollPads();
    },
    confirm: (pressed) => {
      if (direct) joy.down.a = pressed;
      else pad.buttons[1] = { pressed, value: Number(pressed) }; // Nintendo A
      scene.pollPads();
    },
  };
}

for (const direct of [false, true]) {
  test(`${direct ? 'WebHID Joy-Con' : 'paired Joy-Cons'}: sticks navigate; confirm cycles once per press`, () => {
    const m = menu(direct);
    m.stick(1);
    assert.equal(m.nav.current, 'second');
    assert.deepEqual(m.changes, [0, 0]);
    m.stick(0);
    m.confirm(true);
    m.confirm(true);
    m.confirm(true);
    assert.deepEqual(m.changes, [0, 1]);
    m.confirm(false);
    m.confirm(true);
    assert.deepEqual(m.changes, [0, 2]);
    m.confirm(false);
    m.stick(-1);
    assert.equal(m.nav.current, 'first');
    assert.deepEqual(m.changes, [0, 2]);
  });

  test(`${direct ? 'WebHID Joy-Con' : 'paired Joy-Cons'}: confirm still activates ordinary buttons`, () => {
    const m = menu(direct);
    m.nav.focus('button', false);
    m.confirm(true);
    assert.equal(m.activations(), 1);
    assert.deepEqual(m.changes, [0, 0]);
  });
}

test('keyboard arrows and mouse halves still adjust; Enter/Space also cycle', () => {
  const m = menu();
  m.key('RIGHT');
  m.key('RIGHT');
  m.key('LEFT');
  assert.equal(m.nav.current, 'first');
  assert.deepEqual(m.changes, [1, 0]);
  m.key('ENTER');
  m.key('SPACE');
  assert.deepEqual(m.changes, [3, 0]);
  const zone = m.nav.zoneById.get('first');
  zone.handlers.pointerdown({ worldX: 1 });
  zone.handlers.pointerdown({ worldX: 99 });
  assert.deepEqual(m.changes, [3, 0]);
});

test('controller input remains silent during button calibration', () => {
  const m = menu();
  m.scene.keyCapture = () => {};
  m.confirm(true);
  m.stick(1);
  assert.deepEqual(m.changes, [0, 0]);
  assert.equal(m.nav.current, 'first');
});

for (const side of ['L', 'R']) {
  test(`split Joy-Con ${side}: confirm activates Yes once, Back stays separate`, () => {
    const m = menu(false, { mode: 'auto' });
    m.nav.focus('button', false);
    const confirm = side === 'L' ? 14 : 1;
    const back = side === 'L' ? 13 : 0;
    m.button(confirm, true);
    m.poll();
    assert.equal(m.activations(), 1);
    assert.equal(m.backs(), 0);
    assert.equal(m.nav.current, 'button');
    m.button(confirm, false);
    m.button(back, true);
    assert.equal(m.backs(), 1);
    assert.equal(m.activations(), 1);
  });

  test(`split Joy-Con ${side}: menus respect sideways and upright grip`, () => {
    const m = menu(false, { mode: 'split' });
    const axis = side === 'L' ? 0 : 2;
    m.pad.axes[axis + 1] = side === 'L' ? 1 : -1;
    m.poll();
    assert.equal(m.nav.current, 'second');
    assert.deepEqual(m.changes, [0, 0]);
    m.pad.axes.fill(0); m.poll();
    m.load('src/input/padSettings.ts').setPadGrip(m.pad.id, 'upright');
    m.nav.focus('first', false);
    m.pad.axes[axis] = 1; m.poll();
    assert.equal(m.nav.current, 'second');
  });

  test(`standard-mapped single Joy-Con ${side}: confirm does not go Back or move focus`, () => {
    const m = menu(false, { id: `Joy-Con (${side})` });
    m.nav.focus('button', false);
    m.button(side === 'L' ? 14 : 1, true);
    assert.equal(m.activations(), 1);
    assert.equal(m.backs(), 0);
    assert.equal(m.nav.current, 'button');
  });
}

for (const id of ['Joy-Con (L+R)', 'Joy-Con (R)']) {
  test(`WebHID plus browser ${id}: a conflicting browser Back cannot undo confirmation`, () => {
    const m = menu(true, { id, mapping: '', browserAlso: true });
    m.nav.focus('button', false);
    m.joy.down.a = true;
    // Browser native and direct mappings can give the same physical press different indices.
    m.pad.buttons[id === 'Joy-Con (R)' ? 1 : 0] = { pressed: true, value: 1 };
    m.poll(); m.poll();
    assert.equal(m.activations(), 1);
    assert.equal(m.backs(), 0);
    m.joy.down.a = false; m.pad.buttons.forEach((b) => { b.pressed = false; b.value = 0; });
    m.poll();
    m.joy.down.b = true; m.poll();
    assert.equal(m.backs(), 1);
  });
}

test('simultaneous confirm and Back perform one action, including after a modal opens', () => {
  const m = menu();
  const { FocusNav } = m.load('src/ui/index.ts');
  let modalBacks = 0;
  const modal = new FocusNav(m.scene);
  modal.onBack = () => modalBacks++;
  modal.add({ id: 'ok', x: 0, y: 0, w: 100, h: 30 }); modal.done();
  m.nav.items.get('button').onEnter = () => m.scene.pushNav(modal);
  m.nav.focus('button', false);
  m.pad.buttons[0] = { pressed: true, value: 1 };
  m.confirm(true); m.poll();
  assert.equal(m.scene.navs.length, 2);
  assert.equal(modalBacks, 0);
  m.button(0, false); m.confirm(false); m.button(0, true);
  assert.equal(modalBacks, 1);
});

test('disconnecting one direct Joy-Con does not turn another held confirm into a new press', () => {
  const m = menu(true);
  const other = { connected: true, ready: true, side: 'L', stick: [0, 0], down: { left: true } };
  m.load('src/input/nintendoHid.ts').hidPads().push(other);
  m.poll();
  assert.deepEqual(m.changes, [1, 0]);
  m.joy.connected = false;
  m.poll();
  assert.deepEqual(m.changes, [1, 0]);
});

test('a single Joy-Con named without parentheses is not mistaken for a split pair', () => {
  for (const side of ['L', 'R']) {
    const m = menu(false, { id: `Joy-Con ${side}`, mode: 'auto', mapping: '' });
    m.nav.focus('button', false);
    m.button(0, true); // native sideways confirm
    assert.equal(m.activations(), 1);
    assert.equal(m.backs(), 0);
  }
});

test('direct right Joy-Con leaves the paired left half available for confirmation', () => {
  const m = menu(true, { browserAlso: true, mode: 'auto' });
  m.nav.focus('button', false);
  m.button(14, true);
  assert.equal(m.activations(), 1);
  assert.equal(m.backs(), 0);
});

test('direct Joy-Con does not suppress a separate Pro Controller', () => {
  const m = menu(true, { id: 'Nintendo Switch Pro Controller', browserAlso: true });
  m.nav.focus('button', false);
  m.button(1, true);
  assert.equal(m.activations(), 1);
  assert.equal(m.backs(), 0);
});

test('browser confirmation remains available until direct Joy-Con reports are ready', () => {
  const m = menu(true, { browserAlso: true, mode: 'auto' });
  m.joy.ready = false;
  m.nav.focus('button', false);
  m.button(1, true);
  assert.equal(m.activations(), 1);
  assert.equal(m.backs(), 0);
});
