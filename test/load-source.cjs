// Exercise game logic in Node without starting WebGL or Web Audio.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

module.exports = function sourceLoader({ navigator = {}, music = {}, sfx = {}, storage = new Map() } = {}) {
  const cache = new Map();
  const keys = {};
  const phaser = {
    Scene: class {},
    Geom: { Rectangle: class {
      constructor(x = 0, y = 0, width = 0, height = 0) { Object.assign(this, { x, y, width, height }); }
      get right() { return this.x + this.width; }
      get bottom() { return this.y + this.height; }
      static Contains(r, x, y) { return x >= r.x && x <= r.right && y >= r.y && y <= r.bottom; }
    } },
    Math: {
      Clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
      Between: (min, max) => Math.floor((min + max) / 2),
      Linear: (a, b, t) => a + (b - a) * t,
    },
    Input: { Keyboard: { KeyCodes: new Proxy(keys, { get: (o, key) => o[key] ??= Object.keys(o).length + 1 }) } },
  };
  const context = vm.createContext({
    console, performance, Math, structuredClone, setTimeout, clearTimeout, DataView, Uint8Array, ArrayBuffer,
    window: { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1 },
    navigator: { userAgent: 'Node test', ...navigator },
    localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
  });
  const noop = () => {};
  function load(filename) {
    if (filename === 'phaser') return phaser;
    const absolute = path.resolve(__dirname, '..', filename.startsWith('@/') ? `src/${filename.slice(2)}` : filename);
    if (/\.(png|webp|jpg|svg)$/.test(absolute)) return { default: '/src/' + path.relative(path.resolve(__dirname, '../src'), absolute) };
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const module = { exports: {} };
    cache.set(absolute, module);
    const source = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: absolute,
    }).outputText;
    const requireSource = (id) => {
      if (id === 'phaser') return phaser;
      if (/\/sfx$/.test(id)) return { sfx: new Proxy(sfx, { get: (o, k) => o[k] ?? noop }) };
      if (/\/music$/.test(id)) return { playMusic: noop, stopMusic: noop, ...music };
      const target = id.startsWith('@/')
        ? path.resolve(__dirname, '../src', id.slice(2))
        : path.resolve(path.dirname(absolute), id);
      return load(/\.(png|webp|jpg|svg)$/.test(target) ? target : fs.existsSync(`${target}.ts`) ? `${target}.ts` : `${target}/index.ts`);
    };
    vm.runInContext(`(function(require, module, exports) { ${source}\n})`, context, { filename: absolute })(requireSource, module, module.exports);
    return module.exports;
  }
  return load;
};
