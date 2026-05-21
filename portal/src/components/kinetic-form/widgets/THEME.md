[⬅ Back to Kinetic Form Widgets](README.md#available-widgets)

## Theme Widget

Embeds the bundle's theme editor — colors, radius, and logo, with a live preview — inside a Kinetic form. The widget is a thin wrapper around the same editor that powers `/settings/space/theme` and `/kapps/:kappSlug/settings/theme`, so anything you can do in those routes you can do from a form. Designers reach for it when authoring a custom kapp-settings or space-settings form that needs a theming surface alongside other configuration.

```js
// Initialize the widget
bundle.widgets.Theme({ container, config, id });
```

### Parameters

| name | type | required | description |
| ---- | ---- | -------- | ----------- |
| `container` | `HTMLElement` or array-like | yes | The DOM element to render into. Accepts either a raw `HTMLElement` or the array-like wrapper returned by `K('content[Name]').element()` — both work. |
| `config` | `object` | no | Configuration. See below. |
| `id` | `string` | no | Unique id used by `registerWidget` for instance tracking. |

#### `config` keys

| key | type | default | description |
| --- | ---- | ------- | ----------- |
| `kappSlug` | `string` | — | Slug of the kapp whose theme this instance edits. When set, the widget reads and writes the `Theme` attribute on that kapp's record. |
| `target` | `'space'` \| `'kapp'` | `'kapp'` | Set to `'space'` to edit the space-level theme instead of a kapp's. Ignored when `kappSlug` is also set. |

If neither `kappSlug` nor `target: 'space'` is provided, the widget targets whichever kapp the rest of the bundle considers current (i.e. the URL-driven `state.app.kappSlug`).

### API

The widget returns the standard `container` / `destroy` API; no widget-specific functions are exposed at this time.

### Examples

**Edit the current kapp's theme:**

```js
bundle.widgets.Theme({
  container: K('content[ThemeEditor]').element(),
  id: 'theme-current',
});
```

**Edit a specific kapp's theme** (e.g. inside a settings form authored on the admin kapp that targets the services kapp):

```js
bundle.widgets.Theme({
  container: K('content[ThemeEditor]').element(),
  config: { kappSlug: 'services' },
  id: 'theme-services',
});
```

**Edit the space-level theme** (the baseline that per-kapp themes layer on top of):

```js
bundle.widgets.Theme({
  container: K('content[ThemeEditor]').element(),
  config: { target: 'space' },
  id: 'theme-space',
});
```

### Notes

- The widget requires a `Theme` attribute *definition* on the target record (kapp or space). When the definition is missing, the editor renders an inline warning and the Save action is disabled. Deploy the definition from Space Settings → Bundle Setup (`Theme` space attribute) or Space Settings → Kapp Attributes (`Theme` kapp attribute).
- The editor includes its own back link, which navigates the widget's internal HashRouter and is a no-op when the widget is embedded in a form. The link is harmless but visually awkward; future config may add a way to hide it.
- Saves are immediate — they write through to the target record's `Theme` attribute and the bundle's global theme cascade re-renders the portal with the new values. There is no draft/commit step beyond the editor's own Save button.
- The editor preview baseline is computed from the current DOM, which already has the global cascade applied. For a `target: 'space'` editor this means the kapp's overrides leak into the baseline. Acceptable for v1; the page-level editor has the same trade-off.
