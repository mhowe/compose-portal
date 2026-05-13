[&#x2B9C; Back to Kinetic Form Widgets](README.md#available-widgets)

## AIBuilderChat Widget

`AIBuilderChat` renders a chat surface that streams responses from the AI Builder companion service. Designed for builders/admins working in the platform — for the end-user-facing assistant, use the (forthcoming) `AIChat` widget instead.

```js
// Initialize the AIBuilderChat widget
bundle.widgets.AIBuilderChat({ container, config, id });

// Retrieve a reference to the widget's API
bundle.widgets.AIBuilderChat.get(id);
```

### What it does

The widget handles the full conversation lifecycle:

- Posts user messages to the companion service `/chat/stream` endpoint
- Parses the SSE stream coming back, rendering text deltas live as Claude generates them
- Shows tool execution cards inline (`🔧 core_listKapps · 1.2KB`) so builders can see what the AI is doing
- Tracks `conversation_id` across turns so follow-up messages continue the conversation
- Auto-loads project memory when `projectSlug` is set (the companion service injects project context into the system prompt server-side; the widget just shows the project's name in its header)
- Tracks cumulative token usage and surfaces it in a small inline pill

### Requirements

- A running AI Builder companion service reachable from the browser. Typically configured via a kapp attribute (e.g. `Companion Service URL`) the form designer reads at render time.
- The companion service must include the kapp's origin in its `ALLOWED_ORIGINS` env var (CORS).

### Parameters

**`container`** — *HTMLElement or array-like*  
The DOM element to render into. Accepts either a real `HTMLElement` or the array-like wrapper returned by `K('content[Name]').element()`.

**`config`** — *Object*  
An object of configurations for the widget. <code>endpoint</code> is required; everything else is optional.

> **`endpoint`** — *string*, required  
> Full URL of the companion service `/chat/stream` endpoint. Typically read from a kapp attribute set by the space admin at install time:
>
> ```js
> endpoint: kapp('attribute:Companion Service URL')
> ```
>
> **`userIdentifier`** — *string*  
> Username of the current user. Sent with every request and stored on conversation/project records. Defaults to `'anonymous'`.
>
> ```js
> userIdentifier: identity('username')
> ```
>
> **`storageKappSlug`** — *string*  
> Kapp slug where the AI Builder Assistant's `ai-builder-conversations` and `ai-builder-projects` forms live. Sent with every request as `storage_kapp_slug`. The companion service reads this and routes all reads/writes (conversation persistence, project memory, list_conversations, list_projects, etc.) to that kapp.
>
> Form code typically reads this from a kapp attribute on the AI Builder kapp (e.g. `Data Storage Kapp Slug`), falling back to the kapp's own slug:
>
> ```js
> storageKappSlug:
>   kapp('attribute:Data Storage Kapp Slug') || kapp('slug')
> ```
>
> When omitted, the companion service falls back to its `STORAGE_KAPP_SLUG` env var. This is intended for desktop/curl testing without the widget.
>
> **`projectSlug`** — *string*  
> Project slug to load on conversation start. When set, the companion service injects that project's memory into the system prompt — Claude sees the project's current state, decisions, and open questions automatically. Can be changed later via the `setProject` API.
>
> **`conversationId`** — *string*  
> Resume a specific past conversation by id. When omitted, a new conversation is started on first send (the companion service generates a UUID).
>
> **`initialModel`** — *string*  
> Pre-set the model used for the first turn (e.g., `'claude-opus-4-7'`). When omitted, the widget fetches the configured default from the companion service `/settings` on mount. Resuming a stored conversation overrides this with that conversation's `Last Model Used` value.
>
> **`placeholder`** — *string*  
> Input placeholder text. Default: `'Type a message — Cmd/Ctrl+Enter to send'`.
>
> **`height`** — *string*  
> One of `'sm'` (h-64), `'md'` _(default, h-96)_, `'lg'` (h-[36rem]), `'full'` (h-full), or any custom Tailwind height class. The widget fills its container; the height class scopes the messages region.
>
> **`showUsage`** — *boolean*  
> When true _(default)_, shows a small token-usage pill in the header reflecting cumulative spend on the current conversation. Hide it when embedding the widget somewhere that doesn't have horizontal room for chrome.
>
> **`showModel`** — *boolean*  
> When true _(default)_, shows a model selector dropdown in the header. The dropdown is populated from `available_models` fetched from the companion service `/settings` endpoint. Selecting a different model applies to all *future* turns in the current conversation (not retroactively) and persists across resumes via the conversation's `Last Model Used` field. Hide it when you want the form to control the model purely via the imperative `setModel(...)` API.
>
> **`onSent`** — *function*  
> Called with the user's message text when they hit Send. Useful for analytics, logging, or wiring to other widgets on the same page.
>
> **`onComplete`** — *function*  
> Called with the final `done` event payload when the assistant finishes a turn. Payload shape:
>
> ```js
> {
>   conversation_id: 'uuid',
>   project_slug: 'hr-onboarding' | null,
>   iterations: 4,
>   tools_used: [{ tool: 'core_listKapps', input: {} }, ...],
>   usage: { input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens },
>   cumulative_usage: { ...same shape, accumulated across the conversation... },
>   stop_reason: 'end_turn' | 'max_iterations',
>   reply: 'Final assistant text'
> }
> ```

**`id`** — *string*  
Optional id used by `registerWidget` for instance tracking. Use it to retrieve the API later: `bundle.widgets.AIBuilderChat.get(id)`.

### Imperative API

Retrieved via `bundle.widgets.AIBuilderChat.get(id)`:

| Method | Description |
|---|---|
| `send(text)` | Send a message programmatically. Same effect as the user typing and clicking Send. |
| `clear()` | Abort any in-flight request, drop messages, start fresh. The next send begins a new conversation_id. |
| `setProject(slug)` | Switch the active project_slug. Future sends will load that project's memory. Pass `null` to drop project context. |
| `setModel(modelId)` | Change the model used for future turns in this conversation. Returns `true` if the change was applied, `false` if rejected (empty/non-string). Persists across resume via the conversation's `Last Model Used` field. Does not validate against `available_models` — invalid model ids will fail at chat time when Anthropic rejects them. |
| `getModel()` | Returns the current model id (or `null` if not yet initialized). |
| `getAvailableModels()` | Returns the list of available models last fetched from `/settings`. Each entry: `{ id, display_name, created_at }`. Empty array if `/settings` was unreachable. |
| `loadConversation(id)` | Resume a past conversation by id. Aborts any in-flight stream, fetches the conversation state from the companion service, replays the stored user/assistant text exchanges into the message list, restores the project context (if linked), the cumulative token totals, and the `Last Model Used`. The next `send` continues the conversation naturally. Returns a Promise that resolves to `true` on success, `false` on failure. |
| `getConversationId()` | Returns the current conversation_id or null. |
| `getCumulativeUsage()` | Returns the latest cumulative usage object from the most recent `done` event. |
| `abort()` | Abort an in-flight stream. The partial response stays in the message list, but the conversation is NOT saved. |
| `destroy()` | Standard registerWidget cleanup. |

### Examples

#### Basic — endpoint from kapp attribute, current user from identity

```js
bundle.widgets.AIBuilderChat({
  container: K('content[Chat]').element(),
  config: {
    endpoint: kapp('attribute:Companion Service URL'),
    userIdentifier: identity('username'),
  },
  id: 'main',
});
```

#### Pre-loaded project context

```js
bundle.widgets.AIBuilderChat({
  container: K('content[Chat]').element(),
  config: {
    endpoint: kapp('attribute:Companion Service URL'),
    userIdentifier: identity('username'),
    projectSlug: 'hr-onboarding',
    height: 'lg',
  },
  id: 'project-chat',
});
```

#### Switching projects via the imperative API

```js
const chat = bundle.widgets.AIBuilderChat.get('project-chat');
chat.setProject('billing-portal');
chat.send('Where did we leave off on this project?');
```

#### Resuming a past conversation

`loadConversation` returns a Promise. Kinetic form event handlers aren't `async` by default, so wrap in an async IIFE or use `.then()`.

```js
// Async IIFE — required because form event handlers aren't async.
(async () => {
  const chat = bundle.widgets.AIBuilderChat.get('project-chat');
  const ok = await chat.loadConversation('e9d2ca94-3c2a-4f01-a78d-8c0a5da7e2bb');
  if (ok) {
    // Past messages are replayed; project context restored; usage totals updated.
    // The next send continues the conversation seamlessly.
  } else {
    // Failure logs to the console (404, network error, etc.). Surface it
    // to the user — see widgets/UTILS.md for full toast options.
    bundle.utils.toastError({
      title: 'Could not resume conversation',
      description: 'The conversation could not be loaded. Check the console for details.',
    });
  }
})();
```

Or `.then()` if you'd rather skip the wrapper:

```js
bundle.widgets.AIBuilderChat.get('project-chat')
  .loadConversation('e9d2ca94-3c2a-4f01-a78d-8c0a5da7e2bb')
  .then(ok => {
    if (!ok) console.warn('Failed to resume conversation');
  });
```

#### Sending programmatically (e.g., from a "Suggest a kapp" button)

```js
K('content[Suggest Button]').element()[0].addEventListener('click', () => {
  const chat = bundle.widgets.AIBuilderChat.get('main');
  chat.send('Suggest a kapp structure for our use case based on the requirements above.');
});
```

### Behavior notes

- **Streaming UX.** Each iteration of the agent loop renders into a fresh assistant bubble. Tool calls appear as separate cards between bubbles. This is faithful to how the agent actually works — Claude may emit narration text before tool calls, and that narration shows up in its own bubble.
- **Markdown rendering.** Assistant messages are parsed as GitHub-flavored markdown (`react-markdown` + `remark-gfm`). Tables, fenced code blocks, headings, lists, bold/italic, and links all render natively. Styling comes from the `@tailwindcss/typography` plugin's `prose` utility, so the chat picks up your theme automatically.
- **Errors are non-fatal.** HTTP errors from the companion service, network failures, and CORS rejections render as red error bubbles inside the chat. The widget remains usable; the user can retry.
- **Aborting via `Ctrl+C` on the server vs. `abort()` from the widget.** The companion service's disconnect handler stops the agent loop and skips persistence — so an aborted turn is *not* saved. Subsequent sends continue from the last successfully-saved turn.
- **Project context is server-side.** The widget never reads or modifies project memory directly. It just sends `project_slug` with each request; the companion service handles loading + injecting + saving.
- **`conversation_id` lives in the widget's React state.** It's not persisted across page reloads. If you want a session to survive a refresh, your form code can read it via `getConversationId()` and stash it (e.g., in a hidden field, localStorage, or a Kinetic submission attribute).

### Future enhancements

Things this widget intentionally doesn't do yet — listed here so the next iteration has somewhere to start.

- **Code syntax highlighting.** Fenced code blocks currently render as plain monospace text via `prose`. Adding a rehype plugin like [`rehype-highlight`](https://github.com/rehypejs/rehype-highlight) or [`rehype-prism-plus`](https://github.com/timlrx/rehype-prism-plus) would give per-language highlighting. Bundle weight is meaningful (~50–100KB depending on language coverage), so worth measuring before adopting.
- **Reconsidering the `Markdown` widget for rendering.** The decision to use `react-markdown` was made over reusing the existing TUI-based `Markdown` widget for performance reasons (TUI is editor-shaped; embedding many viewer instances per conversation is heavy). If a future need pushes toward unified markdown styling across all widgets, revisit this trade-off.
- **Persistent conversation_id across reloads.** Currently lives in widget state only — see the bullet above for one workaround. A first-class option (e.g., `persistKey` config that stashes to localStorage) would smooth the "I refreshed and lost my chat" footgun.
- **Cost-cap awareness.** The widget shows current cumulative usage but doesn't cut off when a per-conversation/per-user budget is hit. Once the companion service exposes budget state, the widget could surface warnings or refuse sends.
- **Conversation/project picker UIs.** Listing past conversations or projects as a dropdown in the chat header. Today, that selection happens externally (form code calls `setProject()` / `loadConversation(...)`).
- **Per-message token cost surfacing.** Currently only the cumulative total is visible; per-turn cost would help users connect specific actions to their bill.
- **Optimistic / queued sends.** While streaming, the input is disabled. A future refinement could queue messages and send them sequentially, or interrupt the current stream cleanly.
