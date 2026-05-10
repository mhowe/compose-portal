import { throttle } from 'lodash-es';
import { regRedux } from '../redux.js';
import { getAttributeValue } from './records.js';
import { calculateThemeState, themeState } from './theme.js';

// State for the customized theme
export const themeActions = regRedux(
  'theme',
  { ...themeState },
  {
    // Payload: { space, kapp } — either or both records (with attributesMap
    // included). Each contributes a layer to the cascade; missing records
    // contribute nothing.
    setTheme(state, payload) {
      calculateThemeState(state, {
        space: getAttributeValue(payload?.space, 'Theme'),
        kapp: getAttributeValue(payload?.kapp, 'Theme'),
      });
    },
    enableEditor(state) {
      state.editor = true;
    },
    disableEditor(state) {
      state.editor = false;
    },
  },
);

// State for global app data
export const appActions = regRedux(
  'app',
  {
    // Is the user authenticated
    authenticated: false,
    // Space record
    space: null,
    // Slug of the kapp to use for the service portal
    kappSlug: null,
    // Service portal kapp record
    kapp: null,
    // Profile record
    profile: null,
    // Error from fetching any app data
    error: null,
  },
  {
    setAuthenticated(state, payload) {
      state.authenticated = payload;
    },
    setSpace(state, { error, space }) {
      if (error) state.error = error;
      else {
        state.space = space;
        state.kappSlug = getAttributeValue(
          space,
          'Service Portal Kapp Slug',
          'service-portal',
        );
      }
    },
    setKapp(state, { error, kapp }) {
      if (error) state.error = state.error || error;
      else state.kapp = kapp;
    },
    setProfile(state, { error, profile }) {
      if (error) state.error = state.error || error;
      else state.profile = profile;
    },
    updateProfile(state, profile) {
      Object.assign(state.profile, profile);
    },
    // Shallow-merge a partial record into state.space / state.kapp. Useful
    // after a targeted save (updateSpace / updateKapp) so we refresh the
    // changed fields without dropping fields that weren't included in the
    // mutation response (e.g. spaceAttributeDefinitions, kapp.categories).
    updateSpaceData(state, partial) {
      if (state.space && partial) Object.assign(state.space, partial);
    },
    updateKappData(state, partial) {
      if (state.kapp && partial) Object.assign(state.kapp, partial);
    },
  },
);

// Layout state — controls bundle-level chrome (Header, etc.). Pages set
// chromeHidden to render full-bleed (e.g. forms with Display Mode = fullscreen)
// and clear it on unmount so the rest of the portal keeps its chrome.
export const layoutActions = regRedux(
  'layout',
  { chromeHidden: false },
  {
    setChromeHidden(state, payload) {
      state.chromeHidden = !!payload;
    },
  },
);

// Modal stack — drives the global ModalSlot rendered in App.jsx. Stacked so a
// modal opened from inside another modal layers on top rather than replacing.
// Each entry: { id, type, path?, url?, size, title, closeOn }.
export const modalActions = regRedux(
  'modal',
  { stack: [] },
  {
    push(state, modal) {
      state.stack.push(modal);
    },
    remove(state, id) {
      state.stack = state.stack.filter(m => m.id !== id);
    },
    popTop(state) {
      state.stack.pop();
    },
    clear(state) {
      state.stack = [];
    },
  },
);

// State for the current view size of the app
const viewActions = regRedux(
  'view',
  { ...calcViewState() },
  {
    handleResize(state) {
      calcViewState(state);
    },
  },
);
// Register a resize handler to update the view state
window.addEventListener('resize', throttle(viewActions.handleResize, 200));

/**
 * Function that updates a state object with the latest view data
 * @param {Object} state
 * @returns {Object}
 */
function calcViewState(state = {}) {
  state.width = window.innerWidth;
  if (window.innerWidth < 640) {
    state.size = 'xs'; // 0 <-> 639
  } else if (window.innerWidth < 768) {
    state.size = 'sm'; // 640 <-> 767
  } else if (window.innerWidth < 1024) {
    state.size = 'md'; // 768 <-> 1023
  } else if (window.innerWidth < 1280) {
    state.size = 'lg'; // 1024 <-> 1279
  } else if (window.innerWidth < 1536) {
    state.size = 'xl'; // 1280 <-> 1535
  } else {
    state.size = '2xl'; // 1536 <-> ...
  }
  state.mobile = ['xs', 'sm'].includes(state.size);
  state.tablet = ['md', 'lg'].includes(state.size);
  state.desktop = ['xl', '2xl'].includes(state.size);
  return state;
}
