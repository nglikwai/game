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
    Geom: { Rectangle: class {} },
    Math: {
      Clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
      Between: (min, max) => Math.floor((min + max) / 2),
      Linear: (a, b, t) => a + (b - a) * t,
    },
    Input: { Keyboard: { KeyCodes: new Proxy(keys, { get: (o, key) => o[key] ??= Object.keys(o).length + 1 }) } },
  };
  const context = vm.createContext({
    console, performance, Math, structuredClone, DataView, Uint8Array, ArrayBuffer,
    window: { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1 },
    navigator: { userAgent: 'Node test', ...navigator },
    localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
  });
  const noop = () => {};
  function load(filename) {
    if (filename === 'phaser') return phaser;
    const absolute = path.resolve(__dirname, '..', filename.startsWith('@/') ? `src/${filename.slice(2)}` : filename);
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
      return load(fs.existsSync(`${target}.ts`) ? `${target}.ts` : `${target}/index.ts`);
    };
    vm.runInContext(`(function(require, module, exports) { ${source}\n})`, context, { filename: absolute })(requireSource, module, module.exports);
    return module.exports;
  }
  return load;
};
