import { closeConfirm, openConfirm } from '../../../helpers/confirm.js';
import { navigate } from '../../../helpers/navigation.js';
import { modalActions } from '../../../helpers/state.js';
import { store } from '../../../redux.js';
import {
  clearToasts,
  toastError,
  toastSuccess,
} from '../../../helpers/toasts.js';

/**
 * Singleton-per-name registry of handlers attached via `onWidgetEvent`.
 * Each event name has at most one entry — re-registering with the same name
 * replaces the prior handler. Form bundle scripts run on every form mount,
 * so this prevents listener pile-up that would otherwise happen if designers
 * naively used `window.addEventListener`.
 */
const widgetEventHandlers = new Map();

/**
 * Registers a handler for a widget-dispatched CustomEvent (e.g. the events
 * fired by `BundleLogo` when its clickAction is `{ type: 'event', name }`).
 * Replaces any prior handler registered under the same event name, so
 * calling this on every form load is safe and won't stack listeners.
 *
 * Designed for the form-side authoring surface — form bundle scripts call
 * `bundle.utils.onWidgetEvent('my-event', e => { ... })` once per load and
 * stop worrying about cleanup.
 *
 * @param {string} name CustomEvent name (matches the `name` you set in a
 *   widget's `clickAction: { type: 'event', name }`).
 * @param {Function} handler Receives the CustomEvent. `event.detail` for
 *   widget events contains `{ widget, id, config }`.
 * @returns {Function} Cleanup function. Calling it removes this handler if
 *   it's still the registered one (a later `onWidgetEvent` for the same
 *   name will have replaced it, in which case cleanup is a no-op).
 */
export const onWidgetEvent = (name, handler) => {
  if (typeof name !== 'string' || name.length === 0) {
    console.error(
      'onWidgetEvent: `name` must be a non-empty string event name.',
    );
    return () => {};
  }
  if (typeof handler !== 'function') {
    console.error('onWidgetEvent: `handler` must be a function.');
    return () => {};
  }
  const existing = widgetEventHandlers.get(name);
  if (existing) window.removeEventListener(name, existing);
  window.addEventListener(name, handler);
  widgetEventHandlers.set(name, handler);
  return () => {
    if (widgetEventHandlers.get(name) === handler) {
      window.removeEventListener(name, handler);
      widgetEventHandlers.delete(name);
    }
  };
};

/**
 * Removes the handler registered for an event name via `onWidgetEvent`.
 * No-op when no handler is registered for that name.
 */
export const offWidgetEvent = name => {
  const existing = widgetEventHandlers.get(name);
  if (existing) {
    window.removeEventListener(name, existing);
    widgetEventHandlers.delete(name);
  }
};

/* ------------------------------------------------------------------ */
/* Programmatic modals                                                */
/*                                                                    */
/* Form-side code (form bundle scripts, custom event handlers, etc.)  */
/* opens modals by calling `bundle.utils.openModal(config)`. The modal*/
/* stack is global; modals layer on top of one another rather than    */
/* replacing, so a form rendered in one modal can open another and    */
/* the form designer doesn't need to know the embedding context.      */
/* ------------------------------------------------------------------ */

const MODAL_TYPES = ['internal', 'home', 'external'];
const MODAL_SIZES = ['sm', 'md', 'lg', 'xl', 'full'];
const DEFAULT_CLOSE_ON = ['esc', 'backdrop', 'button'];

let nextModalId = 0;

// Side registry of `onClose` callbacks keyed by modal id. Kept out of Redux
// state because functions aren't serializable; ModalSlot fires + clears them
// when the corresponding entry unmounts (any close path triggers this).
const modalCloseCallbacks = new Map();

/**
 * Internal — fires and clears the `onClose` callback registered for this
 * modal id, if any. Called from ModalSlot when an entry unmounts. Errors in
 * a designer-supplied callback are caught and logged so one broken callback
 * can't crash the modal stack.
 */
