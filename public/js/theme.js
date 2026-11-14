// The looks, and putting one on the page: light, dark or the system's, in Standard or Command Center (with its phosphor
// colour). One copy, used by the dashboard (core.js) and by the calculator's page (part of its bundle too,
// server/calculator.js), so the two can never disagree about what a look is called or where it is remembered.

export const THEME_KEY = 'cxcalc-theme';
export const ACCENT_KEY = 'cc-accent';
export const OPS_KEY = 'cc-ops';
export const THEMES = [
  ['aurora', 'Standard', 'Calm and plain: the command center\u2019s own'],
  ['command', 'Command Center', 'The war room: phosphor green and amber, radar, DEFCON status'],
];
/** A look from before (Ocean, Emerald, Sunset, Royal, Graphite) is now the standard one. */
export const lookOf = (accent) => (THEMES.some(([id]) => id === accent) ? accent : 'aurora');
export const OPS = [['green', '#39ff88'], ['cyan', '#00e5ff'], ['blue', '#4d9fff'], ['amber', '#ffb000'], ['red', '#ff4d4d'], ['violet', '#be82ff']];

/** Command Center's phosphor colour (green unless chosen). */
export function applyOps(ops) {
  const v = OPS.some(([id]) => id === ops) ? ops : 'green';
  document.documentElement.dataset.ops = v;
  try {
    localStorage.setItem(OPS_KEY, v);
  } catch {}
}

const media = matchMedia('(prefers-color-scheme: dark)');
let themeMode = 'light';
/** Put a look on the page, and remember it on this device (so the next page opens in it at once). */
export function applyTheme(mode = themeMode, accent) {
  themeMode = ['light', 'dark', 'system'].includes(mode) ? mode : 'light';
  document.documentElement.dataset.theme = themeMode === 'system' ? (media.matches ? 'dark' : 'light') : themeMode;
  if (accent) accent = lookOf(accent);
  if (accent) document.documentElement.dataset.accent = accent;
  try {
    localStorage.setItem(THEME_KEY, document.documentElement.dataset.theme);
    if (accent) localStorage.setItem(ACCENT_KEY, accent);
  } catch {}
}
media.addEventListener?.('change', () => themeMode === 'system' && applyTheme('system'));

/** The look this device last had, at once (before the person's own is known). */
export function applyKeptTheme() {
  try {
    applyOps(localStorage.getItem(OPS_KEY));
    applyTheme(localStorage.getItem(THEME_KEY) || 'light', localStorage.getItem(ACCENT_KEY) || 'aurora');
  } catch {
    applyTheme('light', 'aurora');
  }
}
