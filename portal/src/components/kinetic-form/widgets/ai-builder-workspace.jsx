import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  IconArrowLeft,
  IconArrowsExchange,
  IconPlus,
  IconRefresh,
  IconX,
} from '@tabler/icons-react';
import { registerWidget, resolveContainer, WidgetAPI } from './index.js';

const ORPHAN_PROJECT_KEY = '__none__';
const ORPHAN_PROJECT_LABEL = 'No project (generic)';

// Format an ISO datetime as a short relative phrase ("2h ago", "3 days ago",
// "yesterday"). Falls back to an absolute date past one week.
const formatRelative = iso => {
  if (!iso) return '';
  const then = new Date(iso);
  if (isNaN(then.getTime())) return iso;
  const diffMs = Date.now() - then.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day === 1) return 'yesterday';
  if (day < 7) return `${day} days ago`;
  return then.toLocaleDateString();
};

const formatTokens = u => {
  if (!u) return '';
  const fmt = n =>
    (n || 0) >= 1000
      ? `${((n || 0) / 1000).toFixed(1).replace(/\.0$/, '')}k`
      : String(n || 0);
  return `${fmt(u.input_tokens)} in / ${fmt(u.output_tokens)} out`;
};

// Derive the /projects, /conversations, /settings URLs from the chat/stream
// endpoint. Same pattern AIBuilderSettings uses — one config value covers
// all routes.
const buildUrls = endpoint => {
  const base = endpoint.replace(/\/chat\/stream\/?$/, '');
  return {
    projects: `${base}/projects`,
    conversations: `${base}/conversations`,
    conversation: id => `${base}/conversations/${encodeURIComponent(id)}`,
    chatStream: endpoint,
  };
};

