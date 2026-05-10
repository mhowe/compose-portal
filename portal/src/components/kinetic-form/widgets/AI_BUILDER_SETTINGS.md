[&#x2B9C; Back to Kinetic Form Widgets](README.md#available-widgets)

## AIBuilderSettings Widget

`AIBuilderSettings` is a non-rendering widget that exposes an imperative API for reading and updating runtime settings on the AI Builder companion service. It does not own any DOM — form designers wire it to their own form fields and Save buttons. This keeps it compatible with broader settings UIs without fighting them for layout.

```js
// Initialize once on form load (no `container` needed; nothing renders).
bundle.widgets.AIBuilderSettings({
  config: {
    endpoint: kapp('attribute:Companion Service URL'),
  },
  id: 'settings',
});

// Retrieve a reference to the API later
bundle.widgets.AIBuilderSettings.get('settings');
```

### What it controls (today)

| Setting | Type | Purpose |
|---|---|---|
| `api_key` | string | The Anthropic API key the companion service uses for all chat requests. Validated against Anthropic before save. |
| `model` | string | The Claude model id (e.g. `claude-sonnet-4-6`). Validated against Anthropic's live model list before save. |
| `max_tokens` | integer | Output cap **per Claude API call** (i.e. per tool-use round, not per conversation). Default `4096`. Hard ceiling `64000`. |
| `max_iterations` | integer | Max agent-loop iterations **per user turn** (one user message can trigger up to this many tool-use rounds before the agent must produce a final reply). Default `10`. Hard ceiling `50`. |

The API key is **never returned** by the widget — `fetch()` returns a masked preview (`****...4Pk2`) and a boolean indicating whether one is configured. Production migrations will replace the local-file storage backend with encrypted kapp-attribute storage; the widget API doesn't change.

> **`max_tokens` and `max_iterations` are per-turn**, not per-conversation. There is no cumulative budget — every new user message resets both counters. Per-conversation budgets are tracked on the roadmap alongside cost dashboards.

### Storage backend

Settings live in a local JSON file on the companion service's disk (`data/settings.json`, gitignored, `chmod 0600`). Updates take effect immediately for the next chat request — no restart required. The companion service falls back to env vars (`ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `CLAUDE_MAX_TOKENS`, `CLAUDE_MAX_ITERATIONS`) when no value is in the settings file, and to hardcoded defaults if no env var is set.

### Parameters

![name=config](https://img.shields.io/badge/config-gray)
![type=Object](https://img.shields.io/badge/Object-e66e22)

<blockquote>

![name=endpoint](https://img.shields.io/badge/endpoint-gray)
![type=string](https://img.shields.io/badge/string-e66e22)
![required](https://img.shields.io/badge/required-e74c3c)  
URL of the companion service `/chat/stream` endpoint. The widget derives the settings routes (`/settings`, `/settings/test-api-key`) from this. Read it from the same kapp attribute the chat widget uses, so one place controls both.

```js
endpoint: kapp('attribute:Companion Service URL')
```

</blockquote>

![name=id](https://img.shields.io/badge/id-gray)
![type=string](https://img.shields.io/badge/string-e66e22)  
Instance id used by `bundle.widgets.AIBuilderSettings.get(id)`. Required if you want to retrieve the API later.

### Imperative API

| Method | Description |
|---|---|
| `fetch()` | Returns current settings — `{ api_key_configured, api_key_preview, api_key_source, model, model_source, max_tokens, max_tokens_source, max_iterations, max_iterations_source, available_models }`. The `*_source` fields are `'settings' \| 'env' \| 'default'` (or `'none'` for `api_key`). `available_models` is fetched live from Anthropic's `/v1/models` API; null if unreachable or no key configured. |
| `save(updates)` | Persists updates. Send only the fields you want to change. Pass `null` or `''` for any field to clear its override (falls back to env/default). Returns `{ success, errors?, current }`. |
| `testApiKey(key)` | Validates a candidate API key against Anthropic without saving. Returns `{ valid, error?, model_count? }`. Useful for an inline "Test" button. |

### Examples

#### Populate a settings form on load

```js
(async () => {
  const settings = bundle.widgets.AIBuilderSettings.get('settings');
  const current = await settings.fetch();

  // API key — show masked preview if configured, blank otherwise.
  K('field[Anthropic API Key]').value(
    current.api_key_configured ? current.api_key_preview : ''
  );

  // Model — set current value, build dropdown from available_models if present.
  K('field[Model]').value(current.model);

  if (Array.isArray(current.available_models)) {
    // Populate a custom dropdown widget or hidden field with model ids.
    K('field[Model Choices]').value(
      current.available_models.map((m) => m.id).join('\n')
    );
  }

  // Per-turn limits — populate the form fields with the resolved values.
  K('field[Max Tokens]').value(String(current.max_tokens));
  K('field[Max Iterations]').value(String(current.max_iterations));
})();
```

#### On Save

```js
(async () => {
  const settings = bundle.widgets.AIBuilderSettings.get('settings');
  const updates = {
    model: K('field[Model]').value(),
  };

  // Send the API key only if the user typed something new (and it's not the
  // masked placeholder we displayed on load).
  const apiKeyInput = K('field[Anthropic API Key]').value();
  if (apiKeyInput && !apiKeyInput.startsWith('****')) {
    updates.api_key = apiKeyInput;
  }

  // Per-turn limits — empty input clears the override so the companion
  // falls back to env/default.
  const maxTokensInput = K('field[Max Tokens]').value();
  updates.max_tokens = maxTokensInput === '' ? null : Number(maxTokensInput);

  const maxIterationsInput = K('field[Max Iterations]').value();
  updates.max_iterations =
    maxIterationsInput === '' ? null : Number(maxIterationsInput);

  const result = await settings.save(updates);
  if (result.success) {
    bundle.utils.toastSuccess({ title: 'Settings saved.' });
  } else {
    bundle.utils.toastError({
      title: 'Failed to save settings',
      description: result.errors.join(' '),
    });
  }
})();
```

#### Inline "Test" button next to the API key

```js
K('content[Test API Key Button]').element()[0].addEventListener('click', async () => {
  const settings = bundle.widgets.AIBuilderSettings.get('settings');
  const apiKey = K('field[Anthropic API Key]').value();
  if (!apiKey) return;
  const result = await settings.testApiKey(apiKey);
  if (result.valid) {
    bundle.utils.toastSuccess({
      title: 'API key is valid',
      description: `${result.model_count} models available.`,
    });
  } else {
    bundle.utils.toastError({
      title: 'API key is invalid',
      description: result.error,
    });
  }
});
```

### Behavior notes

- **API key never travels back to the browser.** `fetch()` returns a masked preview only. To "see" the key, an admin reads the file on the companion service host. This intentionally trades convenience for blast-radius.
- **Model validation is best-effort.** If Anthropic's `/v1/models` endpoint is unreachable when `save()` is called, the model is saved anyway with a warning in `errors[]`. The companion service will fail at chat time if the model is genuinely invalid; the user will see the failure on the next send.
- **Updates take effect immediately.** The companion service rebuilds the Anthropic SDK client per request, so the next chat call after a successful save uses the new key/model. No restart needed.
- **Clearing the API key.** Send `api_key: null` (or `''`) to delete the stored value. The companion service falls back to whatever's in `.env`.
- **Source labeling.** `api_key_source` and `model_source` indicate whether the current effective value came from the settings file (`'settings'`), the env var (`'env'`), or neither / hardcoded default (`'none'` / `'default'`). Useful in the UI to show admins what's actually authoritative.

### Future enhancements

- **Encrypted kapp-attribute storage** (v0.6.5b) — replace the local JSON file with values encrypted at rest in a Kinetic kapp attribute. Same widget API; different backend.
- **Per-user API key delegation** — when shipped, customers might want each user to bring their own key rather than sharing one. The settings model already accommodates this (per-tenant deployment isolates keys); per-user is a deeper rework.
- **More tunables** — `max_tokens`, `max_iterations`, `temperature`, per-user/per-project budget caps. Add to the settings shape; widget API stays compatible.
- **Cost dashboards** integrated as a sibling widget reading the same data store.
