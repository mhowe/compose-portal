import { Fragment, forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Provider } from 'react-redux';
import clsx from 'clsx';
import {
  createTeam,
  deleteTeam,
  fetchTeams,
  updateTeam,
} from '@kineticdata/react';
import { registerWidget, resolveContainer, WidgetAPI } from './index.js';
import { store } from '../../../redux.js';
import { widgetActions } from '../../../helpers/state.js';
import { useBundleWidget } from '../../../helpers/widget-context.js';
import { openConfirm } from '../../../helpers/confirm.js';
import { toastError, toastSuccess } from '../../../helpers/toasts.js';
import { extractPolicyMessage } from './utils.js';
import { Icon } from '../../../atoms/Icon.jsx';

// Default classes for every styleable slot. Designers override via
// config.classNames[slot] — strings are additive, `{ add?, remove? }` allows
// surgical removal. See Profile's `cn` for the rationale.
const SLOT_DEFAULTS = {
  // Outer wrapper around breadcrumbs + header + list.
  container: 'flex-c-st gap-4 w-full',
  // Breadcrumbs row. Same vocabulary as Categories for consistency — `kd-`
  // prefixed classes provide stable CSS hooks for designers.
  breadcrumbs: 'kd-teams-breadcrumb flex-sc flex-wrap gap-1 text-sm text-base-content/70',
  // A breadcrumb crumb — both clickable ancestors and the current (last)
  // segment use this. The current segment layers `pointer-events-none
  // opacity-100` on top to non-interactively highlight it; designers can
  // restyle either case via `breadcrumbItem`. Matches Categories.
  breadcrumbItem: 'kd-teams-breadcrumb-item kbtn kbtn-ghost kbtn-xs',
  // The `/` between segments.
  breadcrumbSeparator: 'kd-teams-breadcrumb-separator opacity-50 px-1',
  // Header section showing the current team (or "Top-level teams" at root).
  header: 'flex-sc justify-between gap-2 items-start',
  headerMain: 'flex-c-st gap-1 flex-1 min-w-0',
  headerName: 'text-lg font-semibold text-base-content',
  headerDescription: 'text-sm text-base-content/60',
  headerActions: 'flex-sc gap-1 shrink-0',
  // Action button shared by header + each row.
  editButton: 'p-1 rounded hover:bg-base-200 text-base-content/70',
  deleteButton: 'p-1 rounded hover:bg-base-200 text-base-content/70',
  // Heading above the child / nested team list.
  listSection: 'text-sm font-semibold text-base-content/70',
  // "+ Add team" button.
  addButton: 'kbtn kbtn-primary kbtn-sm self-start',
  // Inline accordion panel (create or edit). Used in two places.
  panel: 'flex-c-st gap-3 p-3 rounded border border-base-300 bg-base-100',
  // Each input row inside a panel.
  field: 'field',
  label: '',
  input: '',
  textarea: '',
  // Save/Cancel row inside a panel.
  panelActions: 'flex-sc gap-2 self-end',
  panelSave: 'kbtn kbtn-primary kbtn-sm',
  panelCancel: 'kbtn kbtn-ghost kbtn-sm',
  list: 'flex-c-st gap-0 divide-y divide-base-200',
  listRow: 'flex-sc justify-between gap-2 py-2 px-1 cursor-pointer hover:bg-base-200/50 rounded',
  listRowMain: 'flex-c-st gap-0 flex-1 min-w-0',
  listRowName: 'text-base text-base-content truncate',
  listRowDescription: 'text-sm text-base-content/60 truncate',
  listRowActions: 'flex-sc gap-1 shrink-0',
  // Pre-render / empty / error states.
  loading: 'text-sm text-base-content/60',
  empty: 'text-sm text-base-content/60 italic',
  error: 'text-sm text-error',
};

const SLOT_NAMES = Object.keys(SLOT_DEFAULTS);

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const validateClassNames = (classNames, widgetName) => {
  if (classNames == null) return true;
  if (typeof classNames !== 'object' || Array.isArray(classNames)) {
    console.error(
      `${widgetName} Widget Error: config.classNames must be an object keyed by slot name.`,
    );
    return false;
  }
  for (const [slot, value] of Object.entries(classNames)) {
    if (!SLOT_NAMES.includes(slot)) {
      console.warn(
        `${widgetName} Widget Warning: config.classNames.${slot} is not a recognized slot (expected one of ${SLOT_NAMES.join(', ')}). The entry is ignored.`,
      );
      continue;
    }
    if (value == null) continue;
    if (typeof value === 'string') continue;
    if (typeof value === 'object' && !Array.isArray(value)) {
      if (value.add != null && typeof value.add !== 'string') {
        console.error(
          `${widgetName} Widget Error: config.classNames.${slot}.add must be a string when provided.`,
        );
        return false;
      }
      if (value.remove != null) {
        if (
          !Array.isArray(value.remove) ||
          !value.remove.every(s => typeof s === 'string')
        ) {
          console.error(
            `${widgetName} Widget Error: config.classNames.${slot}.remove must be an array of strings.`,
          );
          return false;
        }
      }
      continue;
    }
    console.error(
      `${widgetName} Widget Error: config.classNames.${slot} must be a string or { add?, remove? } object.`,
    );
    return false;
  }
  return true;
};

