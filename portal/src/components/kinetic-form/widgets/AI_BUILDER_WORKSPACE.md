[&#x2B9C; Back to Kinetic Form Widgets](README.md#available-widgets)

## AIBuilderWorkspace Widget

`AIBuilderWorkspace` is the top-level out-of-box wrapper widget for the AI Builder Assistant. It composes a project picker, conversation list, and embedded `AIBuilderChat` into a single drop-in surface — no custom UI work required.

```js
bundle.widgets.AIBuilderWorkspace({
  container: K('content[Workspace]').element(),
  config: {
    endpoint: kapp('attribute:Companion Service URL'),
    userIdentifier: identity('username'),
    storageKappSlug: kapp('attribute:Data Storage Kapp Slug'),
    height: 'lg',
  },
  id: 'workspace',
});
```

### What it covers

| Feature | Notes |
|---|---|
| Project picker | Dropdown of all `Active` projects (sourced from companion `GET /projects`). Includes a virtual "No project (generic)" option for orphan conversations. |
| New project | Inline name + description form by default. Override-able via `customCreateProject: true` (see [Custom create flow](#custom-create-project-flow)). |
| Conversation list | Conversations under the selected project, sorted newest first. Title, last active (relative), token totals, model. **Team-visible** — does not filter by current user. |
| Title filter | Quick client-side filter on the conversation list. |
| Link / move conversation | Two surfaces: a dropdown in the chat-view header strip (move the active conversation), and a "↔" button on each conversation row in the picker (move any row inline). Both call `PATCH /conversations/:id`. |
| New chat | Start a fresh conversation in the current project. Embedded `AIBuilderChat` mounts on click. |
| Auto-collapse | Once a conversation is active, the picker hides and a thin "Project · Title" header strip appears with a "Change" button. |
| Resume | Selecting a conversation from the list calls `AIBuilderChat.loadConversation(...)` to replay it. |

### What it deliberately doesn't cover

`AIBuilderSettings` is **not** included. Settings (API key, model, max_tokens, max_iterations) live on a separate form, often with admin-only permissions. Wire `AIBuilderSettings` separately on its own form.

Also out of scope (not "rebuilding Claude Code"): branching/forking, conversation export/sharing, tags, side-by-side conversations, custom system prompts per conversation, cost dashboards (the v0.9 roadmap covers that), per-user filtering.

### Parameters

**`config`** — *Object*  

<blockquote>

**`endpoint`** — *string*, required  
The companion service `/chat/stream` URL. The widget derives `/projects` and `/conversations` by stripping the suffix — same pattern as `AIBuilderSettings`. Read it from a kapp attribute so one config value covers the whole AI Builder install.

```js
endpoint: kapp('attribute:Companion Service URL')
```

**`userIdentifier`** — *string*  
Username of the current user. Sent with chat requests and used as the default owner when creating new projects. Defaults to `'anonymous'`.

```js
userIdentifier: identity('username')
```

**`storageKappSlug`** — *string*  
Kapp slug where the AI Builder storage forms (`ai-builder-conversations`, `ai-builder-projects`) live. Forwarded to all backend calls. When omitted, the companion uses its env-var fallback.

**`initialProjectSlug`** — *string*  
Pre-select a project on mount. Use the literal `'__none__'` to start in the orphan/generic bucket.

**`initialConversationId`** — *string*  
Skip the picker and open straight to a conversation. The widget calls `AIBuilderChat.loadConversation(...)` after mount to populate it.

**`customCreateProject`** — *boolean*  
When `true`, the inline new-project form is suppressed and clicking "New project" dispatches a `'ai-builder-new-project'` window event. Default: `false`. See [Custom create flow](#custom-create-project-flow).

**`chatConfig`** — *Object*  
Extra config forwarded to the embedded `AIBuilderChat`. `endpoint`, `userIdentifier`, `storageKappSlug`, `projectSlug`, and `conversationId` are managed by the workspace and cannot be overridden here. Useful for `{ showUsage: false, showModel: false, placeholder: '...' }`.

**`height`** — *string*  
One of `'sm'`, `'md'`, `'lg'` _(default)_, `'full'`, or any custom Tailwind height class.

</blockquote>

**`id`** — *string*  
Instance id used by `bundle.widgets.AIBuilderWorkspace.get(id)`. Required if you want to retrieve the API later.

### Imperative API

| Method | Description |
|---|---|
| `getView()` | Returns `'picker'` or `'chat'`. |
| `getSelectedProjectSlug()` | Current project slug or `null`. The literal `'__none__'` for the orphan bucket. |
| `getActiveConversationId()` | Current conversation id or `null`. |
| `getChatApi()` | The embedded `AIBuilderChat`'s API object — null when in picker view. Use this to call `send()`, `setModel()`, etc. on the inner chat. |
| `getProjects()` | Last-loaded project list. |
| `getConversations()` | Last-loaded conversation list (for the current project). |
| `selectProject(slug)` | Switch to a different project. Stays in picker view. |
| `newChat()` | Start a fresh conversation in the current project (jumps to chat view). |
| `backToPicker()` | Return to picker view from chat view. |
| `refreshProjects()` | Re-fetch the project list from the companion. |
| `refreshConversations()` | Re-fetch the conversation list for the current project. |
| `linkConversationToProject(conversationId, targetSlug)` | Link a conversation to a project, or unlink it (pass `null` or `'__none__'`). When the active conversation is moved, the embedded chat's `setProject` is called so subsequent messages send the right `project_slug`. Resolves to the updated record or `null` on failure. |
| `destroy()` | Standard cleanup. |

### Companion endpoints used

| Endpoint | Purpose |
|---|---|
| `GET /projects?status=Active` | Project list |
| `GET /conversations?project_slug=<slug>` | Conversation list. Pass `project_slug=__none__` for orphans. |
| `POST /projects` | Create a new project. Body: `{ name, description, user_identifier, storage_kapp_slug }`. Slug is auto-derived server-side. |
| `GET /conversations/:id` | Resume — called by the embedded `AIBuilderChat` widget. |
| `PATCH /conversations/:id` | Update conversation metadata. Body: `{ project_slug?, title?, status?, storage_kapp_slug? }`. Pass `project_slug: ''` or `null` to unlink (orphan). 404 if the target project doesn't exist. |
| `POST /chat/stream` | Streaming chat — called by the embedded `AIBuilderChat` widget. |

### Custom create-project flow

Setting `config.customCreateProject: true` suppresses the inline name + description form. When the user clicks "New project", the widget dispatches a `'ai-builder-new-project'` event on `window` instead of rendering a form. Listen with `bundle.utils.onWidgetEvent`.

```js
bundle.utils.onWidgetEvent('ai-builder-new-project', e => {
  // e.detail = { widget: 'AIBuilderWorkspace', id: 'workspace' }
  console.log('User wants to create a project from', e.detail.id);
  // ...do whatever your form needs to capture project metadata...
});
```

This is the right escape hatch when you need richer create UX than the inline form covers — e.g., capturing initial decisions, attaching to a kapp, custom required attributes, or running validation against an integration before save.

#### Recommended override pattern: open the actual project form in a modal

Rather than reimplementing project create, point the user at the storage kapp's project form via `bundle.utils.openModal`. This way the create UX is "the same form an admin would use to edit project metadata directly," and any field changes to the storage form automatically flow through.

```js
bundle.utils.onWidgetEvent('ai-builder-new-project', () => {
  bundle.utils.openModal({
    type: 'internal',
    path: '/kapps/<your-storage-kapp>/forms/ai-builder-project',
    size: 'lg',
    title: 'New AI Builder Project',
    closeOn: ['esc', 'button'], // backdrop click would lose form state
  });
});
```

After the modal form submits, refresh the workspace's project list:

```js
bundle.widgets.AIBuilderWorkspace.get('workspace').refreshProjects();
```

You can wire that into a form-submitted event from the modal form, or trigger it on modal close.

### Examples

#### Basic install

```js
bundle.widgets.AIBuilderWorkspace({
  container: K('content[Workspace]').element(),
  config: {
    endpoint: kapp('attribute:Companion Service URL'),
    userIdentifier: identity('username'),
  },
  id: 'workspace',
});
```

#### Pre-select a project

```js
bundle.widgets.AIBuilderWorkspace({
  container: K('content[Workspace]').element(),
  config: {
    endpoint: kapp('attribute:Companion Service URL'),
    userIdentifier: identity('username'),
    initialProjectSlug: 'hr-onboarding',
    height: 'full',
  },
  id: 'workspace',
});
```

#### Hide model + usage in the embedded chat

```js
bundle.widgets.AIBuilderWorkspace({
  container: K('content[Workspace]').element(),
  config: {
    endpoint: kapp('attribute:Companion Service URL'),
    userIdentifier: identity('username'),
    chatConfig: { showUsage: false, showModel: false },
  },
  id: 'workspace',
});
```

#### Programmatically send a message after a project is selected

```js
const ws = bundle.widgets.AIBuilderWorkspace.get('workspace');
ws.selectProject('hr-onboarding');
ws.newChat();
// newChat() is async (mount + first render); wait a tick for the chat to attach.
setTimeout(() => {
  const chat = ws.getChatApi();
  chat?.send('Summarize the open questions on this project.');
}, 50);
```

### Future considerations (not built)

- **Rename / delete on conversation rows** — currently you go to the storage kapp to manage conversations directly.
- **Project memory pill in the chat header** — small "12 decisions · 3 open questions" badge so the user knows what context Claude has loaded. Tracked alongside the chat widget's existing header.
- **Project archive button** — projects already have a `Status` field; surfacing archive/restore actions on the project picker is a small follow-up.
- **Per-conversation budgets** — deferred until cost dashboards exist (v0.9 roadmap).
- **Per-user filter toggle** — currently team-visible by design. A toggle to "show only my conversations" is a small additive change if usage warrants it.