const AIBuilderWorkspaceContent = ({ id, config, apiRef }) => {
  const {
    endpoint,
    userIdentifier = 'anonymous',
    storageKappSlug,
    initialProjectSlug,
    initialConversationId,
    customCreateProject = false,
    chatConfig = {},
    height = 'lg',
  } = config;

  const urls = useRef(buildUrls(endpoint));

  // View mode: 'picker' (selecting) or 'chat' (engaged with a conversation)
  const [view, setView] = useState(
    initialConversationId ? 'chat' : 'picker',
  );

  // Project list + selected project
  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState(null);
  const [selectedProjectSlug, setSelectedProjectSlug] = useState(
    initialProjectSlug || null,
  );

  // Conversation list for the selected project
  const [conversations, setConversations] = useState([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [conversationsError, setConversationsError] = useState(null);
  const [conversationFilter, setConversationFilter] = useState('');

  // Active conversation in chat view
  const [activeConversation, setActiveConversation] = useState(
    initialConversationId
      ? { conversation_id: initialConversationId, title: '' }
      : null,
  );

  // Inline new-project form state
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [newProjectError, setNewProjectError] = useState(null);
  const [creatingInFlight, setCreatingInFlight] = useState(false);

  // Row-level "move to project" UI state. When set, the matching row in the
  // picker swaps its meta line for an inline project select.
  const [movingConversationId, setMovingConversationId] = useState(null);
  // Async lock so a chat-header link change doesn't double-fire.
  const [linkInFlight, setLinkInFlight] = useState(false);

  // Container for the embedded chat widget
  const chatContainerRef = useRef(null);
  const chatWidgetIdRef = useRef(`${id || 'workspace'}-chat`);
  const chatApiRef = useRef(null);

  const heightClass =
    height === 'sm'
      ? 'h-96'
      : height === 'md'
      ? 'h-[32rem]'
      : height === 'full'
      ? 'h-full'
      : height === 'lg'
      ? 'h-[40rem]'
      : height;

  const loadProjects = useCallback(async () => {
    setProjectsLoading(true);
    setProjectsError(null);
    try {
      const params = new URLSearchParams();
      if (storageKappSlug) params.set('storage_kapp_slug', storageKappSlug);
      const url = `${urls.current.projects}?${params.toString()}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setProjects(data.projects || []);
    } catch (err) {
      setProjectsError(err.message);
      setProjects([]);
    } finally {
      setProjectsLoading(false);
    }
  }, [storageKappSlug]);

  const loadConversations = useCallback(
    async projectSlug => {
      setConversationsLoading(true);
      setConversationsError(null);
      try {
        const params = new URLSearchParams();
        if (storageKappSlug) params.set('storage_kapp_slug', storageKappSlug);
        if (projectSlug === ORPHAN_PROJECT_KEY) {
          params.set('project_slug', '__none__');
        } else if (projectSlug) {
          params.set('project_slug', projectSlug);
        }
        const url = `${urls.current.conversations}?${params.toString()}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        setConversations(data.conversations || []);
      } catch (err) {
        setConversationsError(err.message);
        setConversations([]);
      } finally {
        setConversationsLoading(false);
      }
    },
    [storageKappSlug],
  );

  // Link or unlink a conversation. `targetSlug === null` (or the orphan
  // sentinel) unlinks. Returns the updated conversation summary on success
  // or null on failure (and logs).
  //
  // When the conversation in question is the active chat, also pushes the
  // change down to the embedded AIBuilderChat via setProject so subsequent
  // messages send the right project_slug.
  const linkConversationToProject = useCallback(
    async (conversationId, targetSlug) => {
      if (!conversationId) return null;
      const isUnlink = targetSlug == null || targetSlug === ORPHAN_PROJECT_KEY;
      const body = {
        project_slug: isUnlink ? '' : targetSlug,
      };
      if (storageKappSlug) body.storage_kapp_slug = storageKappSlug;
      setLinkInFlight(true);
      try {
        const resp = await fetch(urls.current.conversation(conversationId), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await resp.json();
        if (!resp.ok) {
          throw new Error(data?.error || `HTTP ${resp.status}`);
        }
        // If we're moving the active conversation, sync the embedded chat's
        // project state too so the next /chat call uses the right project,
        // and update the workspace's selectedProjectSlug so the header strip
        // and the "back" navigation reflect the new home.
        if (activeConversation?.conversation_id === conversationId) {
          if (chatApiRef.current) {
            try {
              chatApiRef.current.setProject?.(isUnlink ? null : targetSlug);
            } catch (err) {
              console.warn(
                'AIBuilderWorkspace: chat.setProject after link raised',
                err,
              );
            }
          }
          setSelectedProjectSlug(isUnlink ? ORPHAN_PROJECT_KEY : targetSlug);
        }
        return data;
      } catch (err) {
        console.warn('AIBuilderWorkspace: link failed', err);
        return null;
      } finally {
        setLinkInFlight(false);
      }
    },
    [storageKappSlug, activeConversation?.conversation_id],
  );

  // Initial load — projects always; conversations if a project is preselected.
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (selectedProjectSlug) {
      loadConversations(selectedProjectSlug);
    } else {
      setConversations([]);
    }
  }, [selectedProjectSlug, loadConversations]);

  // Mount/unmount the embedded AIBuilderChat as we move between views.
  useEffect(() => {
    if (view !== 'chat') return undefined;
    if (!chatContainerRef.current) return undefined;
    if (typeof window === 'undefined') return undefined;
    if (!window.bundle?.widgets?.AIBuilderChat) {
      console.error(
        'AIBuilderWorkspace: bundle.widgets.AIBuilderChat is not available. ' +
          'Make sure widgets.js has registered AIBuilderChat before this widget mounts.',
      );
      return undefined;
    }

    const chatId = chatWidgetIdRef.current;
    const isResume = activeConversation && activeConversation.conversation_id;
    const chatPromise = window.bundle.widgets.AIBuilderChat({
      container: chatContainerRef.current,
      id: chatId,
      config: {
        endpoint,
        userIdentifier,
        storageKappSlug,
        projectSlug:
          selectedProjectSlug && selectedProjectSlug !== ORPHAN_PROJECT_KEY
            ? selectedProjectSlug
            : undefined,
        conversationId: isResume ? activeConversation.conversation_id : undefined,
        height: 'full',
        ...chatConfig,
      },
    });

    let cancelled = false;
    chatPromise.then(api => {
      if (cancelled) {
        try {
          api?.destroy?.();
        } catch {
          /* ignore */
        }
        return;
      }
      chatApiRef.current = api;
      // Passing `conversationId` in config sets the id state on the chat
      // widget but does NOT auto-load the message history — the widget only
      // replays messages when `loadConversation()` is called explicitly.
      // So whenever we have an id (resuming an existing conversation), we
      // call loadConversation here regardless of whether we already know
      // the title.
      if (isResume && typeof api?.loadConversation === 'function') {
        api
          .loadConversation(activeConversation.conversation_id)
          .then(ok => {
            if (!ok) {
              console.warn(
                `AIBuilderWorkspace: failed to load conversation ${activeConversation.conversation_id}`,
              );
            }
          })
          .catch(err => {
            console.warn('AIBuilderWorkspace: loadConversation threw', err);
          });
      }
    });

    return () => {
      cancelled = true;
      // Capture and clear the ref first so any concurrent path doesn't see
      // a half-destroyed instance.
      const apiToDestroy = chatApiRef.current;
      chatApiRef.current = null;
      try {
        apiToDestroy?.destroy?.();
      } catch (err) {
        // Defensive — a destroy during unmount can race with the
        // MutationObserver-driven auto-cleanup in widgets/index.js.
        console.warn('AIBuilderWorkspace: chat destroy raised', err);
      }
    };
    // We deliberately don't depend on `chatConfig` — it's a config blob, not
    // expected to change after mount. Same for endpoint, storageKappSlug, etc.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, activeConversation?.conversation_id]);

  const handleSelectProject = slug => {
    setSelectedProjectSlug(slug);
    setActiveConversation(null);
    setConversationFilter('');
  };

  const handleSelectConversation = conv => {
    setActiveConversation({
      conversation_id: conv.conversation_id,
      title: conv.title,
    });
    setView('chat');
  };

  const handleNewChat = () => {
    setActiveConversation({ conversation_id: null, title: '' });
    setView('chat');
  };

  // Tear down the embedded chat synchronously, before any React state change
  // that would re-render and remove the chat's container from the DOM.
  // The global MutationObserver in `widgets/index.js` watches document.body
  // for child removal and synchronously unmounts the orphaned chat root
  // when it fires — but if that fires during React's render/commit phase
  // (because React is the one removing our chat-view subtree), we get the
  // "Attempted to synchronously unmount a root while React was already
  // rendering" warning. By destroying first, we delete the chat's registry
  // entry so the observer no-ops on our container when it eventually fires.
  const teardownChat = () => {
    const apiToDestroy = chatApiRef.current;
    chatApiRef.current = null;
    try {
      apiToDestroy?.destroy?.();
    } catch (err) {
      console.warn('AIBuilderWorkspace: chat destroy raised', err);
    }
  };

  const handleBackToPicker = () => {
    teardownChat();
    setView('picker');
    setActiveConversation(null);
    if (selectedProjectSlug) {
      loadConversations(selectedProjectSlug);
    }
  };

  const handleNewProjectClick = () => {
    if (customCreateProject) {
      window.dispatchEvent(
        new CustomEvent('ai-builder-new-project', {
          detail: { widget: 'AIBuilderWorkspace', id },
        }),
      );
      return;
    }
    // Reset the project selection so the user is focused on the create form
    // — leaving the previous project selected (with its conversation list
    // and description below) is visual clutter.
    setSelectedProjectSlug(null);
    setActiveConversation(null);
    setConversationFilter('');
    setCreatingProject(true);
    setNewProjectName('');
    setNewProjectDescription('');
    setNewProjectError(null);
  };

  const handleCreateProjectSubmit = async () => {
    const name = newProjectName.trim();
    if (!name) {
      setNewProjectError('Name is required.');
      return;
    }
    setCreatingInFlight(true);
    setNewProjectError(null);
    try {
      const resp = await fetch(urls.current.projects, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: newProjectDescription.trim(),
          user_identifier: userIdentifier,
          storage_kapp_slug: storageKappSlug,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data?.error || `HTTP ${resp.status}`);
      }
      // Refresh projects, select the new one, ready for new chat.
      await loadProjects();
      setSelectedProjectSlug(data.project_slug);
      setCreatingProject(false);
    } catch (err) {
      setNewProjectError(err.message);
    } finally {
      setCreatingInFlight(false);
    }
  };

  // Derived: conversation list filtered by title substring (client-side)
  const filteredConversations = conversationFilter.trim()
    ? conversations.filter(c =>
        (c.title || '')
          .toLowerCase()
          .includes(conversationFilter.toLowerCase()),
      )
    : conversations;

  // Derived: the selected project's metadata (for header/description display)
  const selectedProject =
    selectedProjectSlug === ORPHAN_PROJECT_KEY
      ? { project_slug: ORPHAN_PROJECT_KEY, name: ORPHAN_PROJECT_LABEL }
      : projects.find(p => p.project_slug === selectedProjectSlug) || null;

  // ----- Imperative API exposed to form code -----
  // The handlers we expose (handleBackToPicker, handleSelectProject, etc.)
  // are defined inline in the component body and get fresh identities each
  // render — including them as deps would just churn for no benefit, since
  // we're reassigning the same method names onto the existing api object
  // each time. The `apiRef` ref itself never changes identity. This effect
  // intentionally re-runs on the state values that affect the API's return
  // values; the rule's exhaustive-deps check is a false positive here.
  useEffect(() => {
    Object.assign(apiRef.current, {
      getView: () => view,
      getProjects: () => projects.slice(),
      getConversations: () => conversations.slice(),
      getSelectedProjectSlug: () => selectedProjectSlug,
      getActiveConversationId: () =>
        activeConversation?.conversation_id || null,
      getChatApi: () => chatApiRef.current,
      selectProject: slug => handleSelectProject(slug),
      newChat: () => handleNewChat(),
      backToPicker: () => handleBackToPicker(),
      refreshProjects: () => loadProjects(),
      refreshConversations: () =>
        selectedProjectSlug
          ? loadConversations(selectedProjectSlug)
          : Promise.resolve(),
      linkConversationToProject: (conversationId, targetSlug) =>
        linkConversationToProject(conversationId, targetSlug),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    view,
    projects,
    conversations,
    selectedProjectSlug,
    activeConversation?.conversation_id,
    loadProjects,
    loadConversations,
    linkConversationToProject,
  ]);

  // ============== RENDER ==============

  if (view === 'chat') {
    const projectLabel = selectedProject
      ? selectedProject.name
      : selectedProjectSlug === ORPHAN_PROJECT_KEY
      ? ORPHAN_PROJECT_LABEL
      : null;
    const titleLabel = activeConversation?.title || 'New conversation';
    return (
      <div
        className={clsx(
          'flex flex-col rounded-lg border border-base-300 bg-base-100 overflow-hidden',
          heightClass,
        )}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-base-300 text-sm">
          <button
            type="button"
            className="kbtn kbtn-ghost kbtn-xs"
            onClick={handleBackToPicker}
            title="Back to projects and conversations"
          >
            <IconArrowLeft size={14} />
            <span className="ml-1">Change</span>
          </button>
          <div className="flex-1 min-w-0 flex items-center gap-2">
            {projectLabel && (
              <span className="font-medium truncate">{projectLabel}</span>
            )}
            {projectLabel && (
              <span className="text-base-content/40">·</span>
            )}
            <span className="text-base-content/70 truncate">{titleLabel}</span>
          </div>
          {/* Link / move the active conversation to a different project. */}
          {activeConversation?.conversation_id && (
            <select
              className="kselect kselect-bordered kselect-xs max-w-[10rem]"
              title="Link or move this conversation to a different project"
              value={
                selectedProjectSlug === ORPHAN_PROJECT_KEY
                  ? ORPHAN_PROJECT_KEY
                  : selectedProjectSlug || ''
              }
              disabled={linkInFlight}
              onChange={async e => {
                const target = e.target.value;
                if (!target) return;
                await linkConversationToProject(
                  activeConversation.conversation_id,
                  target === ORPHAN_PROJECT_KEY ? null : target,
                );
              }}
            >
              {projects.map(p => (
                <option key={p.project_slug} value={p.project_slug}>
                  {p.name}
                </option>
              ))}
              <option value={ORPHAN_PROJECT_KEY}>{ORPHAN_PROJECT_LABEL}</option>
            </select>
          )}
        </div>
        <div ref={chatContainerRef} className="flex-1 min-h-0" />
      </div>
    );
  }

  // -------- Picker view --------
  return (
    <div
      className={clsx(
        'flex flex-col rounded-lg border border-base-300 bg-base-100 overflow-hidden',
        heightClass,
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-base-300 text-sm">
        <div className="font-medium">AI Builder Workspace</div>
        <button
          type="button"
          className="kbtn kbtn-ghost kbtn-xs"
          onClick={loadProjects}
          title="Refresh project list"
          disabled={projectsLoading}
        >
          <IconRefresh size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {/* Project picker row */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <label
              className="text-sm text-base-content/70 whitespace-nowrap"
              htmlFor={`${id || 'workspace'}-project`}
            >
              Project
            </label>
            <select
              id={`${id || 'workspace'}-project`}
              className="kselect kselect-bordered kselect-sm flex-1 min-w-0"
              value={selectedProjectSlug || ''}
              disabled={projectsLoading}
              onChange={e => handleSelectProject(e.target.value || null)}
            >
              <option value="">— select a project —</option>
              {projects.map(p => (
                <option key={p.project_slug} value={p.project_slug}>
                  {p.name} ({p.project_slug})
                </option>
              ))}
              <option value={ORPHAN_PROJECT_KEY}>{ORPHAN_PROJECT_LABEL}</option>
            </select>
            <button
              type="button"
              className="kbtn kbtn-sm kbtn-ghost"
              onClick={handleNewProjectClick}
              disabled={creatingProject || creatingInFlight}
              title="Create a new project"
            >
              <IconPlus size={14} />
              <span className="ml-1">New project</span>
            </button>
          </div>

          {projectsError && (
            <div className="text-xs text-error">
              Could not load projects: {projectsError}
            </div>
          )}

          {selectedProject?.description && (
            <div className="text-xs text-base-content/60 mt-2 pt-2 border-t border-base-300">
              {selectedProject.description}
            </div>
          )}
        </div>

        {/* Inline new-project form */}
        {creatingProject && (
          <div className="border border-base-300 rounded-md p-3 flex flex-col gap-2 bg-base-200/50">
            <div className="text-sm font-medium">New project</div>
            <input
              type="text"
              className="kinput kinput-bordered kinput-sm w-full"
              placeholder="Project name"
              value={newProjectName}
              onChange={e => setNewProjectName(e.target.value)}
              disabled={creatingInFlight}
            />
            <textarea
              className="ktextarea ktextarea-bordered ktextarea-sm w-full"
              placeholder="Description (optional)"
              rows={2}
              value={newProjectDescription}
              onChange={e => setNewProjectDescription(e.target.value)}
              disabled={creatingInFlight}
            />
            {newProjectError && (
              <div className="text-xs text-error">{newProjectError}</div>
            )}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                className="kbtn kbtn-sm kbtn-ghost"
                onClick={() => setCreatingProject(false)}
                disabled={creatingInFlight}
              >
                Cancel
              </button>
              <button
                type="button"
                className="kbtn kbtn-sm kbtn-primary"
                onClick={handleCreateProjectSubmit}
                disabled={creatingInFlight || !newProjectName.trim()}
              >
                {creatingInFlight ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        )}

        {/* Conversation list */}
        {selectedProjectSlug && (
          <div className="flex flex-col gap-2 flex-1 min-h-0">
            <div className="flex items-center gap-2">
              <div className="text-xs uppercase tracking-wide text-base-content/50 flex-1">
                Conversations
              </div>
              <input
                type="text"
                className="kinput kinput-bordered kinput-xs w-40"
                placeholder="Filter…"
                value={conversationFilter}
                onChange={e => setConversationFilter(e.target.value)}
              />
            </div>

            {conversationsError && (
              <div className="text-xs text-error">
                Could not load conversations: {conversationsError}
              </div>
            )}

            <div className="flex flex-col gap-1 overflow-y-auto flex-1">
              {conversationsLoading && (
                <div className="text-sm text-base-content/50 text-center py-4">
                  Loading…
                </div>
              )}

              {!conversationsLoading && filteredConversations.length === 0 && (
                <div className="text-sm text-base-content/50 text-center py-4">
                  {conversations.length === 0
                    ? 'No conversations yet — start a new chat below.'
                    : 'No conversations match the filter.'}
                </div>
              )}

              {filteredConversations.map(c => {
                const isMoving = movingConversationId === c.conversation_id;
                return (
                  <div
                    key={c.conversation_id}
                    className="rounded-md border border-base-300 hover:border-primary hover:bg-base-200 transition-colors flex items-stretch"
                  >
                    <button
                      type="button"
                      className="flex-1 min-w-0 text-left px-3 py-2"
                      onClick={() => handleSelectConversation(c)}
                    >
                      <div className="font-medium truncate">
                        {c.title || '(untitled)'}
                      </div>
                      {isMoving ? (
                        <div className="text-xs text-base-content/60 mt-1 flex items-center gap-2">
                          <span>Move to:</span>
                          <select
                            className="kselect kselect-bordered kselect-xs flex-1 min-w-0"
                            disabled={linkInFlight}
                            // Prevent row-click open while interacting with the select.
                            onClick={ev => ev.stopPropagation()}
                            defaultValue={c.project_slug || ORPHAN_PROJECT_KEY}
                            onChange={async ev => {
                              ev.stopPropagation();
                              const target = ev.target.value;
                              const result = await linkConversationToProject(
                                c.conversation_id,
                                target === ORPHAN_PROJECT_KEY ? null : target,
                              );
                              setMovingConversationId(null);
                              if (result && selectedProjectSlug) {
                                loadConversations(selectedProjectSlug);
                              }
                            }}
                          >
                            {projects.map(p => (
                              <option key={p.project_slug} value={p.project_slug}>
                                {p.name}
                              </option>
                            ))}
                            <option value={ORPHAN_PROJECT_KEY}>
                              {ORPHAN_PROJECT_LABEL}
                            </option>
                          </select>
                        </div>
                      ) : (
                        <div className="text-xs text-base-content/60 flex items-center gap-2 flex-wrap">
                          <span>{c.user_identifier || 'anonymous'}</span>
                          <span>·</span>
                          <span>{formatRelative(c.last_active_at)}</span>
                          <span>·</span>
                          <span className="font-mono">{formatTokens(c.usage)}</span>
                          {c.last_model_used && (
                            <>
                              <span>·</span>
                              <span className="font-mono">{c.last_model_used}</span>
                            </>
                          )}
                        </div>
                      )}
                    </button>
                    <button
                      type="button"
                      className="kbtn kbtn-ghost kbtn-xs self-center mr-2"
                      title={isMoving ? 'Cancel move' : 'Move to a different project'}
                      onClick={ev => {
                        ev.stopPropagation();
                        setMovingConversationId(isMoving ? null : c.conversation_id);
                      }}
                    >
                      {isMoving ? <IconX size={14} /> : <IconArrowsExchange size={14} />}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-2 border-t border-base-300">
              <button
                type="button"
                className="kbtn kbtn-primary kbtn-sm"
                onClick={handleNewChat}
              >
                <IconPlus size={14} />
                <span className="ml-1">New chat</span>
              </button>
            </div>
          </div>
        )}

        {!selectedProjectSlug && (
          <div className="text-sm text-base-content/50 text-center py-8">
            Select a project to see its conversations, or create a new one.
            Choose <em>{ORPHAN_PROJECT_LABEL}</em> for a generic chat not tied
            to any project.
          </div>
        )}
      </div>
    </div>
  );
};

const AIBuilderWorkspaceComponent = forwardRef(({ id, config }, ref) => {
  const api = useRef({});
  return (
    <WidgetAPI ref={ref} api={api.current}>
      <AIBuilderWorkspaceContent id={id} config={config} apiRef={api} />
    </WidgetAPI>
  );
});

const validateConfig = (config = {}) => {
  if (typeof config.endpoint !== 'string' || !config.endpoint) {
    console.error(
      'AIBuilderWorkspace Widget Error: endpoint is required and must be a non-empty string.',
    );
    return false;
  }
  if (config.userIdentifier != null && typeof config.userIdentifier !== 'string') {
    console.error('AIBuilderWorkspace Widget Error: userIdentifier must be a string.');
    return false;
  }
  if (config.storageKappSlug != null && typeof config.storageKappSlug !== 'string') {
    console.error('AIBuilderWorkspace Widget Error: storageKappSlug must be a string.');
    return false;
  }
  if (config.initialProjectSlug != null && typeof config.initialProjectSlug !== 'string') {
    console.error('AIBuilderWorkspace Widget Error: initialProjectSlug must be a string.');
    return false;
  }
  if (config.initialConversationId != null && typeof config.initialConversationId !== 'string') {
    console.error('AIBuilderWorkspace Widget Error: initialConversationId must be a string.');
    return false;
  }
  if (config.customCreateProject != null && typeof config.customCreateProject !== 'boolean') {
    console.error('AIBuilderWorkspace Widget Error: customCreateProject must be a boolean.');
    return false;
  }
  if (config.chatConfig != null && typeof config.chatConfig !== 'object') {
    console.error('AIBuilderWorkspace Widget Error: chatConfig must be an object.');
    return false;
  }
  return true;
};

/**
 * AIBuilderWorkspace — top-level out-of-box wrapper for the AI Builder
 * Assistant. Composes a project picker, conversation list, and embedded
 * `AIBuilderChat` into a single drop-in surface for form designers who don't
 * want to build their own selection UI.
 *
 * **AIBuilderSettings is intentionally NOT included.** Settings (API key,
 * model, max_tokens, max_iterations) live on a separate form, often with
 * different (admin-only) permissions. Wire that widget separately.
 *
 * Two views:
 * - Picker — project dropdown + conversation list + new-chat / new-project buttons
 * - Chat — collapsed "Project · Title" header strip with a "Change" button,
 *   embedded `AIBuilderChat` below
 *
 * The widget auto-collapses into chat view when a conversation is selected
 * or a new chat is started; the "Change" button returns to the picker.
 *
 * @param {Object} [opts]
 * @param {HTMLElement|ArrayLike} opts.container Container element (or array-like
 *   wrapper from `K('content[...]').element()`).
 * @param {Object} opts.config
 * @param {string} opts.config.endpoint **Required.** Companion service
 *   `/chat/stream` URL. The widget derives `/projects` and `/conversations`
 *   by stripping the suffix.
 * @param {string} [opts.config.userIdentifier] Username of the current user.
 *   Sent with chat requests and used as the default owner when creating new
 *   projects. Defaults to `'anonymous'`.
 * @param {string} [opts.config.storageKappSlug] Kapp slug where the AI Builder
 *   storage forms live. Forwarded to all backend calls.
 * @param {string} [opts.config.initialProjectSlug] Pre-select a project on
 *   mount. Use `'__none__'` for the orphan/generic bucket.
 * @param {string} [opts.config.initialConversationId] Skip the picker and
 *   open straight to a conversation. The widget calls
 *   `AIBuilderChat.loadConversation(...)` to populate it.
 * @param {boolean} [opts.config.customCreateProject] When `true`, the inline
 *   new-project form is suppressed and clicking "New project" dispatches a
 *   `'ai-builder-new-project'` window event instead. Form code listens with
 *   `bundle.utils.onWidgetEvent('ai-builder-new-project', ...)` and handles
 *   the create UI itself — useful for opening the actual project storage form
 *   in a modal via `bundle.utils.openModal`. Default: `false`.
 * @param {Object} [opts.config.chatConfig] Extra config forwarded to the
 *   embedded `AIBuilderChat` (e.g. `{ showUsage: false, showModel: false }`).
 *   `endpoint`, `userIdentifier`, `storageKappSlug`, `projectSlug`, and
 *   `conversationId` are managed by the workspace and cannot be overridden here.
 * @param {string} [opts.config.height] One of `'sm'`, `'md'`, `'lg'` (default),
 *   `'full'`, or any custom Tailwind height class.
 * @param {string} [opts.id] Optional id for `bundle.widgets.AIBuilderWorkspace.get(id)`.
 *
 * **Imperative API:**
 *   - `getView()` — Returns `'picker'` or `'chat'`.
 *   - `getSelectedProjectSlug()` — Returns the current project slug or `null`.
 *   - `getActiveConversationId()` — Returns the current conversation id or `null`.
 *   - `getChatApi()` — Returns the embedded `AIBuilderChat`'s API (or `null`
 *     when in picker view). Use this to programmatically send messages, etc.
 *   - `getProjects()` — Returns the last-loaded project list.
 *   - `getConversations()` — Returns the last-loaded conversation list.
 *   - `selectProject(slug)` — Switch to a different project (still in picker view).
 *   - `newChat()` — Start a new conversation in the currently selected project.
 *   - `backToPicker()` — Return to the picker view from chat view.
 *   - `refreshProjects()` — Re-fetch the project list.
 *   - `refreshConversations()` — Re-fetch the conversation list for the
 *     currently selected project.
 *   - `linkConversationToProject(conversationId, targetSlug)` — Link the given
 *     conversation to a project, or unlink it (pass `null` or the orphan key
 *     `'__none__'`). Resolves to the updated conversation summary on success
 *     or `null` on failure.
 *   - `destroy()` — Standard registerWidget cleanup.
 */
export const AIBuilderWorkspace = ({ container, config = {}, id } = {}) => {
  const resolved = resolveContainer(container, 'AIBuilderWorkspace');
  if (resolved && validateConfig(config)) {
    return registerWidget(AIBuilderWorkspace, {
      container: resolved,
      Component: AIBuilderWorkspaceComponent,
      props: { id, config },
      id,
    });
  }
  return Promise.reject(
    'The AIBuilderWorkspace widget parameters are invalid. See the console for more details.',
  );
};
