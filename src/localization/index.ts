import { en } from '@/localization/locales/en';
import { zh } from '@/localization/locales/zh';

export type Lang = 'zh' | 'en';

const STORAGE_KEY = 'arena-duel-lang';

let lang: Lang = (() => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {
    // Storage unavailable: use the default.
  }
  return 'zh';
})();

export function getLang(): Lang {
  return lang;
}

export function setLang(l: Lang) {
  lang = l;
  try {
    localStorage.setItem(STORAGE_KEY, l);
  } catch {
    // Not critical.
  }
}

/** Strings for the current language. */
export function T(): typeof en {
  return lang === 'zh' ? zh : en;
}
