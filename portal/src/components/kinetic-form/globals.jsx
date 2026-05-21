// Below is an example of exposing a library globally so that it can be used in
// the content of a Kinetic Core form. The library itself will determine
// somewhat how this happens, for example some like the one shown below return
// something that you have to manually add to 'window'. Some libraries might add
// themselves to the window when loaded or some might decorate something else,
// like a jQuery plugin.

import jquery from 'jquery';
import moment from 'moment';
import { format } from 'date-fns';
import { utc } from '@date-fns/utc';
import {
  refreshKapp,
  refreshKappForms,
  refreshKapps,
} from '../../helpers/state.js';

jquery.ajaxSetup({
  xhrFields: {
    withCredentials: true,
  },
});

window.$ = jquery;
window.jQuery = jquery;
window.moment = moment;

// Import widgets so they're available when compiling
import './widgets/widgets.js';

window.bundle = window.bundle || {};
// Seed the bundle-functions registry as an empty object so anything reading
// `bundle.functions.X` before the post-login bootstrap completes (or in a
// space that doesn't install the Global Functions capability) sees an empty
// registry instead of a missing namespace. See helpers/bundle-functions.js.
window.bundle.functions = window.bundle.functions || {};
window.bundle.config = window.bundle.config || {};
window.bundle.config.fields = {
  date: { render: renderDateTimePickers },
  datetime: { render: renderDateTimePickers },
  time: { render: renderDateTimePickers },
};

// Kapp-cache refresh API. Most widgets read kapp data from the cache (which
// is populated up-front by the bulk space fetch in App.jsx). These helpers
// let forms and widgets request a re-fetch when they know the server-side
// data has changed — e.g. after an integration writes a kapp attribute.
// See KAPP_CACHE.md for the full contract.
window.bundle.refreshKapp = refreshKapp;
window.bundle.refreshKapps = refreshKapps;
window.bundle.refreshKappForms = refreshKappForms;

// Widget reference docs — sourced from the .md files in
// src/components/kinetic-form/widgets and exposed by widgetDocsPlugin in
// vite.config.js. Forms can list and render the docs without knowing the
// deploy path, since BASE_URL is substituted at build time.
window.bundle.widgetDocs = {
  list: () =>
    fetch(`${import.meta.env.BASE_URL}widget-docs/index.json`).then(r => {
      if (!r.ok) throw new Error(`widget-docs/index.json: ${r.status}`);
      return r.json();
    }),
  get: idOrFile => {
    const file = /\.md$/i.test(idOrFile)
      ? idOrFile
      : `${idOrFile.replace(/-/g, '_').toUpperCase()}.md`;
    return fetch(`${import.meta.env.BASE_URL}widget-docs/${file}`).then(r => {
      if (!r.ok) throw new Error(`widget-docs/${file}: ${r.status}`);
      return r.text();
    });
  },

  // Rewire <a> tags inside a rendered widget-doc so internal links work
  // inside the viewer instead of leaking to the SPA router.
  //
  //   container: HTMLElement (or array-like) the Markdown widget rendered into
  //   onNavigate({ file, anchor }): called when the user clicks an internal
  //     `.md` link. `file` is the widget doc filename (e.g.
  //     'BUNDLE_CONTAINER.md'), `anchor` is the optional fragment.
  //
  // External http(s) links open in a new tab. Pure `#anchor` links scroll
  // to the matching heading inside `container` (TUI Viewer doesn't emit
  // id attributes on headings, so we slug-match each heading's text).
  rewireLinks: (container, { onNavigate, scrollTo } = {}) => {
    const root = container?.[0] ?? container;
    if (!root || typeof root.querySelectorAll !== 'function') return;

    const slug = s =>
      s
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');

    const scrollToAnchor = anchor => {
      if (!anchor) return false;
      const direct = root.querySelector(
        `[id="${anchor}"], a[name="${anchor}"]`,
      );
      if (direct) {
        direct.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return true;
      }
      const heading = Array.from(
        root.querySelectorAll('h1, h2, h3, h4, h5, h6'),
      ).find(h => slug(h.textContent || '') === anchor);
      if (heading) {
        heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return true;
      }
      return false;
    };

    root.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href') || '';
      if (/^https?:/i.test(href)) {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
        return;
      }
      if (href.startsWith('#')) {
        const anchor = href.slice(1);
        a.setAttribute('href', '#');
        a.removeAttribute('target');
        a.addEventListener('click', e => {
          e.preventDefault();
          scrollToAnchor(anchor);
        });
        return;
      }
      const match = href.match(/^([A-Za-z0-9_-]+\.md)(?:#(.*))?$/);
      if (!match) return;
      const file = match[1];
      const anchor = match[2] || null;
      a.setAttribute('href', '#');
      a.removeAttribute('target');
      a.addEventListener('click', e => {
        e.preventDefault();
        if (typeof onNavigate === 'function') onNavigate({ file, anchor });
      });
    });

    // Cross-doc anchor: caller can ask for a scroll once links are wired.
    if (scrollTo) scrollToAnchor(scrollTo);
  },
};

