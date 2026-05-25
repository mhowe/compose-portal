import { useEffect, useMemo, useRef, useState } from 'react';

export const THEME_SCHEMA = {
  colors: [
    'base-100',
    'base-200',
    'base-300',
    'base-content',
    'primary',
    'primary-content',
    'secondary',
    'secondary-content',
    'accent',
    'accent-content',
    'neutral',
    'neutral-content',
    'info',
    'info-content',
    'success',
    'success-content',
    'warning',
    'warning-content',
    'error',
    'error-content',
  ],
  radius: ['box', 'field', 'selector'],
};

/**
 * Object that will store the theme for the portal
 */
export const themeState = {
  // Has the theme been initialized
  ready: false,
  // The parsed cascade-merged theme data
  data: {},
  // The parsed space-level theme (cascade input)
  spaceData: {},
  // The parsed kapp-level theme (cascade input)
  kappData: {},
  // A string of css variable overwrites to alter the theme
  css: null,
};

/**
 * Parses a JSON theme configuration string into an object. Returns an empty
 * object on missing input or parse error, after logging.
 */
export const parseThemeConfig = themeConfig => {
  if (!themeConfig) return {};
  try {
    return JSON.parse(themeConfig);
  } catch (e) {
    console.error('Error parsing theme configuration:', e);
    return {};
  }
};

/**
 * Merges two theme objects shallowly per top-level section ('colors',
 * 'radius', 'logo'). Values from `top` win over `bottom` when both are set
 * for a key. Sections absent from both stay absent.
 */
export const mergeThemes = (bottom, top) => {
  const merged = {};
  for (const section of ['colors', 'radius', 'logo']) {
    const a = bottom?.[section];
    const b = top?.[section];
    if (a || b) merged[section] = { ...(a || {}), ...(b || {}) };
  }
  return merged;
};

/**
 * Function that updates a state object with merged theme data from the
 * cascade. Kapp-level Theme overrides space-level Theme overrides bundle
 * defaults (defaults live in CSS — when both attributes are empty, `data` is
 * empty and `css` is null so the stylesheet defaults shine through).
 *
 * @param {Object} state
 * @param {{ space?: string, kapp?: string }} configs Raw JSON strings from
 *   each level of the cascade. Either may be undefined.
 * @returns {Object}
 */
export const calculateThemeState = (state, configs = {}) => {
  state.ready = true;

  const spaceData = parseThemeConfig(configs.space);
  const kappData = parseThemeConfig(configs.kapp);
  const merged = mergeThemes(spaceData, kappData);

  state.data = merged;
  // Track each level so editors can read just their own slice without
  // re-parsing the source records.
  state.spaceData = spaceData;
  state.kappData = kappData;

  // If no overrides, clear the stylesheet so CSS defaults apply.
  state.css = Object.keys(merged).length === 0 ? null : buildStylesheet(merged);
  return state;
};

export const buildStyleObject = config => {
  const result = {};
  for (const c in config?.colors) {
    if (config.colors[c]) result[`--color-${c}`] = config.colors[c];
  }
  for (const r in config?.radius) {
    if (config.radius[r]) result[`--radius-${r}`] = config.radius[r];
  }
  return result;
};

const buildStylesheet = config =>
  ':root {\n' +
  Object.entries(buildStyleObject(config))
    .map(([key, value]) => `${key}: ${value};`)
    .join('\n') +
  '\n}';

export const useDefaultTheme = () => {
  const ref = useRef();
  const [firstRender, setFirstRender] = useState(true);
  const [theme, setTheme] = useState(null);

  useEffect(() => {
    // If ref is available and there is no theme yet, extract the default theme
    if (!theme && ref.current) {
      const styles = getComputedStyle(ref.current);
      setTheme({
        colors: THEME_SCHEMA.colors.reduce(
          (colorsMap, color) => ({
            ...colorsMap,
            [color]: styles.getPropertyValue(`--color-${color}`),
          }),
          {},
        ),
        radius: THEME_SCHEMA.radius.reduce(
          (radiusMap, radius) => ({
            ...radiusMap,
            [radius]: styles.getPropertyValue(`--radius-${radius}`),
          }),
          {},
        ),
      });
    }
    // If this is not the first render and there is no theme yet, set to an
    // empty object so this effect doesn't loop infinitely
    if (!firstRender && !theme) {
      setTheme({});
    }
    setFirstRender(false);
  }, [firstRender, theme]);

  return useMemo(() => [ref, theme], [theme]);
};