const validateConfig = (config = {}) => {
  const widgetName = 'Teams';
  if (config.parentName != null && typeof config.parentName !== 'string') {
    console.error(
      `${widgetName} Widget Error: config.parentName must be a string when provided.`,
    );
    return false;
  }
  if (config.parentName === '') {
    console.error(
      `${widgetName} Widget Error: config.parentName must be a non-empty string when provided. Omit it to show all top-level teams.`,
    );
    return false;
  }
  if (config.rootLabel != null && typeof config.rootLabel !== 'string') {
    console.error(
      `${widgetName} Widget Error: config.rootLabel must be a string when provided.`,
    );
    return false;
  }
  if (config.hidePrefix != null && typeof config.hidePrefix !== 'boolean') {
    console.error(
      `${widgetName} Widget Error: config.hidePrefix must be a boolean when provided.`,
    );
    return false;
  }
  if (
    config.parentSelectable != null &&
    typeof config.parentSelectable !== 'boolean'
  ) {
    console.error(
      `${widgetName} Widget Error: config.parentSelectable must be a boolean when provided.`,
    );
    return false;
  }
  if (config.parentSelectable && !config.parentName) {
    console.warn(
      `${widgetName} Widget Warning: config.parentSelectable has no effect without config.parentName. The setting is ignored.`,
    );
  }
  if (
    config.showDescription != null &&
    typeof config.showDescription !== 'boolean'
  ) {
    console.error(
      `${widgetName} Widget Error: config.showDescription must be a boolean when provided.`,
    );
    return false;
  }
  if (config.protect != null) {
    if (!Array.isArray(config.protect)) {
      console.error(
        `${widgetName} Widget Error: config.protect must be an array when provided.`,
      );
      return false;
    }
    for (const entry of config.protect) {
      if (typeof entry === 'string' || entry instanceof RegExp) continue;
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        if (
          typeof entry.match !== 'string' &&
          !(entry.match instanceof RegExp)
        ) {
          console.error(
            `${widgetName} Widget Error: object entries in config.protect must include a 'match' (string or RegExp).`,
          );
          return false;
        }
        if (entry.allowEdit != null && typeof entry.allowEdit !== 'boolean') {
          console.error(
            `${widgetName} Widget Error: 'allowEdit' on a config.protect entry must be a boolean when provided.`,
          );
          return false;
        }
        continue;
      }
      console.error(
        `${widgetName} Widget Error: every config.protect entry must be a string, a RegExp, or an object { match: string|RegExp, allowEdit?: boolean }.`,
      );
      return false;
    }
  }
  if (!validateClassNames(config.classNames, widgetName)) return false;
  return true;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Computes the "local" segment of a team name relative to a parent name.
// `'Role::App::services::Admin'` with parent `'Role::App::services'` → `'Admin'`.
// When parent is null/empty, returns the full name (root level).
const localSegment = (fullName, parentName) => {
  if (!parentName) return fullName;
  const sep = `${parentName}::`;
  if (fullName.startsWith(sep)) return fullName.slice(sep.length);
  return fullName;
};

// Returns the final `::`-separated segment of a team name, regardless of
// nesting depth. `'Role::App::services'` → `'services'`. Used to derive a
// breadcrumb root label from the configured prefix when `parentSelectable`
// is on.
const finalSegment = name => {
  if (!name) return '';
  const idx = name.lastIndexOf('::');
  return idx >= 0 ? name.slice(idx + 2) : name;
};

// Strips a configured prefix from a team name for display purposes when
// hidePrefix is on. Falls back to localSegment behavior when the prefix
// doesn't match (defensive — shouldn't happen since the server filtered
// by parentName, but safer than rendering blanks).
const displayName = (fullName, currentParentName, hidePrefix) => {
  if (!hidePrefix) return fullName;
  return localSegment(fullName, currentParentName);
};

