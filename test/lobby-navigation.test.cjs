const { test } = require('node:test');
const assert = require('node:assert/strict');
const sourceLoader = require('./load-source.cjs');

function lobby(controls = ['kb1', 'cpu', 'off', 'kb2', 'cpu', 'kb3', 'off', 'cpu'], faction = false) {
  const load = sourceLoader();
  const { FocusNav } = load('src/ui/FocusNav.ts');
  const { connectLobbyNavigation } = load('src/ui/lobbyNavigation.ts');
  const { menuDirection } = load('src/input/menuInput.ts');
  const K = load('phaser').Input.Keyboard.KeyCodes;
  const g = new Proxy({}, { get: () => () => g });
  const listeners = {};
  const scene = { input: { on(name, cb, context) { listeners[name] = p => cb.call(context, p); }, off() {} }, add: {
    graphics: () => g,
    zone: () => ({ input: { enabled: true }, handlers: {}, setDepth() { return this; }, setInteractive() { return this; },
      on(name, cb) { this.handlers[name] = cb; return this; }, destroy() {} }),
  } };
  const nav = new FocusNav(scene);
  let changes = 0, launches = 0;
  function build() {
    nav.reset();
    for (const [id, x, w] of [['mode', 30, 250], ['difficulty', 292, 190], [faction ? 'quest-side' : 'shuffle', 498, 200], ['map', 710, 540]])
      nav.add({ id, x, y: 91, w, h: 46 });
    controls.forEach((control, i) => {
      const x = 30 + i % 4 * 308, y = 154 + Math.floor(i / 4) * 238;
      const id = `c${i}-${faction ? 'faction' : 'team'}`;
      if (control !== 'off') nav.add({ id, x: x + 202, y: y + 8, w: 80, h: 22,
        onAdjust: () => { changes++; build(); } });
      nav.add({ id: `c${i}-control`, x: x + 12, y: y + 44, w: 272, h: 28, onAdjust() {} });
      if (!['off', 'cpu'].includes(control)) nav.add({ id: `c${i}-edit`, x: x + 12, y: y + 192, w: 272, h: 27 });
    });
    for (const [id, x, w] of [['back', 46, 140], ['pads', 208, 230], ['fight', 1016, 224]])
      nav.add({ id, x, y: 650, w, h: 36, onEnter: () => { if (id === 'fight') launches++; } });
    connectLobbyNavigation(nav, controls.length);
    nav.done('c0-control');
  }
  build();
  const press = key => nav.key({ keyCode: K[key] }, 'gamepad');
  return { nav, press, build, listeners, menuDirection, changes: () => changes, launches: () => launches };
}

test('one right press crosses the footer gap directly from controller settings to battle', () => {
  const m = lobby();
  m.nav.focus('pads'); m.press('RIGHT');
  assert.equal(m.nav.current, 'fight'); assert.equal(m.launches(), 0);
  m.press('ENTER'); assert.equal(m.launches(), 1);
  m.press('LEFT'); assert.equal(m.nav.current, 'pads');
  m.press('LEFT'); assert.equal(m.nav.current, 'back');
  m.press('RIGHT'); assert.equal(m.nav.current, 'pads');
});

for (const faction of [false, true]) test(`${faction ? 'faction' : 'team'} is one Up from its controller, confirms once and retains focus after rebuild`, () => {
  const m = lobby(undefined, faction);
  m.press('UP'); assert.equal(m.nav.current, `c0-${faction ? 'faction' : 'team'}`);
  m.press('ENTER'); assert.equal(m.changes(), 1);
  assert.equal(m.nav.current, `c0-${faction ? 'faction' : 'team'}`);
  m.press('RIGHT'); assert.equal(m.nav.current, `c1-${faction ? 'faction' : 'team'}`);
  assert.equal(m.changes(), 1, 'directions must move focus without changing the team');
  m.press('DOWN'); assert.equal(m.nav.current, 'c1-control');
  m.press('RIGHT'); assert.equal(m.nav.current, 'c2-control', 'disabled slots have no team field');
});

for (const controls of [Array(8).fill('off'), Array(8).fill('cpu'), Array(8).fill('kb1'), ['kb1', 'off', 'cpu', 'kb2']])
  test(`every field and footer stays reachable with ${controls.length} mixed or uniform seats: ${controls.join(',')}`, () => {
    const m = lobby(controls);
    const visited = new Set(), pending = ['c0-control'];
    while (pending.length) {
      const id = pending.shift(); if (visited.has(id)) continue; visited.add(id);
      for (const direction of ['UP', 'DOWN', 'LEFT', 'RIGHT']) {
        m.nav.focus(id, false); m.press(direction);
        if (!visited.has(m.nav.current)) pending.push(m.nav.current);
      }
    }
    assert.equal(visited.size, m.nav.items.size, 'the navigation graph has no unreachable controls');
    for (const id of ['back', 'pads', 'fight']) assert.ok(visited.has(id));
  });

test('stationary mouse hover cannot steal Joy-Con focus when the lobby rebuilds', () => {
  const m = lobby(); m.press('UP'); m.press('ENTER');
  m.nav.zoneById.get('c2-control').handlers.pointerover();
  assert.equal(m.nav.current, 'c0-team');
  m.listeners.pointermove({ worldX: 660, worldY: 210 });
  assert.equal(m.nav.current, 'c2-control', 'real mouse movement takes control again');
});

test('stick direction has hysteresis and keeps its axis through diagonal wobble', () => {
  const { menuDirection: dir } = lobby();
  assert.equal(dir(.8, .7, ''), 'R');
  assert.equal(dir(.7, .85, 'R'), 'R');
  assert.equal(dir(.45, .5, 'R'), 'R');
  assert.equal(dir(.1, .85, 'R'), 'D');
  assert.equal(dir(.1, .2, 'D'), '');
  assert.equal(dir(-.9, 0, 'R'), 'L');
});
