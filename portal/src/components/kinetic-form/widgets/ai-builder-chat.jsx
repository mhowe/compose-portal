import { forwardRef, useEffect, useRef, useState } from 'react';
import { Provider } from 'react-redux';
import clsx from 'clsx';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  IconCheck,
  IconCopy,
  IconPlayerStopFilled,
} from '@tabler/icons-react';
import { registerWidget, resolveContainer, WidgetAPI } from './index.js';
import { store } from '../../../redux.js';

// Walk a react-markdown children tree to recover the original text. Used to
// populate the clipboard for code-block copy buttons (the children handed to
// our `pre` renderer are React elements, not the raw source string).
const extractCodeText = children => {
  if (typeof children === 'string') return children;
  if (children == null) return '';
  if (Array.isArray(children)) return children.map(extractCodeText).join('');
  if (typeof children === 'object' && children.props) {
    return extractCodeText(children.props.children);
  }
  return '';
};

// Small button that copies a fixed string to the clipboard and flashes a
// checkmark for a beat. Used for both per-code-block and per-message copy.
const CopyButton = ({ text, className, label = 'Copy' }) => {
  const [copied, setCopied] = useState(false);
  const onClick = async e => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('AIBuilderChat: clipboard write failed', err);
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx('kbtn kbtn-xs', className)}
      title={copied ? 'Copied!' : label}
      aria-label={copied ? 'Copied!' : label}
    >
      {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
    </button>
  );
};