export const fireAndClearModalCloseCallback = id => {
  const cb = modalCloseCallbacks.get(id);
  if (!cb) return;
  modalCloseCallbacks.delete(id);
  try {
    cb();
  } catch (err) {
    console.error(`openModal: onClose callback for "${id}" threw:`, err);
  }
};

const validateModalConfig = config => {
  if (!config || typeof config !== 'object') {
    console.error('openModal: config object is required.');
    return false;
  }
  if (!MODAL_TYPES.includes(config.type)) {
    console.error(
      `openModal: type must be one of ${MODAL_TYPES.join(', ')}.`,
    );
    return false;
  }
  if (config.type === 'internal') {
    if (typeof config.path !== 'string' || !config.path.startsWith('/')) {
      console.error(
        "openModal: type='internal' requires a path starting with '/'.",
      );
      return false;
    }
  }
  if (config.type === 'external') {
    if (typeof config.url !== 'string' || config.url.length === 0) {
      console.error("openModal: type='external' requires a url.");
      return false;
    }
  }
  if (config.size != null && !MODAL_SIZES.includes(config.size)) {
    console.error(
      `openModal: size must be one of ${MODAL_SIZES.join(', ')}.`,
    );
    return false;
  }
  if (config.onClose != null && typeof config.onClose !== 'function') {
    console.error('openModal: onClose must be a function when provided.');
    return false;
  }
  return true;
};

/**
 * Opens a modal programmatically. Returns a close function that closes this
 * specific modal. Supported config shapes:
 *
 *   { type: 'internal', path: '/forms/help', size, title, closeOn, onClose }
 *   { type: 'home', size, title, closeOn, onClose }
 *   { type: 'external', url: 'https://...', size, title, closeOn, onClose }
 *
 * `size`: 'sm' | 'md' | 'lg' | 'xl' | 'full'  (default 'md')
 * `title`: optional string, displayed in the modal header
 * `closeOn`: array of close mechanisms, default ['esc','backdrop','button'].
 *   Pass a subset (e.g. ['esc','button']) to disable backdrop-click close.
 *   Pass [] for fully programmatic-only close.
 * `onClose`: optional function called once when the modal closes by any
 *   means — esc, backdrop, button, the close fn returned here, closeModal,
 *   or closeAllModals. Useful for refreshing a counter or other UI that
 *   may have changed while the modal was open.
 *
 * @returns {Function} A close function that dismisses this modal.
 */
export const openModal = config => {
  if (!validateModalConfig(config)) return () => {};
  const id = `modal-${++nextModalId}`;
  // home is sugar for internal at '/'
  const resolvedType = config.type === 'home' ? 'internal' : config.type;
  const path = config.type === 'home' ? '/' : config.path;
  if (typeof config.onClose === 'function') {
    modalCloseCallbacks.set(id, config.onClose);
  }
  modalActions.push({
    id,
    type: resolvedType,
    path,
    url: config.url,
    size: config.size || 'md',
    title: config.title,
    closeOn: config.closeOn || DEFAULT_CLOSE_ON,
  });
  return () => modalActions.remove(id);
};

/**
 * Closes a modal. With no argument, closes the topmost modal on the stack.
 * With an id, closes that specific modal (no-op if not on the stack).
 */
export const closeModal = id => {
  if (id) modalActions.remove(id);
  else modalActions.popTop();
};

/**
 * Closes all open modals. Useful for hard resets (e.g., after auth timeout).
 */
export const closeAllModals = () => modalActions.clear();

// Side-effect: ensure the modal slice is registered the moment this module
// loads, so `state.modal` exists before the first openModal call. (regRedux
// runs at import time; this line just keeps the reference live.)
void store;

export default {
  // Toasts
  toastSuccess,
  toastError,
  clearToasts,
  // Confirm modal
  openConfirm,
  closeConfirm,
  // Widget events — see onWidgetEvent docstring for usage.
  onWidgetEvent,
  offWidgetEvent,
  // Programmatic modals — see openModal docstring for usage.
  openModal,
  closeModal,
  closeAllModals,
  // SPA navigation — see helpers/navigation.js for the navigate docstring.
  navigate,
};
