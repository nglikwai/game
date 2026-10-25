import { HEIGHT, WIDTH } from '../config';
import { T, getLang, setLang } from '../i18n';
import { isMuted, toggleMute } from '../sfx';
import { isMusicOn, toggleMusic } from '../music';
import { C, FocusNav, Petals, UIScene, addBackdrop, addButton, addSelector, txt } from '../ui';

export class TitleScene extends UIScene {
  private petals!: Petals;

  constructor() {
    super('Title');
  }

  create(data: { openSettings?: boolean }) {
    this.setupUI();
    addBackdrop(this, 0.5);
    this.petals = new Petals(this, { x: 0, y: 0, w: WIDTH, h: HEIGHT }, 28);

    txt(this, WIDTH / 2, 200, '競技場', 136, C.goldHex, { title: true, bold: true, origin: 0.5, stroke: '#3a0d08', strokeThickness: 12 });
    const g = this.add.graphics();
    g.lineStyle(2, 0xd9ae4a, 0.8).lineBetween(WIDTH / 2 - 300, 296, WIDTH / 2 - 150, 296).lineBetween(WIDTH / 2 + 150, 296, WIDTH / 2 + 300, 296);
    g.fillStyle(0xd9ae4a, 1).fillCircle(WIDTH / 2 - 306, 296, 3).fillCircle(WIDTH / 2 + 306, 296, 3);
    txt(this, WIDTH / 2, 296, 'A R E N A   D U E L', 22, C.text, { origin: 0.5 });

    const layer = this.add.container(0, 0);
    const nav = new FocusNav(this);
    this.pushNav(nav);
    const items: [string, () => void][] = [
      [T().startGame, () => this.scene.start('Mode')],
      [T().howToPlay, () => this.openHowTo()],
      [T().settings, () => this.openSettings()],
    ];
    items.forEach(([label, onPress], i) => {
      addButton(this, layer, nav, { id: `b${i}`, x: WIDTH / 2, y: 410 + i * 72, w: 300, h: 56, label, primary: i === 0, size: i === 0 ? 28 : 22, onPress });
    });
    nav.done('b0');

    txt(this, WIDTH / 2, HEIGHT - 26, T().confirmHint, 13, C.faint, { origin: 0.5 });
    if (data?.openSettings) this.openSettings();
  }

  update(_t: number, dms: number) {
    this.petals.update(dms / 1000);
  }

  private openHowTo() {
    this.openModal({
      w: 860,
      h: 560,
      title: T().howToPlay,
      build: (m) => {
        let y = m.y + 82;
        for (const [head, body] of T().howtoSections) {
          m.content.add(txt(this, m.x + 50, y, head, 22, C.goldHex, { title: true, bold: true }));
          const b = txt(this, m.x + 160, y + 3, body, 16, C.text, { wrap: m.w - 220 });
          m.content.add(b);
          y += Math.max(36, b.height) + 26;
        }
        addButton(this, m.content, m.nav, { id: 'ok', x: WIDTH / 2, y: m.y + m.h - 44, w: 200, h: 46, label: T().done, primary: true, onPress: () => m.close() });
      },
    });
  }

  private openSettings() {
    this.openModal({
      w: 540,
      h: 380,
      title: T().settings,
      build: (m) => {
        addSelector(this, m.content, m.nav, {
          id: 'lang', x: m.x + 60, y: m.y + 90, w: m.w - 120, h: 40, labelW: 120,
          label: T().language, value: getLang() === 'zh' ? '繁體中文' : 'English',
          onAdjust: () => {
            setLang(getLang() === 'zh' ? 'en' : 'zh');
            // Every text on screen changes, so rebuild the whole scene and reopen this window.
            this.scene.restart({ openSettings: true });
          },
        });
        addSelector(this, m.content, m.nav, {
          id: 'sound', x: m.x + 60, y: m.y + 150, w: m.w - 120, h: 40, labelW: 120,
          label: T().sound, value: isMuted() ? T().off : T().on,
          onAdjust: () => {
            toggleMute();
            m.rebuild();
          },
        });
        addSelector(this, m.content, m.nav, {
          id: 'music', x: m.x + 60, y: m.y + 210, w: m.w - 120, h: 40, labelW: 120,
          label: T().music, value: isMusicOn() ? T().on : T().off,
          onAdjust: () => {
            toggleMusic();
            m.rebuild();
          },
        });
        addButton(this, m.content, m.nav, { id: 'ok', x: WIDTH / 2, y: m.y + m.h - 46, w: 200, h: 46, label: T().done, primary: true, onPress: () => m.close() });
      },
    });
  }
}