function renderDateTimePickers(field, trigger) {
  const isDateTime = field.type() === 'datetime';
  const toElementValue = isDateTime ? formatToIso : v => v;
  const toPickerValue = isDateTime ? formatFromIso : v => v;

  // Get input element
  const element = field.element()?.[0];
  // Clone input element
  const picker = element.cloneNode();
  // Remove id from the original element and hide it
  element.removeAttribute('id');
  element.style.display = 'none';
  // Remove name from the picker element since it's only used for display
  picker.removeAttribute('name');
  // Remove the data-element-type attribute from the picker so there's only one
  picker.removeAttribute('data-element-type');
  // Set the type of the picker element
  picker.setAttribute('type', isDateTime ? 'datetime-local' : field.type());
  // Set picker value
  picker.value = toPickerValue(element.value);

  // Use keydown and keyup events to track when the field is interacted with
  // via the keyboard so we can delay the change event until blur
  picker.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== 'Space') picker.isTyping = true;
  });
  picker.addEventListener('keyup', function () {
    picker.isTyping = false;
  });
  // Add change event to picker that updates the field value and triggers the
  // change events, but only when the picker value is not being changed via
  // keyboard interactions with the value itself
  picker.addEventListener('change', function (e) {
    if (!picker.isTyping) {
      const newElementValue = toElementValue(e.target.value);
      if (element.value !== newElementValue) {
        element.value = newElementValue;
        trigger();
      }
    }
  });
  // Add blur event to picker that updates the field value and triggers the
  // change events. This is used to delay updating the field value until the
  // user is done "typing" in a value.
  picker.addEventListener('blur', function (e) {
    const newElementValue = toElementValue(e.target.value);
    if (element.value !== newElementValue) {
      element.value = newElementValue;
      trigger();
    }
  });

  // Add change event to field to sync the picker if the field is updated via
  // its api
  field.on('change', function ({ newValue }) {
    const newPickerValue = toPickerValue(newValue);
    if (picker.value !== newPickerValue) {
      picker.value = newPickerValue;
    }
  });

  // Append the picker after the element
  element.after(picker);

  // Update enable and disable function to also affect the picker
  const originalEnable = field.enable;
  const originalDisable = field.disable;
  field.enable = function () {
    originalEnable();
    picker.removeAttribute('disabled');
  };
  field.disable = function () {
    originalDisable();
    picker.setAttribute('disabled', 'disabled');
  };
}

function formatToIso(value) {
  return value ? format(value, "yyyy-MM-dd'T'HH:mm:ssxxx", { in: utc }) : value;
}

function formatFromIso(value) {
  return value ? format(value, "yyyy-MM-dd'T'HH:mm") : value;
}
