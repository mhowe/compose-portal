/**
 * AIBuilderSettings — a non-rendering widget that exposes an imperative API
 * for reading and updating runtime settings on the AI Builder companion
 * service (currently: Anthropic API key and Claude model).
 *
 * Form designers wire it to their own form fields and Save buttons; the
 * widget is just the data conduit. This keeps the widget compatible with
 * a future broader "kapp settings" UI without fighting it for layout.
 *
 * Initialize once on form load:
 *
 *   bundle.widgets.AIBuilderSettings({
 *     config: {
 *       endpoint: kapp('attribute:Companion Service URL'),
 *     },
 *     id: 'settings',
 *   });
 *
 * Then call methods via the API object:
 *
 *   const settings = bundle.widgets.AIBuilderSettings.get('settings');
 *   const current = await settings.fetch();
 *   const result  = await settings.save({ api_key: '...', model: '...' });
 *   const test    = await settings.testApiKey('sk-ant-...');
 *
 * @param {Object} [opts]
 * @param {Object} [opts.config]
 * @param {string} opts.config.endpoint Required. URL of the companion service
 *   `/chat/stream` endpoint (same value the AIBuilderChat widget uses). The
 *   settings routes are derived from it by swapping the path suffix.
 * @param {string} [opts.id] Instance id used by `bundle.widgets.AIBuilderSettings.get(id)`.
 *   Required if you want to retrieve the API later.
 *
 * @returns {Object} The same API object that gets registered into
 *   `bundle.widgets.AIBuilderSettings.instances[id]`. Returning it from the
 *   call lets you skip the `.get(id)` lookup if you have the value handy.
 */
export const AIBuilderSettings = ({ config = {}, id } = {}) => {
  if (typeof config.endpoint !== 'string' || !config.endpoint) {
    console.error(
      'AIBuilderSettings Widget Error: config.endpoint is required and must be a non-empty string.',
    );
    return null;
  }

  // Derive the settings base URL by stripping `/chat/stream` (or any path
  // that follows the same shape) — same approach AIBuilderChat uses for the
  // /conversations/:id endpoint. Lets one config value cover all routes.
  const settingsUrl = config.endpoint.replace(/\/chat\/stream\/?$/, '/settings');
  const testKeyUrl = `${settingsUrl}/test-api-key`;

  /**
   * Fetch the current settings state from the companion service.
   * @returns {Promise<Object>} `{ api_key_configured, api_key_preview,
   *   api_key_source, model, model_source, max_tokens, max_tokens_source,
   *   max_iterations, max_iterations_source, available_models }`. The API key
   *   itself is never returned — only a masked preview. The `*_source` fields
   *   are one of `'settings' | 'env' | 'default'` (or `'none'` for `api_key`).
   */
  const fetch_ = async () => {
    const resp = await fetch(settingsUrl);
    if (!resp.ok) {
      throw new Error(`AIBuilderSettings.fetch: HTTP ${resp.status}: ${await resp.text()}`);
    }
    return await resp.json();
  };

  /**
   * Save changes. Send only fields you want to update.
   * - `api_key`: a candidate API key (validated against Anthropic before
   *   saving). Pass `null` or `''` to clear the stored key (falls back to env).
   * - `model`: a model id (e.g., `'claude-sonnet-4-6'`). Validated against
   *   the live model list returned by Anthropic.
   * - `max_tokens`: positive integer, output cap per Claude API call (per
   *   tool-use round, not per conversation). Pass `null` or `''` to clear.
   * - `max_iterations`: positive integer, max agent-loop iterations per user
   *   turn. Pass `null` or `''` to clear.
   *
   * @returns {Promise<Object>} `{ success: boolean, errors?: string[],
   *   current: { api_key_configured, api_key_preview, model, max_tokens,
   *   max_iterations } }`. Even on partial failure (one field saved, one
   *   rejected), `current` reflects the post-save state.
   */
  const save = async (updates = {}) => {
    const resp = await fetch(settingsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    return await resp.json();
  };

  /**
   * Validate a candidate API key without saving. Useful for an inline
   * "Test" button next to the API key field.
   *
   * @param {string} apiKey
   * @returns {Promise<Object>} `{ valid: boolean, error?: string, model_count?: number }`
   */
  const testApiKey = async (apiKey) => {
    const resp = await fetch(testKeyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey }),
    });
    return await resp.json();
  };

  const api = { fetch: fetch_, save, testApiKey };

  // Track this instance so form code can retrieve it via .get(id).
  if (id && AIBuilderSettings.instances) {
    AIBuilderSettings.instances[id] = api;
  }

  return api;
};
