const { test } = require('node:test');
const assert = require('node:assert/strict');
const sourceLoader = require('./load-source.cjs');

function loadout({ pad = null } = {}) {
  const load = sourceLoader({ navigator: { getGamepads: () => pad ? [pad] : [] } });
  const { LobbyScene } = load('@/scenes/LobbyScene.ts');
  const { getSettings } = load('@/state/gameSettings.ts');
  const scene = new LobbyScene(), slot = getSettings().slots[0];
  slot.control = pad ? 'pad1R' : 'kb1';
  slot.skills = ['arrow', 'blink', 'meditate', null];
  let rebuilt = 0, navigated = 0;
  const nav = { current: 's-fireball', key: () => { navigated++; return true; } };
  scene.navs = [nav];
  scene.loadout = { index: 0, modal: { nav, rebuild() { rebuilt++; } } };
  if (pad) load('@/input/padSettings.ts').setPadMode(pad.id, 'split');
  return { load, scene, slot, nav, rebuilt:()=>rebuilt, navigated:()=>navigated };
}

test('a fourth skill can be equipped, replaced and moved without duplicate copies', () => {
  const {load,slot}=loadout();
  const { assignSkill, toggleSkill }=load('@/state/gameSettings.ts');
  assert.equal(load('@/gameplay/skills.ts').SKILL_SLOTS,4);
  assert.equal(toggleSkill(slot,'fireball'),'equipped');
  assert.equal(toggleSkill(slot,'fury'),'full');
  assert.equal(assignSkill(slot,'arrow',3),true);
  assert.equal(slot.skills[0],null);assert.equal(slot.skills[3],'arrow');
  assert.equal(slot.skills.filter(s=>s==='arrow').length,1);
  assert.equal(assignSkill(slot,'fury',3),true);assert.equal(slot.skills[3],'fury');
  assert.equal(assignSkill(slot,'fireball',4),false);
});

test('pressing the skill key assigns the highlighted skill to that slot without changing bindings', () => {
  const {scene,slot,nav,rebuilt}=loadout();
  const before=[...slot.binds];
  assert.equal(scene.onMenuKey({keyCode:slot.binds[6]}),true);
  assert.equal(slot.skills[3],'fireball');assert.deepEqual([...slot.binds],before);
  assert.equal(rebuilt(),1);
  scene.onMenuKey({keyCode:slot.binds[6],repeat:true});assert.equal(rebuilt(),1);
  nav.current='role';assert.equal(scene.onMenuKey({keyCode:slot.binds[6]}),false);
});

test('a Joy-Con skill/back button assigns once and cannot dismiss the loadout', () => {
  const pad={id:'Joy-Con (L+R)',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:16},()=>({pressed:false,value:0}))};
  const {scene,slot,rebuilt,navigated}=loadout({pad});
  pad.buttons[0]={pressed:true,value:1}; // Right Joy-Con B: skill 3 and menu Back.
  scene.pollPads();scene.pollPads();
  assert.equal(slot.skills[2],'fireball');assert.equal(rebuilt(),1);assert.equal(navigated(),0);
  pad.buttons[0]={pressed:false,value:0};scene.pollPads();
  assert.equal(scene.onMenuPadAction('pad1L',[false,true,false,false,false,false,false]),false);
  assert.equal(rebuilt(),1,'another player must not assign your skill slots');
});

test('keyboard and browser pads emit a fourth skill separately from item actions', () => {
  const {load,slot}=loadout();
  const phaser=load('phaser');
  phaser.Input.Keyboard.JustDown=k=>{const down=k.down;k.down=false;return down;};
  const keys=new Map();const scene={input:{keyboard:{addKey(code){if(!keys.has(code))keys.set(code,{isDown:false,down:false});return keys.get(code);}}}};
  const {createController}=load('@/input/index.ts');
  const control=createController(scene,'kb1',slot.binds);
  keys.get(slot.binds[6]).down=true;
  let intent=control.read();assert.deepEqual([...intent.skills],[false,false,false,true]);assert.equal(intent.useItem,false);assert.equal(intent.nextItem,false);
  assert.equal(control.read().skills[3],false);
  keys.get(slot.binds[4]).down=true;intent=control.read();assert.equal(intent.useItem,true);assert.equal(intent.skills[3],false);
  const pad={id:'Xbox',mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:16},()=>({pressed:false,value:0}))};
  pad.buttons[4]={pressed:true,value:1};const st=load('@/input/gamepads.ts').readPad(pad);
  assert.equal(st.actions[6],true);assert.equal(st.actions[3],false);assert.equal(st.actions[4],false);
});

test('WebHID shoulders cast skill 4, keep SL/SR for items, and preserve custom six-button maps', () => {
  const load=sourceLoader();const {hidKeys,hidState,hidLabels,setHidMap}=load('@/input/nintendoHid.ts');
  for(const side of ['L','R']){
    const shoulder=side==='L'?'l':'r';
    assert.equal(hidKeys(side)[6],shoulder);assert.equal(hidLabels(side)[6],shoulder.toUpperCase());
    const joy={side,down:{[shoulder]:true},stick:[0,0],takeEdges:()=>[]};
    const actions=hidState(joy).actions;
    assert.equal(actions[6],true);assert.ok(!actions.slice(0,6).some(Boolean));
  }
  const old=['left','right','down','up','l','sl'];setHidMap('L',old);
  assert.deepEqual([...hidKeys('L').slice(0,6)],old);
  assert.ok(!old.includes(hidKeys('L')[6]));
});

test('legacy keyboard saves gain one empty skill slot and retain all six old bindings', () => {
  const storage=new Map();
  const first=sourceLoader({storage});const {getSettings,saveSettings}=first('@/state/gameSettings.ts');
  const settings=getSettings();
  settings.slots[0].binds[0] = first('@/input/index.ts').KEY_SETS.kb1.defaultBinds[6]; // A saved custom binding already uses the new default.
  const before=settings.slots.map(s=>[...s.binds.slice(0,6)]);
  settings.slots.forEach(s=>{s.skills=s.skills.slice(0,3);s.binds=s.binds.slice(0,6);});saveSettings();
  const next=sourceLoader({storage})('@/state/gameSettings.ts').getSettings();
  next.slots.forEach((slot,i)=>{
    assert.deepEqual([...slot.binds.slice(0,6)],before[i]);
    assert.equal(slot.binds.length,7);
    if (slot.control.startsWith('kb')) assert.ok(!before[i].includes(slot.binds[6]));
    assert.equal(slot.skills.length,4);assert.equal(slot.skills[3],null);
  });
});