// Returns `null` when the team is not protected, or `{ allowEdit }` when it
// matches a `protect` entry. Protected teams have the trash button hidden
// always; the pencil (edit) is hidden too unless the matching entry opted
// back in via `{ match, allowEdit: true }`.
//
// Matcher rules:
//
// - **String** matches by exact full-name equality, with one convenience:
//   when `parentName` is configured AND the entry doesn't already start
//   with `<parentName>::`, the entry is auto-prefixed. So `protect: ['Admin']`
//   with `parentName: 'Role::App::services'` matches the team named
//   `Role::App::services::Admin`. Designers who want to write full names
//   can do so; their entries pass through unchanged.
// - **RegExp** matches via `.test(fullName)` — designers chose the pattern
//   explicitly, so we don't second-guess what it should match.
// - **Object form** `{ match, allowEdit? }` wraps a string or RegExp matcher
//   and lets the designer opt back into edits on protected teams.
//
// Empty / missing list → never protected. Validator has already enforced
// the entry shapes, so the runtime check stays tight.
const isProtected = (fullName, protectList, parentName) => {
  if (!Array.isArray(protectList) || protectList.length === 0) return null;

  const matches = (matcher, allowEdit) => {
    if (typeof matcher === 'string') {
      const expanded =
        parentName &&
        matcher !== parentName &&
        !matcher.startsWith(`${parentName}::`)
          ? `${parentName}::${matcher}`
          : matcher;
      return expanded === fullName ? { allowEdit: !!allowEdit } : null;
    }
    if (matcher instanceof RegExp) {
      return matcher.test(fullName) ? { allowEdit: !!allowEdit } : null;
    }
    return null;
  };

  for (const entry of protectList) {
    if (typeof entry === 'string' || entry instanceof RegExp) {
      const result = matches(entry, false);
      if (result) return result;
    } else if (entry && typeof entry === 'object') {
      const result = matches(entry.match, entry.allowEdit);
      if (result) return result;
    }
  }
  return null;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const TeamsContent = ({ config = {}, id, apiRef }) => {
  // Slot-class helper, same shape as Attributes/Profile.
  const cn = (slot, ...extra) => {
    const base = clsx(SLOT_DEFAULTS[slot], ...extra);
    const override = config.classNames?.[slot];
    if (override == null) return base;
    if (typeof override === 'string') return clsx(base, override);
    const removeList = Array.isArray(override.remove) ? override.remove : null;
    const filtered =
      removeList && removeList.length > 0
        ? base
            .split(/\s+/)
            .filter(t => t && !removeList.includes(t))
            .join(' ')
        : base;
    return clsx(filtered, override.add);
  };

  const configuredPrefix = config.parentName || null;
  const parentSelectable = !!(config.parentSelectable && configuredPrefix);
  // Breadcrumb root label: when parentSelectable, default to the prefix's
  // final segment so the root visually IS the team you're inside. An
  // explicit config.rootLabel always wins.
  const rootLabel =
    config.rootLabel != null
      ? config.rootLabel
      : parentSelectable
        ? finalSegment(configuredPrefix)
        : 'Teams';
  const hidePrefix = config.hidePrefix !== false;
  const showDescription = config.showDescription !== false;
  const protectList = Array.isArray(config.protect) ? config.protect : null;

  // The prefix team's record, fetched on mount when parentSelectable is on.
  // Used for the root-level header (name + description) and for redux
  // selection so sibling widgets (TeamMembers) can target the prefix team.
  const [prefixTeam, setPrefixTeam] = useState(null);

  useEffect(() => {
    if (!parentSelectable) return;
    let cancelled = false;
    fetchTeams({ q: `name="${configuredPrefix}"`, limit: 1 }).then(response => {
      if (cancelled) return;
      const team = response?.teams?.[0];
      if (team) {
        setPrefixTeam({
          name: team.name,
          slug: team.slug,
          description: team.description || '',
        });
      } else {
        // Team not found / not accessible. Surface so the user knows.
        console.warn(
          `Teams Widget Warning: parentSelectable is on but the team "${configuredPrefix}" could not be loaded.`,
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [parentSelectable, configuredPrefix]);

  // pathBelow: breadcrumb segments BELOW the configured prefix (or root).
  // Empty array = user is at the prefix's children (or all top-level teams).
  // Each entry: { name, slug, description }.
  const [pathBelow, setPathBelow] = useState([]);

  // Current parent name used for the children query. Null/empty → fetch
  // top-level teams; otherwise → filter children of that team.
  //
  // When parentSelectable is on and the prefix team is loaded, we use the
  // *loaded* name rather than the config string — this way a rename of
  // the prefix team picks up automatically (the platform cascades the
  // children's parentName, so the query will find the same children
  // under the new name).
  const currentParentName = useMemo(() => {
    if (pathBelow.length > 0) return pathBelow[pathBelow.length - 1].name;
    if (parentSelectable && prefixTeam) return prefixTeam.name;
    return configuredPrefix;
  }, [pathBelow, parentSelectable, prefixTeam, configuredPrefix]);

  // The currently "selected" team — the bottom of pathBelow. When at root
  // level (pathBelow empty), falls through to the prefix team if
  // parentSelectable is on; otherwise null. Published to redux for sibling
  // widgets (TeamMembers, future Attributes target: 'current') to follow.
  const selectedTeam = useMemo(() => {
    if (pathBelow.length > 0) return pathBelow[pathBelow.length - 1];
    if (parentSelectable && prefixTeam) return prefixTeam;
    return null;
  }, [pathBelow, parentSelectable, prefixTeam]);

  // Child list state.
  const [list, setList] = useState({ loading: false, teams: [], error: null });

  // Inline edit accordion: slug of the row currently being edited, or
  // 'header' for the selected team in the header section. Null = closed.
  const [editing, setEditing] = useState(null);

  // Inline create accordion open/closed.
  const [creating, setCreating] = useState(false);

  // ----- Data fetch ------------------------------------------------------

  const refresh = useCallback(async () => {
    setList(prev => ({ ...prev, loading: true, error: null }));
    // KQL: parentName="" finds top-level teams (no `::`); parentName="X"
    // finds X's direct children. orderBy=name + indexed parentName.
    const q = currentParentName
      ? `parentName="${currentParentName}"`
      : 'parentName=""';
    const response = await fetchTeams({
      q,
      include: 'details',
      limit: 1000,
      orderBy: 'name',
      direction: 'ASC',
    });
    if (response?.error) {
      setList({
        loading: false,
        teams: [],
        error: response.error.message || 'Failed to load teams.',
      });
      return;
    }
    setList({
      loading: false,
      teams: Array.isArray(response.teams) ? response.teams : [],
      error: null,
    });
  }, [currentParentName]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ----- Redux selection sync + DOM event ------------------------------

  // Pull the widget's container DOM element so we can also dispatch a
  // CustomEvent for form-bundle code that prefers DOM events over redux.
  const widgetCtx = useBundleWidget();
  const container = widgetCtx?.container || null;

  useEffect(() => {
    const team = selectedTeam
      ? { name: selectedTeam.name, slug: selectedTeam.slug }
      : null;
    // Publish to redux when a widget id is configured.
    if (id) {
      if (team) widgetActions.setTeamSelection({ widgetId: id, team });
      else widgetActions.clearTeamSelection(id);
    }
    // Always fire a DOM CustomEvent so non-React form-bundle code can react
    // without needing the widget's id or a redux subscription. Event detail:
    //   { widgetId, team }   (team is `{ name, slug } | null`)
    if (container) {
      container.dispatchEvent(
        new CustomEvent('teams-selection-change', {
          detail: { widgetId: id, team },
        }),
      );
    }
  }, [id, selectedTeam, container]);

  // Clear on unmount so a closed Teams widget doesn't leave stale selection
  // sitting in redux for its consumers.
  useEffect(() => {
    return () => {
      if (id) widgetActions.clearTeamSelection(id);
    };
  }, [id]);

  // ----- Navigation ------------------------------------------------------

  // Descend into a team (clicked from the list).
  const descend = useCallback(team => {
    setPathBelow(prev => [
      ...prev,
      { name: team.name, slug: team.slug, description: team.description || '' },
    ]);
    setEditing(null);
    setCreating(false);
  }, []);

  // Click a breadcrumb segment — `index` is the pathBelow index to navigate
  // back to (so `pathBelow.slice(0, index + 1)`). `index === -1` returns to
  // the root view (prefix children or all top-level).
  const goToBreadcrumb = useCallback(index => {
    setPathBelow(prev => (index < 0 ? [] : prev.slice(0, index + 1)));
    setEditing(null);
    setCreating(false);
  }, []);

  // ----- Mutations -------------------------------------------------------

  // POST /teams with parentName-encoded name. Returns whether the operation
  // succeeded; surfacing toasts on either side.
  const performCreate = useCallback(
    async ({ name, description }) => {
      const trimmed = name.trim();
      if (!trimmed) {
        toastError({
          title: 'Create team failed.',
          description: 'Team name is required.',
        });
        return false;
      }
      // Prefix new name with the current path's full name; double-colon
      // separates it from the parent. With no current parent (root, no
      // configured prefix), the entered name IS the full name.
      const fullName = currentParentName
        ? `${currentParentName}::${trimmed}`
        : trimmed;
      const response = await createTeam({
        team: { name: fullName, description: description || '', attributesMap: {} },
      });
      if (response?.error) {
        toastError({
          title: 'Create team failed.',
          description:
            extractPolicyMessage(response.error) ||
            response.error.message ||
            'Please try again.',
        });
        return false;
      }
      toastSuccess({ title: `Team "${trimmed}" created.` });
      await refresh();
      return true;
    },
    [currentParentName, refresh],
  );

  // PUT /teams/{slug}. `updates` is `{ name?, description? }`. When name
  // changes, the platform cascades the new prefix to all descendants — no
  // manual fix-up needed (see kinetic-team-rename-cascade memory).
  const performUpdate = useCallback(
    async (team, updates) => {
      const body = {};
      if (updates.name != null) body.name = updates.name.trim();
      if (updates.description != null) body.description = updates.description;
      if (Object.keys(body).length === 0) return true;
      const response = await updateTeam({
        teamSlug: team.slug,
        team: body,
        include: 'details',
      });
      if (response?.error) {
        toastError({
          title: 'Update team failed.',
          description:
            extractPolicyMessage(response.error) ||
            response.error.message ||
            'Please try again.',
        });
        return false;
      }
      toastSuccess({ title: 'Team updated.' });
      // If we renamed the currently-selected team (or any ancestor in the
      // breadcrumb path), update pathBelow so future queries use the new
      // name. The server cascades child names automatically, so refreshing
      // the list picks up the new shape.
      if (body.name && body.name !== team.name) {
        const fresh = response.team;
        setPathBelow(prev =>
          prev.map(seg => {
            if (seg.slug === team.slug) {
              return { ...seg, name: fresh.name, slug: fresh.slug, description: fresh.description || seg.description };
            }
            // Descendants of the renamed team also get new names (and slugs,
            // since slug derives from name). They aren't in our local copy
            // with the new values yet — refresh after the path update.
            const sep = `${team.name}::`;
            if (seg.name.startsWith(sep)) {
              const newName = `${fresh.name}::${seg.name.slice(sep.length)}`;
              return { ...seg, name: newName, slug: null };
            }
            return seg;
          }),
        );
        // If the renamed team is the prefix team, update prefixTeam too so
        // the breadcrumb root, header, and currentParentName all reflect
        // the new name.
        setPrefixTeam(prev =>
          prev && prev.slug === team.slug
            ? {
                name: fresh.name,
                slug: fresh.slug,
                description: fresh.description || prev.description,
              }
            : prev,
        );
      } else if (response.team) {
        // Description-only update — refresh prefixTeam description so the
        // header reflects the new value immediately.
        setPrefixTeam(prev =>
          prev && prev.slug === team.slug
            ? { ...prev, description: response.team.description || '' }
            : prev,
        );
      }
      await refresh();
      return true;
    },
    [refresh],
  );

  // DELETE /teams/{slug}. Confirms first via the shared confirm modal.
  // The Kinetic platform cascades the delete to descendants — sub-teams and
  // their memberships go with the parent. This cannot be undone, so the
  // confirm message says so loudly. The security-policy check still has
  // final say; if the user isn't allowed, the 403 message is surfaced
  // verbatim.
  const performDelete = useCallback(
    team => {
      openConfirm({
        title: `Delete team "${localSegment(team.name, currentParentName)}"?`,
        description:
          'This deletes the team, all of its sub-teams (recursively), and every membership within them. This cannot be undone.',
        acceptLabel: 'Delete',
        accept: async () => {
          const response = await deleteTeam({ teamSlug: team.slug });
          if (response?.error) {
            toastError({
              title: 'Delete team failed.',
              description:
                extractPolicyMessage(response.error) ||
                response.error.message ||
                'Please try again.',
            });
            return;
          }
          toastSuccess({ title: 'Team deleted.' });
          // If we just deleted the currently-selected team, drop it from
          // the path (effectively "navigate up one") before refreshing.
          if (selectedTeam && selectedTeam.slug === team.slug) {
            setPathBelow(prev => prev.slice(0, -1));
          }
          // If we deleted the prefix team itself (only possible when
          // parentSelectable is on), clear that state — the widget is now
          // in a broken state (no prefix exists), and the refresh will
          // surface the error.
          if (prefixTeam && prefixTeam.slug === team.slug) {
            setPrefixTeam(null);
          }
          await refresh();
        },
      });
    },
    [currentParentName, refresh, selectedTeam, prefixTeam],
  );

  // ----- Imperative API --------------------------------------------------

  useEffect(() => {
    apiRef.current.refresh = refresh;
    apiRef.current.getSelectedTeam = () =>
      selectedTeam
        ? { name: selectedTeam.name, slug: selectedTeam.slug }
        : null;
    apiRef.current.getCurrentPath = () =>
      pathBelow.map((seg, i) => ({
        name: seg.name,
        slug: seg.slug,
        displayName: localSegment(
          seg.name,
          i === 0 ? configuredPrefix : pathBelow[i - 1].name,
        ),
      }));
    apiRef.current.navigateToRoot = () => {
      setPathBelow([]);
      setEditing(null);
      setCreating(false);
    };
    apiRef.current.navigateUp = (n = 1) => {
      if (n < 1) return;
      setPathBelow(prev => prev.slice(0, Math.max(0, prev.length - n)));
      setEditing(null);
      setCreating(false);
    };
  }, [apiRef, refresh, selectedTeam, pathBelow, configuredPrefix]);

  // ----- Render ----------------------------------------------------------

  // When parentSelectable is on and we're at root level, wait for the
  // prefix team to load before rendering the rest — otherwise the header
  // flashes the "Top-level teams" placeholder before settling on the
  // prefix team's name.
  if (parentSelectable && !prefixTeam && pathBelow.length === 0) {
    return (
      <div className={cn('container')}>
        <div className={cn('loading')}>Loading…</div>
      </div>
    );
  }

  return (
    <div className={cn('container')}>
      {renderBreadcrumbs({
        cn,
        configuredPrefix,
        rootLabel,
        pathBelow,
        goToBreadcrumb,
      })}

      {renderHeader({
        cn,
        selectedTeam,
        currentParentName,
        configuredPrefix,
        rootLabel,
        editing,
        setEditing,
        performUpdate,
        performDelete,
        protectList,
      })}

      <div>
        <div className={cn('listSection')}>
          {currentParentName ? 'Sub-teams' : 'Top-level teams'}
        </div>
        {list.loading && <div className={cn('loading')}>Loading…</div>}
        {!list.loading && list.error && (
          <div className={cn('error')}>{list.error}</div>
        )}
        {!list.loading && !list.error && list.teams.length === 0 && (
          <div className={cn('empty')}>
            {selectedTeam
              ? 'No sub-teams.'
              : currentParentName
                ? 'No teams found.'
                : 'No top-level teams.'}
          </div>
        )}
        {!list.loading && !list.error && list.teams.length > 0 && (
          <div className={cn('list')}>
            {list.teams.map(team => (
              <TeamRow
                key={team.slug}
                team={team}
                cn={cn}
                currentParentName={currentParentName}
                hidePrefix={hidePrefix}
                showDescription={showDescription}
                isEditing={editing === team.slug}
                protection={isProtected(team.name, protectList, configuredPrefix)}
                onSelectRow={() => descend(team)}
                onEdit={() =>
                  setEditing(prev => (prev === team.slug ? null : team.slug))
                }
                onDelete={() => performDelete(team)}
                onSave={updates => performUpdate(team, updates)}
                onCancelEdit={() => setEditing(null)}
              />
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        className={cn('addButton')}
        onClick={() => setCreating(prev => !prev)}
      >
        {creating ? 'Cancel' : '+ Add team'}
      </button>

      {creating &&
        renderCreatePanel({
          cn,
          performCreate,
          onClose: () => setCreating(false),
        })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

const renderBreadcrumbs = ({
  cn,
  configuredPrefix,
  rootLabel,
  pathBelow,
  goToBreadcrumb,
}) => {
  const segments = [];
  // The root is always present.
  const rootIsCurrent = pathBelow.length === 0;
  segments.push({
    key: '__root__',
    label: rootLabel,
    isCurrent: rootIsCurrent,
    onClick: rootIsCurrent ? null : () => goToBreadcrumb(-1),
  });
  pathBelow.forEach((seg, i) => {
    const parentName = i === 0 ? configuredPrefix : pathBelow[i - 1].name;
    const isCurrent = i === pathBelow.length - 1;
    segments.push({
      key: seg.slug || `seg-${i}`,
      label: localSegment(seg.name, parentName),
      isCurrent,
      onClick: isCurrent ? null : () => goToBreadcrumb(i),
    });
  });
  return (
    <nav className={cn('breadcrumbs')} aria-label="Teams breadcrumb">
      {segments.map((s, i) => (
        <Fragment key={s.key}>
          {i > 0 && (
            <span className={cn('breadcrumbSeparator')} aria-hidden="true">
              /
            </span>
          )}
          {s.isCurrent ? (
            <span
              className={cn('breadcrumbItem', 'pointer-events-none opacity-100')}
            >
              {s.label}
            </span>
          ) : (
            <button
              type="button"
              className={cn('breadcrumbItem')}
              onClick={s.onClick}
            >
              {s.label}
            </button>
          )}
        </Fragment>
      ))}
    </nav>
  );
};

const renderHeader = ({
  cn,
  selectedTeam,
  currentParentName,
  configuredPrefix,
  rootLabel,
  editing,
  setEditing,
  performUpdate,
  performDelete,
  protectList,
}) => {
  // At the prefix root (no team selected), the header shows a label only;
  // the Add affordance lives below the team list (rendered by
  // TeamsContent), so this branch returns just the header card.
  if (!selectedTeam) {
    return (
      <div className={cn('header')}>
        <div className={cn('headerMain')}>
          <div className={cn('headerName')}>
            {configuredPrefix ? `Teams under ${rootLabel}` : 'Top-level teams'}
          </div>
        </div>
      </div>
    );
  }

  const isEditingHeader = editing === 'header';
  const headerProtection = isProtected(
    selectedTeam.name,
    protectList,
    configuredPrefix,
  );
  const hideHeaderEdit = !!headerProtection && !headerProtection.allowEdit;
  const hideHeaderDelete = !!headerProtection;
  return (
    <>
      <div className={cn('header')}>
        <div className={cn('headerMain')}>
          <div className={cn('headerName')}>
            {localSegment(
              selectedTeam.name,
              // The parent of the selected team is the one above it in the
              // breadcrumb — i.e. either the second-to-last pathBelow entry's
              // name, or the configuredPrefix when there's only one entry.
              // currentParentName here is selectedTeam's own name, so we
              // re-derive: strip the deepest `::` segment.
              selectedTeam.name.includes('::')
                ? selectedTeam.name.slice(0, selectedTeam.name.lastIndexOf('::'))
                : null,
            )}
          </div>
          {selectedTeam.description && (
            <div className={cn('headerDescription')}>{selectedTeam.description}</div>
          )}
        </div>
        <div className={cn('headerActions')}>
          {!hideHeaderEdit && (
            <button
              type="button"
              className={cn('editButton')}
              aria-label="Edit team"
              onClick={() =>
                setEditing(prev => (prev === 'header' ? null : 'header'))
              }
            >
              <Icon name="pencil" size={16} />
            </button>
          )}
          {!hideHeaderDelete && (
            <button
              type="button"
              className={cn('deleteButton')}
              aria-label="Delete team"
              onClick={() => performDelete(selectedTeam)}
            >
              <Icon name="trash" size={16} />
            </button>
          )}
        </div>
      </div>

      {isEditingHeader && (
        <EditPanel
          cn={cn}
          team={selectedTeam}
          onSave={updates => performUpdate(selectedTeam, updates)}
          onCancel={() => setEditing(null)}
        />
      )}
    </>
  );
};

const renderCreatePanel = ({ cn, performCreate, onClose }) => (
  <CreatePanel cn={cn} performCreate={performCreate} onClose={onClose} />
);

// ---------------------------------------------------------------------------
// Sub-components (panels + list row)
// ---------------------------------------------------------------------------

const CreatePanel = ({ cn, performCreate, onClose }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    setSaving(true);
    const ok = await performCreate({ name, description });
    setSaving(false);
    if (ok) onClose();
  };
  return (
    <div className={cn('panel')}>
      <div className={cn('field')}>
        <label className={cn('label')}>Name</label>
        <input
          className={cn('input')}
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
          disabled={saving}
        />
      </div>
      <div className={cn('field')}>
        <label className={cn('label')}>Description</label>
        <textarea
          className={cn('textarea')}
          rows={2}
          value={description}
          onChange={e => setDescription(e.target.value)}
          disabled={saving}
        />
      </div>
      <div className={cn('panelActions')}>
        <button
          type="button"
          className={cn('panelCancel')}
          onClick={onClose}
          disabled={saving}
        >
          Cancel
        </button>
        <button
          type="button"
          className={cn('panelSave')}
          onClick={handleSave}
          disabled={saving || !name.trim()}
        >
          {saving ? 'Creating…' : 'Create'}
        </button>
      </div>
    </div>
  );
};

const EditPanel = ({ cn, team, onSave, onCancel }) => {
  const initialLocal =
    team.name.includes('::')
      ? team.name.slice(team.name.lastIndexOf('::') + 2)
      : team.name;
  const [localName, setLocalName] = useState(initialLocal);
  const [description, setDescription] = useState(team.description || '');
  const [saving, setSaving] = useState(false);
  const dirty =
    localName.trim() !== initialLocal || description !== (team.description || '');
  const handleSave = async () => {
    setSaving(true);
    // Reassemble the full team name using the original parent prefix.
    const parentPart = team.name.includes('::')
      ? team.name.slice(0, team.name.lastIndexOf('::'))
      : null;
    const newFullName = parentPart
      ? `${parentPart}::${localName.trim()}`
      : localName.trim();
    const updates = {};
    if (newFullName !== team.name) updates.name = newFullName;
    if (description !== (team.description || '')) updates.description = description;
    const ok = await onSave(updates);
    setSaving(false);
    if (ok) onCancel();
  };
  return (
    <div className={cn('panel')}>
      <div className={cn('field')}>
        <label className={cn('label')}>Name</label>
        <input
          className={cn('input')}
          type="text"
          value={localName}
          onChange={e => setLocalName(e.target.value)}
          autoFocus
          disabled={saving}
        />
      </div>
      <div className={cn('field')}>
        <label className={cn('label')}>Description</label>
        <textarea
          className={cn('textarea')}
          rows={2}
          value={description}
          onChange={e => setDescription(e.target.value)}
          disabled={saving}
        />
      </div>
      <div className={cn('panelActions')}>
        <button
          type="button"
          className={cn('panelCancel')}
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>
        <button
          type="button"
          className={cn('panelSave')}
          onClick={handleSave}
          disabled={saving || !dirty || !localName.trim()}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
};

const TeamRow = ({
  team,
  cn,
  currentParentName,
  hidePrefix,
  showDescription,
  isEditing,
  protection,
  onSelectRow,
  onEdit,
  onDelete,
  onSave,
  onCancelEdit,
}) => {
  // `protection` is null (unprotected) or `{ allowEdit }`. Trash is always
  // hidden when protected; pencil is hidden unless the matching entry
  // opted into edits.
  const hideEdit = !!protection && !protection.allowEdit;
  const hideDelete = !!protection;
  // Clicking the action buttons must not also trigger the row's
  // descend-on-click — stop propagation on each.
  const stop = e => e.stopPropagation();
  return (
    <div>
      <div
        className={cn('listRow')}
        onClick={onSelectRow}
        role="button"
        tabIndex={0}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectRow();
          }
        }}
      >
        <div className={cn('listRowMain')}>
          <div className={cn('listRowName')}>
            {displayName(team.name, currentParentName, hidePrefix)}
          </div>
          {showDescription && team.description && (
            <div className={cn('listRowDescription')}>{team.description}</div>
          )}
        </div>
        <div className={cn('listRowActions')} onClick={stop}>
          {!hideEdit && (
            <button
              type="button"
              className={cn('editButton')}
              aria-label="Edit team"
              onClick={onEdit}
            >
              <Icon name="pencil" size={16} />
            </button>
          )}
          {!hideDelete && (
            <button
              type="button"
              className={cn('deleteButton')}
              aria-label="Delete team"
              onClick={onDelete}
            >
              <Icon name="trash" size={16} />
            </button>
          )}
        </div>
      </div>
      {isEditing && (
        <EditPanel cn={cn} team={team} onSave={onSave} onCancel={onCancelEdit} />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Widget wiring
// ---------------------------------------------------------------------------

const TeamsComponent = forwardRef(({ config, id }, ref) => {
  const apiRef = useRef({});
  return (
    <Provider store={store}>
      <WidgetAPI ref={ref} api={apiRef.current}>
        <TeamsContent config={config} id={id} apiRef={apiRef} />
      </WidgetAPI>
    </Provider>
  );
});

/**
 * Initializes a Teams widget instance.
 *
 * Renders a breadcrumb-driven browser for Kinetic teams. The user starts at
 * either all top-level teams or the children of a configured `parentName`
 * prefix, descends into teams by clicking rows (each descent updates the
 * breadcrumb), and can create / rename / describe / delete teams subject to
 * the platform's security policies.
 *
 * The widget publishes the current selection (the deepest segment of the
 * breadcrumb, or null at the prefix root) to redux at
 * `state.widgets.teamSelection[id]` so sibling widgets — TeamMembers and a
 * future `Attributes` `target: 'current'` mode for `type: 'team'` — can
 * follow without designer wiring beyond a matching `teamsWidgetId` config.
 *
 * Usage from a Kinetic form's bundle script:
 *
 *   bundle.widgets.Teams({
 *     container: K('content[Teams]').element(),
 *     config: { parentName: 'Role::App::services' },
 *     id: 'services-teams',
 *   });
 *
 * @param {HTMLElement|ArrayLike<HTMLElement>} container Either a DOM
 *   element or an array-like whose first entry is one (e.g.
 *   `K('content[...]').element()`).
 * @param {Object} config Configuration. All fields optional.
 * @param {string} [config.parentName] Restrict the widget to teams under
 *   this team's name. The configured team is treated as a filter, not a
 *   selectable row — to manage the team itself, configure a Teams widget
 *   pointed at its parent. Omit to browse all top-level teams.
 * @param {string} [config.rootLabel] Label for the root breadcrumb segment.
 *   Defaults to "Teams" — or, when `parentSelectable` is on and
 *   `parentName` is set, the prefix's final `::`-segment (e.g.
 *   `services` for `Role::App::services`).
 * @param {boolean} [config.parentSelectable] When true and `parentName` is
 *   set, the widget treats the prefix team itself as a first-class team:
 *   loads its record on mount, publishes it to redux selection at root
 *   level so sibling widgets (TeamMembers) can target it, and renders
 *   the team in the header with the standard pencil / trash affordances
 *   (subject to `protect`). Default false — the prefix stays a filter,
 *   not a row.
 * @param {boolean} [config.hidePrefix] When true (default), strips the
 *   current parent prefix from each row's displayed name (`Admin` instead
 *   of `Role::App::services::Admin`). Set false to always render the full
 *   team name.
 * @param {boolean} [config.showDescription] When true (default), shows the
 *   team description under the name in each row. Set false to render a
 *   tighter list.
 * @param {Array<string|RegExp|Object>} [config.protect] Visual-only
 *   protection list. When a team's full name matches an entry, the
 *   widget hides BOTH the pencil (edit) and the trash (delete) on that
 *   team's row and on the header. Entry forms:
 *   - **string** — exact full-name equality, auto-prefixed by
 *     `parentName` when set and the entry doesn't already start with
 *     `<parentName>::`.
 *   - **RegExp** — `.test(fullName)` against the team's full name.
 *   - **Object** `{ match: string|RegExp, allowEdit?: boolean }` —
 *     same matcher rules; set `allowEdit: true` to keep the pencil
 *     visible while still hiding the trash.
 *   The platform's security policy is still the actual gate;
 *   protection here is an accident guardrail, not a permission boundary.
 * @param {Object} [config.classNames] Per-slot class overrides. Same
 *   convention as Profile / Attributes — strings are additive, objects
 *   support `{ add?, remove? }` for surgical control.
 * @param {string} [id] Optional id used by registerWidget for instance
 *   tracking AND as the key under which the widget's selection is
 *   published to redux. Sibling widgets reference this same id to follow
 *   the selection.
 */
export const Teams = ({ container, config = {}, id } = {}) => {
  const resolved = resolveContainer(container, 'Teams');
  if (resolved && validateConfig(config)) {
    return registerWidget(Teams, {
      container: resolved,
      Component: TeamsComponent,
      props: { id, config },
      id,
    });
  }
  return Promise.reject(
    'The Teams widget parameters are invalid. See the console for more details.',
  );
};
