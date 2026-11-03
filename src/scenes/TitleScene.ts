import { preloadMapProps } from '@/rendering/mapProps';
import { HEIGHT, WIDTH } from '@/config';
import { T, getLang, setLang } from '@/localization';
import { isMuted, toggleMute } from '@/audio/sfx';
import { isMusicOn, toggleMusic } from '@/audio/music';
import { C, FocusNav, Petals, UIScene, addBackdrop, addButton, addSelector, txt } from '@/ui';
import { drawLobbyCrest, drawLobbyPortrait } from '@/rendering/menuArt';

export class TitleScene extends UIScene {
  private petals!: Petals;

  constructor() {
    super('Title');
  }

  preload() { preloadMapProps(this); }

  create(data: { openSettings?: boolean }) {
    this.setupUI();
    addBackdrop(this, 0.5);
    this.petals = new Petals(this, { x: 0, y: 0, w: WIDTH, h: HEIGHT }, 28);

    const g = this.add.graphics();
    // Illustrated hero medallions echo the portraits on the fighter roster.
    g.lineStyle(1, C.gold, 0.08).strokeCircle(947, 315, 243).strokeCircle(947, 315, 226);
    drawLobbyCrest(g, 956, 321, 190);
    drawLobbyPortrait(g, 1066, 439, 95, 0x6d83ae, 'shinobi');
    drawLobbyPortrait(g, 902, 301, 150, 0xb65e56, 'samurai');
    drawLobbyCrest(g, 104, 79, 20);
    g.lineStyle(1, C.gold, 0.3).lineBetween(82, 286, 490, 286);
    txt(this, 138, 79, T().titleTagline, 12, C.dim, { origin: [0, 0.5] });
    txt(this, 80, 192, '影刃亂鬥', 102, '#e2c48b', { title: true, bold: true, origin: [0, 0.5], stroke: '#11141c', strokeThickness: 5 });
    txt(this, 86, 266, 'S H A D O W   &   S T E E L', 20, C.text, { origin: [0, 0.5] });
    txt(this, 86, 310, T().lobbyTagline, 14, '#9faabc', { origin: [0, 0.5] });

    const layer = this.add.container(0, 0);
    const nav = new FocusNav(this);
    this.pushNav(nav);
    const items: [string, () => void][] = [
      [T().startGame, () => this.scene.start('Mode')],
      [T().howToPlay, () => this.openHowTo()],
      [T().padSetup, () => this.scene.start('Pads', { from: 'Title' })],
      [T().settings, () => this.openSettings()],
    ];
    items.forEach(([label, onPress], i) => {
      addButton(this, layer, nav, { id: `b${i}`, x: 286, y: 374 + i * 64, w: 400, h: 49, label, primary: i === 0, size: i === 0 ? 25 : 18, onPress });
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
