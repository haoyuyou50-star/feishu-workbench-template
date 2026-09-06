/* LiuFeng Theme Runtime — browser-first, storage-adapter friendly */
'use strict';

((global) => {
  const PRESET_COLORS = [
    '#ef8a72', '#e6ad4f', '#9aad68', '#70b78e', '#58b6ad', '#75a7f0', '#ad8adb', '#df87a4',
    '#c85f48', '#b8791f', '#697a3e', '#3f7f5e', '#347e78', '#426fae', '#76539a', '#a84f6c',
  ];

  const DEFAULT_APPEARANCE = {
    schema: 'liufeng-tool-ui/v1',
    themeMode: 'system',
    density: 'comfortable',
    fontScale: 100,
    radius: 10,
    fontFamily: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    codeFontFamily: 'ui-monospace, "SFMono-Regular", Consolas, monospace',
    location: { latitude: 31.2304, longitude: 121.4737, label: '上海（默认）' },
    tokens: {
      light: {
        background: '#f8f5f0', foreground: '#1a1613', surface: '#fffdf9', border: '#e8e2da',
        muted: '#9a918a', accent: '#d97757', diffAdded: '#3d7a4a', diffRemoved: '#b35a5a', skill: '#5a6b7a',
      },
      dark: {
        background: '#181817', foreground: '#eceae6', surface: '#222220', border: '#393836',
        muted: '#9b9994', accent: '#d97757', diffAdded: '#70a77c', diffRemoved: '#d47c7c', skill: '#8294a5',
      },
    },
    profiles: {
      light: { codeThemeId: '', contrast: 60, fonts: { ui: '', code: '' }, opaqueWindows: true, semanticColors: {} },
      dark: { codeThemeId: '', contrast: 60, fonts: { ui: '', code: '' }, opaqueWindows: true, semanticColors: {} },
    },
  };

  const TOKEN_MAP = {
    background: '--lf-paper', foreground: '--lf-ink', surface: '--lf-surface', border: '--lf-border',
    muted: '--lf-muted', accent: '--lf-accent', diffAdded: '--lf-added', diffRemoved: '--lf-removed', skill: '--lf-skill',
  };

  const deepClone = (value) => typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
  const clamp = (value, min, max, fallback = min) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  };
  const first = (...values) => values.find(value => value !== undefined && value !== null && value !== '');

  function safeColor(value, fallback = '') {
    if (typeof value !== 'string' || value.length > 64) return fallback;
    const color = value.trim();
    if (!color) return fallback;
    if (global.CSS?.supports?.('color', color)) return color;
    return /^(#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([^{};]+\)|[a-z]+)$/i.test(color) ? color : fallback;
  }

  function safeFont(value, fallback = '') {
    if (typeof value !== 'string' || value.length > 160 || /[;{}<>]/.test(value)) return fallback;
    return value.trim() || fallback;
  }

  function normalizeTheme(value) {
    const key = String(value || '').toLowerCase().replace(/[_\s-]+/g, '');
    if (['light', 'lightmode'].includes(key)) return 'light';
    if (['dark', 'darkmode'].includes(key)) return 'dark';
    if (['solar', 'sun', 'sunrise', 'sunsetsunrise', 'automaticbysun'].includes(key)) return 'solar';
    if (['system', 'auto', 'automatic', 'followssystem'].includes(key)) return 'system';
    return null;
  }

  function mergeAppearance(value = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const merged = deepClone(DEFAULT_APPEARANCE);
    merged.themeMode = normalizeTheme(source.themeMode || source.theme) || merged.themeMode;
    merged.density = source.density === 'compact' ? 'compact' : 'comfortable';
    merged.fontScale = clamp(source.fontScale ?? source.fontSizeScale ?? merged.fontScale, 85, 130, merged.fontScale);
    merged.radius = clamp(source.radius ?? source.borderRadius ?? merged.radius, 2, 22, merged.radius);
    merged.fontFamily = safeFont(source.fontFamily, merged.fontFamily);
    merged.codeFontFamily = safeFont(source.codeFontFamily, merged.codeFontFamily);
    merged.location = {
      latitude: clamp(source.location?.latitude ?? merged.location.latitude, -90, 90, merged.location.latitude),
      longitude: clamp(source.location?.longitude ?? merged.location.longitude, -180, 180, merged.location.longitude),
      label: String(source.location?.label || merged.location.label).slice(0, 80),
    };
    for (const theme of ['light', 'dark']) {
      const incoming = source.tokens?.[theme] || {};
      for (const token of Object.keys(TOKEN_MAP)) {
        merged.tokens[theme][token] = safeColor(incoming[token], merged.tokens[theme][token]);
      }
      const profile = source.profiles?.[theme] || {};
      merged.profiles[theme] = {
        codeThemeId: String(profile.codeThemeId || '').slice(0, 80),
        contrast: clamp(profile.contrast ?? 60, 0, 100, 60),
        fonts: {
          ui: safeFont(profile.fonts?.ui, ''),
          code: safeFont(profile.fonts?.code, ''),
        },
        opaqueWindows: profile.opaqueWindows !== false,
        semanticColors: {
          diffAdded: safeColor(profile.semanticColors?.diffAdded),
          diffRemoved: safeColor(profile.semanticColors?.diffRemoved),
          skill: safeColor(profile.semanticColors?.skill),
        },
      };
    }
    return merged;
  }

  function parseToml(text) {
    const root = {};
    let section = [];
    for (const original of String(text).split(/\r?\n/)) {
      const line = original.replace(/\s+#.*$/, '').trim();
      if (!line) continue;
      const header = line.match(/^\[([^\]]+)]$/);
      if (header) {
        section = header[1].split('.').map(part => part.trim());
        continue;
      }
      const match = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
      if (!match) continue;
      const path = [...section, ...match[1].split('.')];
      if (path.some(key => ['__proto__', 'constructor', 'prototype'].includes(key))) continue;
      const raw = match[2].trim();
      let parsed;
      if (/^['"].*['"]$/.test(raw)) parsed = raw.slice(1, -1);
      else if (/^(true|false)$/i.test(raw)) parsed = raw.toLowerCase() === 'true';
      else if (!Number.isNaN(Number(raw))) parsed = Number(raw);
      else parsed = raw;
      let target = root;
      for (const key of path.slice(0, -1)) target = target[key] ||= {};
      target[path.at(-1)] = parsed;
    }
    return root;
  }

  function parseLooseTheme(text) {
    const result = {};
    const pattern = /([A-Za-z][A-Za-z0-9_-]*)\s*[:=]\s*(?:"([^"]*)"|'([^']*)'|([^,;\n\r}]+))/g;
    let match;
    while ((match = pattern.exec(text))) {
      const raw = first(match[2], match[3], match[4])?.trim();
      if (raw === undefined) continue;
      result[match[1]] = raw !== '' && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
    }
    return result;
  }

  function parseAppearanceText(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) throw new Error('Appearance input is empty');
    const prefixed = trimmed.match(/^codex-theme-v1\s*:\s*([\s\S]+)$/i);
    if (prefixed) return JSON.parse(prefixed[1]);
    try { return JSON.parse(trimmed); }
    catch {
      const toml = parseToml(trimmed);
      return Object.keys(toml).length ? toml : parseLooseTheme(trimmed);
    }
  }

  function normalizeImportedTokens(source = {}) {
    const aliases = {
      background: ['background', 'bg', 'canvas'],
      foreground: ['foreground', 'fg', 'ink', 'text', 'textColor'],
      surface: ['surface', 'panel', 'card', 'surfaceColor'],
      border: ['border', 'divider', 'borderColor'],
      muted: ['muted', 'secondaryText', 'mutedText'],
      accent: ['accent', 'primary', 'accentColor'],
    };
    const tokens = {};
    for (const [target, keys] of Object.entries(aliases)) {
      const color = safeColor(first(...keys.map(key => source?.[key])));
      if (color) tokens[target] = color;
    }
    return tokens;
  }

  function inferThemeFromBackground(color, fallback = 'light') {
    const value = safeColor(color);
    if (!/^#[0-9a-f]{3,8}$/i.test(value)) return fallback;
    let hex = value.slice(1);
    if (hex.length === 3 || hex.length === 4) hex = hex.slice(0, 3).split('').map(char => char + char).join('');
    if (hex.length < 6) return fallback;
    const channels = [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
    const linear = channels.map(channel => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    return luminance < 0.36 ? 'dark' : 'light';
  }

  function importAppearance(textOrObject, requestedTheme = 'light', baseAppearance = DEFAULT_APPEARANCE) {
    const root = typeof textOrObject === 'string' ? parseAppearanceText(textOrObject) : textOrObject;
    if (!root || typeof root !== 'object' || Array.isArray(root)) throw new Error('Appearance input is not an object');
    const embedded = root.appearance && typeof root.appearance === 'object' ? root.appearance : null;
    let mapped = mergeAppearance(embedded || baseAppearance);
    const appearance = embedded || root.ui?.appearance || root.ui || root.codex?.appearance || root;
    let recognized = embedded ? 1 : 0;

    const stringTheme = typeof appearance.theme === 'string' ? appearance.theme : undefined;
    const mode = normalizeTheme(first(appearance.themeMode, stringTheme, root.color_scheme, root.colorScheme));
    if (mode) { mapped.themeMode = mode; recognized += 1; }

    if (root.theme && typeof root.theme === 'object' && (root.variant || root.codeThemeId)) {
      const codex = root.theme;
      const variant = normalizeTheme(root.variant);
      const target = ['light', 'dark'].includes(variant) ? variant : (requestedTheme === 'dark' ? 'dark' : 'light');
      const semantic = codex.semanticColors || {};
      const imported = {};
      const accent = safeColor(codex.accent);
      const ink = safeColor(codex.ink);
      const surface = safeColor(codex.surface);
      if (accent) imported.accent = accent;
      if (ink) imported.foreground = ink;
      if (surface) Object.assign(imported, { background: surface, surface });
      for (const key of ['diffAdded', 'diffRemoved', 'skill']) {
        const color = safeColor(semantic[key]);
        if (color) imported[key] = color;
      }
      mapped.tokens[target] = { ...mapped.tokens[target], ...imported };
      mapped.profiles[target] = {
        codeThemeId: String(root.codeThemeId || '').slice(0, 80),
        contrast: clamp(codex.contrast ?? mapped.profiles[target].contrast, 0, 100, mapped.profiles[target].contrast),
        fonts: {
          ui: safeFont(codex.fonts?.ui, mapped.profiles[target].fonts.ui),
          code: safeFont(codex.fonts?.code, mapped.profiles[target].fonts.code),
        },
        opaqueWindows: codex.opaqueWindows !== false,
        semanticColors: {
          diffAdded: safeColor(semantic.diffAdded),
          diffRemoved: safeColor(semantic.diffRemoved),
          skill: safeColor(semantic.skill),
        },
      };
      recognized += 1;
    }

    const colors = appearance.colors || root.colors || {};
    const accent = safeColor(first(appearance.accent, appearance.accentColor, colors.accent, colors.primary));
    if (accent) { mapped.tokens[requestedTheme === 'dark' ? 'dark' : 'light'].accent = accent; recognized += 1; }
    const density = first(appearance.density, root.density);
    if (['compact', 'comfortable'].includes(density)) { mapped.density = density; recognized += 1; }
    const fontScale = first(appearance.fontScale, appearance.fontSizeScale, root.fontScale, root.fontSizeScale);
    if (fontScale !== undefined && Number.isFinite(Number(fontScale))) { mapped.fontScale = clamp(fontScale, 85, 130); recognized += 1; }
    const radius = first(appearance.radius, appearance.borderRadius, root.radius);
    if (radius !== undefined && Number.isFinite(Number(radius))) { mapped.radius = clamp(radius, 2, 22); recognized += 1; }
    const font = first(appearance.fontFamily, appearance.font_family, appearance.uiFont, appearance.ui_font, root.fontFamily, root.uiFont);
    if (font) { mapped.fontFamily = safeFont(font, mapped.fontFamily); recognized += 1; }

    const tokenRoot = appearance.tokens || root.tokens || appearance.themes || root.themes || {};
    for (const theme of ['light', 'dark']) {
      const named = theme === 'light'
        ? first(appearance.lightTheme, appearance.light, root.lightTheme, root.light)
        : first(appearance.darkTheme, appearance.dark, root.darkTheme, root.dark);
      const source = tokenRoot[theme] || colors[theme] || named;
      const normalized = source && typeof source === 'object' ? normalizeImportedTokens(source) : {};
      if (Object.keys(normalized).length) {
        mapped.tokens[theme] = { ...mapped.tokens[theme], ...normalized };
        recognized += 1;
      }
    }

    const direct = normalizeImportedTokens(appearance);
    if (direct.background || direct.foreground || direct.surface) {
      const target = ['light', 'dark'].includes(mode) ? mode : inferThemeFromBackground(direct.background, requestedTheme);
      mapped.tokens[target] = { ...mapped.tokens[target], ...direct };
      recognized += 1;
    }

    if (!recognized) throw new Error('No recognized appearance fields were found');
    return mergeAppearance(mapped);
  }

  const degToRad = value => value * Math.PI / 180;
  const radToDeg = value => value * 180 / Math.PI;
  const normalizeDegrees = value => ((value % 360) + 360) % 360;
  const normalizeHours = value => ((value % 24) + 24) % 24;

  function calculateSunEvent(date, latitude, longitude, sunrise) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    const dayOfYear = Math.floor((Date.UTC(year, month, day) - Date.UTC(year, 0, 0)) / 86_400_000);
    const longitudeHour = longitude / 15;
    const approximate = dayOfYear + ((sunrise ? 6 : 18) - longitudeHour) / 24;
    const meanAnomaly = 0.9856 * approximate - 3.289;
    let longitudeTrue = meanAnomaly + 1.916 * Math.sin(degToRad(meanAnomaly)) + 0.020 * Math.sin(degToRad(2 * meanAnomaly)) + 282.634;
    longitudeTrue = normalizeDegrees(longitudeTrue);
    let ascension = radToDeg(Math.atan(0.91764 * Math.tan(degToRad(longitudeTrue))));
    ascension = normalizeDegrees(ascension);
    ascension = (ascension + Math.floor(longitudeTrue / 90) * 90 - Math.floor(ascension / 90) * 90) / 15;
    const sinDeclination = 0.39782 * Math.sin(degToRad(longitudeTrue));
    const cosDeclination = Math.cos(Math.asin(sinDeclination));
    const cosHour = (Math.cos(degToRad(90.833)) - sinDeclination * Math.sin(degToRad(latitude))) / (cosDeclination * Math.cos(degToRad(latitude)));
    if (cosHour > 1 || cosHour < -1) return null;
    let hour = sunrise ? 360 - radToDeg(Math.acos(cosHour)) : radToDeg(Math.acos(cosHour));
    hour /= 15;
    const localMean = hour + ascension - 0.06571 * approximate - 6.622;
    const utcHours = normalizeHours(localMean - longitudeHour);
    const dayShift = Math.floor((utcHours + longitudeHour) / 24);
    return new Date(Date.UTC(year, month, day - dayShift) + utcHours * 3_600_000);
  }

  function calculateSunTimes(date, latitude, longitude) {
    const sunrise = calculateSunEvent(date, latitude, longitude, true);
    const sunset = calculateSunEvent(date, latitude, longitude, false);
    return sunrise && sunset ? { sunrise, sunset } : null;
  }

  function localStorageAdapter() {
    return {
      async get(key) {
        try { return JSON.parse(global.localStorage?.getItem(key) || 'null'); }
        catch { return null; }
      },
      async set(key, value) { global.localStorage?.setItem(key, JSON.stringify(value)); },
    };
  }

  function createThemeController(options = {}) {
    const storageKey = options.storageKey || 'liufengAppearance';
    const storage = options.storage || localStorageAdapter();
    let appearance = mergeAppearance(options.appearance);
    let media = null;
    let timer = null;

    function systemTheme() {
      return global.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function effectiveTheme(now = new Date()) {
      if (['light', 'dark'].includes(appearance.themeMode)) return appearance.themeMode;
      if (appearance.themeMode === 'solar') {
        const times = calculateSunTimes(now, appearance.location.latitude, appearance.location.longitude);
        if (times) return now >= times.sunrise && now < times.sunset ? 'light' : 'dark';
      }
      return systemTheme();
    }

    function apply(now = new Date()) {
      const theme = effectiveTheme(now);
      const root = options.root || global.document?.documentElement;
      if (!root) return theme;
      const profile = appearance.profiles[theme];
      root.dataset.theme = theme;
      root.dataset.density = appearance.density;
      root.dataset.opaqueWindows = profile.opaqueWindows ? 'true' : 'false';
      root.style.colorScheme = theme;
      root.style.setProperty('--lf-radius', `${appearance.radius}px`);
      root.style.setProperty('--lf-font-scale', String(appearance.fontScale / 100));
      root.style.setProperty('--lf-ui-font', profile.fonts.ui || appearance.fontFamily);
      root.style.setProperty('--lf-code-font', profile.fonts.code || appearance.codeFontFamily);
      root.style.setProperty('--lf-contrast', String(profile.contrast));
      for (const [token, cssVar] of Object.entries(TOKEN_MAP)) root.style.setProperty(cssVar, appearance.tokens[theme][token]);
      options.onApply?.({ appearance: deepClone(appearance), theme });
      if (typeof global.CustomEvent === 'function') root.dispatchEvent(new CustomEvent('lf-theme-change', { detail: { theme } }));
      return theme;
    }

    async function persist() { await storage.set(storageKey, appearance); }

    async function load() {
      appearance = mergeAppearance(await storage.get(storageKey));
      apply();
      return deepClone(appearance);
    }

    async function setAppearance(next) {
      appearance = mergeAppearance(next);
      await persist();
      apply();
      return deepClone(appearance);
    }

    async function setMode(mode) {
      appearance.themeMode = normalizeTheme(mode) || 'system';
      await persist();
      return apply();
    }

    async function importText(text, requestedTheme = 'light') {
      appearance = importAppearance(text, requestedTheme, appearance);
      await persist();
      apply();
      return deepClone(appearance);
    }

    function exportText() {
      return JSON.stringify({ schema: DEFAULT_APPEARANCE.schema, appearance }, null, 2);
    }

    async function init() {
      await load();
      media = global.matchMedia?.('(prefers-color-scheme: dark)') || null;
      const onSystemChange = () => { if (appearance.themeMode === 'system') apply(); };
      if (media?.addEventListener) media.addEventListener('change', onSystemChange);
      else media?.addListener?.(onSystemChange);
      timer = global.setInterval?.(() => { if (appearance.themeMode === 'solar') apply(); }, 60_000);
      controller._onSystemChange = onSystemChange;
      return controller;
    }

    function destroy() {
      if (timer) global.clearInterval?.(timer);
      if (media?.removeEventListener) media.removeEventListener('change', controller._onSystemChange);
      else media?.removeListener?.(controller._onSystemChange);
      timer = null;
      media = null;
    }

    const controller = {
      apply, destroy, effectiveTheme, exportText, importText, init, load, setAppearance, setMode,
      getAppearance: () => deepClone(appearance),
      _onSystemChange: null,
    };
    return controller;
  }

  global.LFTheme = {
    DEFAULT_APPEARANCE: deepClone(DEFAULT_APPEARANCE),
    PRESET_COLORS: [...PRESET_COLORS],
    calculateSunTimes,
    createThemeController,
    importAppearance,
    inferThemeFromBackground,
    mergeAppearance,
    normalizeTheme,
    parseAppearanceText,
  };
})(globalThis);