// Custom renderer overrides — let links open in a new tab safely, scope tables
// in an overflow container so wide tables scroll horizontally, and decorate
// fenced code blocks with a hover-reveal copy button.
const MARKDOWN_COMPONENTS = {
  a: ({ node, ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer" />
  ),
  table: ({ node, ...props }) => (
    <div className="overflow-x-auto">
      <table {...props} />
    </div>
  ),
  pre: ({ node, children, ...props }) => {
    const text = extractCodeText(children);
    return (
      <div className="relative group/pre">
        <pre {...props}>{children}</pre>
        <CopyButton
          text={text}
          label="Copy code"
          className="absolute top-2 right-2 opacity-0 group-hover/pre:opacity-100 transition-opacity kbtn-neutral shadow-sm"
        />
      </div>
    );
  },
};

// Parse a single SSE block into { event, data }. SSE events are separated
// by blank lines (\n\n); within a block, lines beginning with `event:` and
// `data:` carry the event name and JSON payload respectively.
const parseSseBlock = block => {
  const lines = block.split('\n');
  let event = null;
  const dataLines = [];
  for (const line of lines) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return null;
  try {
    return { event, data: JSON.parse(dataLines.join('\n')) };
  } catch {
    return null;
  }
};

const formatUsageShort = u => {
  if (!u) return '— tokens';
  const fmt = n => (n || 0).toLocaleString();
  return `${fmt(u.input_tokens)} in · ${fmt(u.output_tokens)} out · ${fmt(u.cache_read_input_tokens)} cache_r`;
};

const HEIGHT_CLASSES = {
  sm: 'h-64',
  md: 'h-96',
  lg: 'h-[36rem]',
  full: 'h-full',
};

// Renders the chat surface and handles the SSE stream from the companion service.
const AIBuilderChatContent = ({ config, apiRef }) => {
  const {
    endpoint,
    userIdentifier = 'anonymous',
    storageKappSlug,
    projectSlug: initialProjectSlug,
    conversationId: initialConversationId,
    initialModel,
    placeholder = 'Type a message — Cmd/Ctrl+Enter to send',
    height = 'md',
    showUsage = true,
    showModel = true,
    onSent,
    onComplete,
  } = config;

  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(initialConversationId || null);
  const [projectSlug, setProjectSlug] = useState(initialProjectSlug || null);
  const [projectInfo, setProjectInfo] = useState(null);
  const [streaming, setStreaming] = useState(false);
  const [cumulativeUsage, setCumulativeUsage] = useState(null);
  const [draft, setDraft] = useState('');
  // Model state: per-conversation. Initialized from settings on mount,
  // overridden when a stored conversation is resumed (Last Model Used),
  // or when the user picks a different model from the pill dropdown.
  const [currentModel, setCurrentModel] = useState(initialModel || null);
  const [availableModels, setAvailableModels] = useState([]);

  // Refs that need to be readable inside async callbacks without
  // re-creating the callback on every render.
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;
  const projectSlugRef = useRef(projectSlug);
  projectSlugRef.current = projectSlug;
  const currentModelRef = useRef(currentModel);
  currentModelRef.current = currentModel;
  const streamingRef = useRef(false);
  const abortRef = useRef(null);
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  const send = async text => {
    const trimmed = (text ?? draft).trim();
    if (!trimmed || streamingRef.current) return;

    streamingRef.current = true;
    setStreaming(true);
    setDraft('');
    setMessages(m => [...m, { type: 'user', content: trimmed }]);
    onSent?.(trimmed);
    scrollToBottom();

    const body = {
      message: trimmed,
      user_identifier: userIdentifier,
    };
    if (conversationIdRef.current) body.conversation_id = conversationIdRef.current;
    if (projectSlugRef.current) body.project_slug = projectSlugRef.current;
    if (storageKappSlug) body.storage_kapp_slug = storageKappSlug;
    if (currentModelRef.current) body.model = currentModelRef.current;

    const controller = new AbortController();
    abortRef.current = controller;

    let currentIteration = 0;
    let currentAssistantText = '';

    const handleEvent = ({ event, data }) => {
      if (event === 'session_start') {
        if (data.conversation_id !== conversationIdRef.current) {
          conversationIdRef.current = data.conversation_id;
          setConversationId(data.conversation_id);
        }
        if (data.project_loaded) {
          setProjectInfo({ slug: data.project_slug, name: data.project_name });
        }
        return;
      }
      if (event === 'iteration_start') {
        currentIteration = data.iteration;
        currentAssistantText = '';
        return;
      }
      if (event === 'tool_executing') {
        setMessages(m => [
          ...m,
          {
            type: 'tool',
            tool: data.tool,
            input: data.input,
            iteration: currentIteration,
            status: 'pending',
            toolUseId: data.tool_use_id,
          },
        ]);
        scrollToBottom();
        return;
      }
      if (event === 'tool_result') {
        setMessages(m =>
          m.map(msg =>
            msg.type === 'tool' && msg.toolUseId === data.tool_use_id
              ? {
                  ...msg,
                  status: data.is_error ? 'error' : 'success',
                  preview: data.preview,
                  length: data.length,
                }
              : msg,
          ),
        );
        return;
      }
      if (event === 'done') {
        if (data.cumulative_usage) setCumulativeUsage(data.cumulative_usage);
        onComplete?.(data);
        return;
      }
      if (event === 'error') {
        setMessages(m => [...m, { type: 'error', content: data.error }]);
        scrollToBottom();
        return;
      }
      // Default-named events from Anthropic — text deltas, etc.
      if (
        !event &&
        data?.type === 'content_block_delta' &&
        data.delta?.type === 'text_delta'
      ) {
        currentAssistantText += data.delta.text;
        const text = currentAssistantText;
        const iter = currentIteration;
        setMessages(m => {
          const lastIdx = m.length - 1;
          const last = m[lastIdx];
          if (last?.type === 'assistant' && last.iteration === iter) {
            const updated = [...m];
            updated[lastIdx] = { ...last, content: text };
            return updated;
          }
          return [...m, { type: 'assistant', content: text, iteration: iter }];
        });
        scrollToBottom();
      }
    };

    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
      }
      if (!resp.body) throw new Error('No response body');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const raw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const evt = parseSseBlock(raw);
          if (evt) handleEvent(evt);
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setMessages(m => [...m, { type: 'error', content: err.message }]);
      }
    } finally {
      streamingRef.current = false;
      abortRef.current = null;
      setStreaming(false);
    }
  };

  // Imperative API wired into the WidgetAPI ref. Bound once per render but
  // values come from refs so they always read the latest state.
  apiRef.current.send = text => send(text);
  apiRef.current.clear = () => {
    if (streamingRef.current && abortRef.current) abortRef.current.abort();
    setMessages([]);
    setConversationId(null);
    conversationIdRef.current = null;
    setCumulativeUsage(null);
    setProjectInfo(null);
    // Don't reset currentModel — keep the user's last choice for the next
    // new conversation. They can change it via the pill if they want.
  };
  apiRef.current.setModel = modelId => {
    if (typeof modelId !== 'string' || !modelId) return false;
    setCurrentModel(modelId);
    currentModelRef.current = modelId;
    return true;
  };
  apiRef.current.getModel = () => currentModelRef.current;
  apiRef.current.getAvailableModels = () => availableModels;
  apiRef.current.setProject = slug => {
    setProjectSlug(slug || null);
    projectSlugRef.current = slug || null;
    setProjectInfo(null);
  };
  apiRef.current.loadConversation = async conversationId => {
    if (!conversationId) {
      console.error('AIBuilderChat: loadConversation requires a conversation id.');
      return false;
    }
    if (streamingRef.current && abortRef.current) abortRef.current.abort();
    // Derive the conversation fetch URL by swapping the streaming suffix.
    const fetchUrl = endpoint.replace(
      /\/chat\/stream\/?$/,
      `/conversations/${encodeURIComponent(conversationId)}`,
    );
    const url = new URL(fetchUrl);
    if (storageKappSlug) url.searchParams.set('storage_kapp_slug', storageKappSlug);
    try {
      const resp = await fetch(url.toString());
      if (!resp.ok) {
        const body = await resp.text();
        console.error(
          `AIBuilderChat: loadConversation failed (HTTP ${resp.status}): ${body}`,
        );
        return false;
      }
      const data = await resp.json();
      // Replay stored messages onto the UI. Stored messages are compacted
      // (user/assistant text only) — tool calls were stripped at save time.
      const replayed = (data.messages || [])
        .map((m, idx) => {
          const text =
            typeof m.content === 'string'
              ? m.content
              : (m.content || [])
                  .filter(b => b?.type === 'text')
                  .map(b => b.text)
                  .join('\n');
          if (!text && m.role !== 'assistant') return null;
          if (m.role === 'user') return { type: 'user', content: text };
          if (m.role === 'assistant') {
            // Negative iteration so live streaming numbers don't collide
            // with replayed messages and accidentally merge into them.
            return { type: 'assistant', content: text, iteration: -1 - idx };
          }
          return null;
        })
        .filter(Boolean);

      setMessages(replayed);
      setConversationId(conversationId);
      conversationIdRef.current = conversationId;
      const slug = data.project_slug || null;
      setProjectSlug(slug);
      projectSlugRef.current = slug;
      setProjectInfo(data.project_info || null);
      setCumulativeUsage(data.usage || null);
      // Restore the model that was last used in this conversation. Falls
      // back to the current widget model if the conversation didn't record one.
      if (data.last_model_used) {
        setCurrentModel(data.last_model_used);
        currentModelRef.current = data.last_model_used;
      }
      // Scroll to the bottom after the replay paints.
      requestAnimationFrame(scrollToBottom);
      return true;
    } catch (err) {
      console.error('AIBuilderChat: loadConversation error:', err);
      return false;
    }
  };
  apiRef.current.getConversationId = () => conversationIdRef.current;
  apiRef.current.getCumulativeUsage = () => cumulativeUsage;
  apiRef.current.abort = () => {
    if (abortRef.current) abortRef.current.abort();
  };

  // Cleanup any in-flight request when the widget unmounts.
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // On mount, fetch the configured default model + available model list from
  // the companion service /settings endpoint. Used to populate the model pill
  // dropdown and to set an initial currentModel when the form designer didn't
  // pre-set one via config.initialModel.
  useEffect(() => {
    let cancelled = false;
    const settingsUrl = endpoint.replace(/\/chat\/stream\/?$/, '/settings');
    fetch(settingsUrl)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled || !data) return;
        if (Array.isArray(data.available_models)) {
          setAvailableModels(data.available_models);
        }
        // Only set the model from /settings if we don't already have one
        // (config.initialModel takes priority; loadConversation will also set it).
        if (!currentModelRef.current && data.model) {
          setCurrentModel(data.model);
        }
      })
      .catch(() => {
        /* settings unreachable — non-fatal; pill will show the model name we have */
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  // Auto-grow the input textarea to fit its content, up to a sensible cap.
  // Cap is 18rem (~12 rows of default font); beyond that the textarea scrolls
  // internally so the chat area stays visible.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 288)}px`;
  }, [draft]);

  const heightClass = HEIGHT_CLASSES[height] || height;
  const hasHeader = projectInfo || (showUsage && cumulativeUsage) || (showModel && currentModel);

  return (
    <div
      className={clsx(
        'flex flex-col rounded-lg border border-base-300 bg-base-100 overflow-hidden',
        heightClass,
      )}
    >
      {hasHeader && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-base-300 text-sm">
          {projectInfo ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className="kbadge kbadge-info kbadge-sm">project</span>
              <span className="font-medium truncate">{projectInfo.name}</span>
              <span className="text-base-content/60 text-xs truncate">
                ({projectInfo.slug})
              </span>
            </div>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2 whitespace-nowrap">
            {showModel && currentModel && (
              <select
                className="kselect kselect-bordered kselect-xs font-mono text-xs"
                value={currentModel}
                disabled={streaming}
                onChange={e => {
                  const v = e.target.value;
                  setCurrentModel(v);
                  currentModelRef.current = v;
                }}
                title="Model used for this conversation. Persists across resumes via the conversation's Last Model Used field."
              >
                {/* Always include the current value as an option in case it
                    isn't in available_models (e.g. /settings was unreachable). */}
                {!availableModels.find(m => m.id === currentModel) && (
                  <option value={currentModel}>{currentModel}</option>
                )}
                {availableModels.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.display_name || m.id}
                  </option>
                ))}
              </select>
            )}
            {showUsage && cumulativeUsage && (
              <span className="kbadge kbadge-ghost kbadge-sm font-mono text-xs">
                {formatUsageShort(cumulativeUsage)}
              </span>
            )}
          </div>
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2"
      >
        {messages.length === 0 && (
          <div className="text-base-content/50 text-sm text-center py-8">
            Send a message to begin.
          </div>
        )}
        {messages.map((m, i) => {
          if (m.type === 'user') {
            return (
              <div
                key={i}
                className="self-end max-w-[85%] rounded-lg bg-primary text-primary-content px-3 py-2 whitespace-pre-wrap"
              >
                {m.content}
              </div>
            );
          }
          if (m.type === 'assistant') {
            return (
              <div
                key={i}
                className="self-start max-w-[85%] relative group/msg"
              >
                <CopyButton
                  text={m.content}
                  label="Copy message"
                  className="absolute top-1.5 right-1.5 z-10 opacity-0 group-hover/msg:opacity-100 transition-opacity kbtn-ghost"
                />
                <div className="rounded-lg bg-base-200 text-base-content px-3 py-2 prose prose-sm max-w-none break-words">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={MARKDOWN_COMPONENTS}
                  >
                    {m.content}
                  </ReactMarkdown>
                </div>
              </div>
            );
          }
          if (m.type === 'tool') {
            const icon =
              m.status === 'pending' ? '⋯' : m.status === 'error' ? '✗' : '✓';
            return (
              <div
                key={i}
                className={clsx(
                  'self-start max-w-[85%] rounded-md border px-2 py-1.5 text-xs font-mono',
                  m.status === 'error'
                    ? 'border-error/40 bg-error/10 text-error'
                    : 'border-base-300 bg-base-200 text-base-content/70',
                )}
              >
                <div>
                  {icon} {m.tool}
                  {m.length != null && (
                    <span className="text-base-content/50"> · {m.length}b</span>
                  )}
                </div>
                {m.preview && (
                  <div className="mt-1 opacity-75 line-clamp-2">
                    {m.preview.length > 200
                      ? m.preview.slice(0, 200) + '…'
                      : m.preview}
                  </div>
                )}
              </div>
            );
          }
          if (m.type === 'error') {
            return (
              <div
                key={i}
                className="self-start max-w-[85%] rounded-lg bg-error/10 text-error border border-error/40 px-3 py-2 whitespace-pre-wrap"
              >
                {m.content}
              </div>
            );
          }
          return null;
        })}
      </div>

      <div className="flex gap-2 p-2 border-t border-base-300 items-end">
        <textarea
          ref={textareaRef}
          className="ktextarea ktextarea-bordered flex-1 resize-none min-h-[5rem] max-h-72 leading-relaxed py-2"
          placeholder={placeholder}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              // While streaming, send() is a no-op (guarded by
              // streamingRef.current). The Send button is also hidden in
              // that state, so this keypress just clears the modifier and
              // doesn't fire anything until the stream completes.
              send();
            }
          }}
        />
        {streaming ? (
          <button
            type="button"
            className="kbtn kbtn-neutral"
            onClick={() => {
              // Triggers the abort controller; the in-flight fetch errors out,
              // the finally block clears `streaming`, and the textarea + Send
              // button come back. Partial assistant text stays in the message
              // list (the conversation is NOT saved on abort — same contract
              // as the imperative `abort()` API).
              if (abortRef.current) abortRef.current.abort();
            }}
            title="Stop generating"
          >
            <IconPlayerStopFilled size={14} />
            <span className="ml-1">Stop</span>
          </button>
        ) : (
          <button
            type="button"
            className="kbtn kbtn-primary"
            disabled={!draft.trim()}
            onClick={() => send()}
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
};

const AIBuilderChatComponent = forwardRef(({ id, config }, ref) => {
  const api = useRef({});
  return (
    <Provider store={store}>
      <WidgetAPI ref={ref} api={api.current}>
        <AIBuilderChatContent id={id} config={config} apiRef={api} />
      </WidgetAPI>
    </Provider>
  );
});

const validateConfig = (config = {}) => {
  if (typeof config.endpoint !== 'string' || !config.endpoint) {
    console.error(
      'AIBuilderChat Widget Error: endpoint is required and must be a non-empty string.',
    );
    return false;
  }
  if (
    config.userIdentifier != null &&
    typeof config.userIdentifier !== 'string'
  ) {
    console.error('AIBuilderChat Widget Error: userIdentifier must be a string.');
    return false;
  }
  if (
    config.storageKappSlug != null &&
    typeof config.storageKappSlug !== 'string'
  ) {
    console.error('AIBuilderChat Widget Error: storageKappSlug must be a string.');
    return false;
  }
  if (config.projectSlug != null && typeof config.projectSlug !== 'string') {
    console.error('AIBuilderChat Widget Error: projectSlug must be a string.');
    return false;
  }
  if (
    config.conversationId != null &&
    typeof config.conversationId !== 'string'
  ) {
    console.error(
      'AIBuilderChat Widget Error: conversationId must be a string.',
    );
    return false;
  }
  if (config.placeholder != null && typeof config.placeholder !== 'string') {
    console.error('AIBuilderChat Widget Error: placeholder must be a string.');
    return false;
  }
  if (config.showUsage != null && typeof config.showUsage !== 'boolean') {
    console.error('AIBuilderChat Widget Error: showUsage must be a boolean.');
    return false;
  }
  if (config.showModel != null && typeof config.showModel !== 'boolean') {
    console.error('AIBuilderChat Widget Error: showModel must be a boolean.');
    return false;
  }
  if (config.initialModel != null && typeof config.initialModel !== 'string') {
    console.error('AIBuilderChat Widget Error: initialModel must be a string.');
    return false;
  }
  if (config.onSent != null && typeof config.onSent !== 'function') {
    console.error('AIBuilderChat Widget Error: onSent must be a function.');
    return false;
  }
  if (config.onComplete != null && typeof config.onComplete !== 'function') {
    console.error('AIBuilderChat Widget Error: onComplete must be a function.');
    return false;
  }
  return true;
};

/**
 * Initializes an AIBuilderChat widget instance.
 *
 * Renders a chat surface that streams responses from the AI Builder companion
 * service. Designed for builders/admins working in the platform — for the
 * end-user-facing assistant, use the (forthcoming) AIChat widget instead.
 *
 * The widget handles the full conversation lifecycle: sending messages,
 * parsing the SSE stream, rendering text deltas live as Claude generates them,
 * showing tool execution cards inline, and tracking conversation_id across
 * turns. Project context is auto-loaded when `projectSlug` is set.
 *
 * Examples:
 *
 *   // Pull the companion endpoint from a kapp attribute set by the admin.
 *   bundle.widgets.AIBuilderChat({
 *     container: K('content[Chat]').element(),
 *     config: {
 *       endpoint: kapp('attribute:Companion Service URL'),
 *       userIdentifier: identity('username'),
 *     },
 *     id: 'main',
 *   });
 *
 *   // Pre-load a specific project's context.
 *   bundle.widgets.AIBuilderChat({
 *     container: K('content[Chat]').element(),
 *     config: {
 *       endpoint: kapp('attribute:Companion Service URL'),
 *       projectSlug: 'hr-onboarding',
 *       height: 'lg',
 *     },
 *     id: 'project-chat',
 *   });
 *
 *   // Switch projects via the imperative API later:
 *   bundle.widgets.AIBuilderChat.get('project-chat').setProject('billing-portal');
 *
 * @param {HTMLElement|ArrayLike<HTMLElement>} container Either a DOM element
 *   or an array-like whose first entry is one (e.g. `K('content[...]').element()`).
 * @param {Object} config All fields:
 * @param {string} config.endpoint **Required.** Full URL of the companion
 *   service `/chat/stream` endpoint. Typically read from a kapp attribute
 *   like `kapp('attribute:Companion Service URL')`.
 * @param {string} [config.userIdentifier] Username of the current user.
 *   Sent with every request and stored on conversation/project records.
 *   Defaults to `'anonymous'`.
 * @param {string} [config.storageKappSlug] Kapp slug where the AI Builder
 *   `ai-builder-conversations` and `ai-builder-projects` forms live. Sent
 *   with every request as `storage_kapp_slug`. Form code typically reads
 *   this from a kapp attribute (e.g. `Data Storage Kapp Slug`), falling
 *   back to the current kapp's slug. When omitted, the companion service
 *   uses its env var fallback (intended for desktop/curl testing).
 * @param {string} [config.projectSlug] Project slug to load on conversation
 *   start. When set, the companion service injects that project's memory
 *   into the system prompt. Can be changed later via the `setProject` API.
 * @param {string} [config.conversationId] Resume a specific past conversation
 *   by id. When omitted, a new conversation is started on first send.
 * @param {string} [config.initialModel] Pre-set the model used for the first
 *   turn. When omitted, the widget fetches the configured default from the
 *   companion service `/settings` on mount. Resuming a stored conversation
 *   overrides this with the conversation's `Last Model Used` value.
 * @param {string} [config.placeholder] Input placeholder text. Default:
 *   `'Type a message — Cmd/Ctrl+Enter to send'`.
 * @param {string} [config.height] One of `'sm'`, `'md'` (default), `'lg'`,
 *   `'full'`, or any custom Tailwind height class. The widget fills its
 *   container; the height class scopes the messages region's max height.
 * @param {boolean} [config.showUsage] When true (default), shows a small
 *   token-usage pill in the header reflecting the cumulative spend on the
 *   current conversation.
 * @param {boolean} [config.showModel] When true (default), shows a model
 *   selector dropdown in the header. The user picks from `available_models`
 *   fetched from the companion service `/settings`; the choice applies to
 *   future turns in this conversation only and persists via `Last Model Used`.
 * @param {Function} [config.onSent] Called with the user's message text
 *   when they hit Send. Useful for analytics or wiring to other widgets.
 * @param {Function} [config.onComplete] Called with the final `done` event
 *   payload (`{ conversation_id, iterations, tools_used, usage,
 *   cumulative_usage, stop_reason, reply }`) when the assistant finishes.
 * @param {string} [id] Optional id used by registerWidget for instance
 *   tracking. Use it to retrieve the API later: `bundle.widgets.AIBuilderChat.get(id)`.
 *
 * **Imperative API** (via `bundle.widgets.AIBuilderChat.get(id)`):
 *   - `send(text)` — Send a message programmatically.
 *   - `clear()` — Abort any in-flight request, drop messages, start fresh
 *     (new conversation_id on next send).
 *   - `setProject(slug)` — Switch the active project_slug. Future sends
 *     will load that project's memory.
 *   - `setModel(modelId)` — Change the model for future turns in this
 *     conversation. Persists via the conversation's `Last Model Used` field.
 *   - `getModel()` — Returns the current model id.
 *   - `getAvailableModels()` — Returns the list of available models last
 *     fetched from `/settings` (each `{ id, display_name, created_at }`).
 *   - `getConversationId()` — Returns the current conversation_id or null.
 *   - `getCumulativeUsage()` — Returns the latest cumulative usage object
 *     from the most recent `done` event.
 *   - `abort()` — Abort an in-flight stream (the partial response stays
 *     in the message list; the conversation is NOT saved).
 *   - `destroy()` — Standard registerWidget cleanup.
 */
export const AIBuilderChat = ({ container, config = {}, id } = {}) => {
  const resolved = resolveContainer(container, 'AIBuilderChat');
  if (resolved && validateConfig(config)) {
    return registerWidget(AIBuilderChat, {
      container: resolved,
      Component: AIBuilderChatComponent,
      props: { id, config },
      id,
    });
  }
  return Promise.reject(
    'The AIBuilderChat widget parameters are invalid. See the console for more details.',
  );
};
