import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Provider, useSelector } from 'react-redux';
import clsx from 'clsx';
import { debounce } from 'lodash-es';
import {
  createMembership,
  deleteMembership,
  fetchTeam,
  fetchTeams,
  fetchUsers,
} from '@kineticdata/react';
import { registerWidget, resolveContainer, WidgetAPI } from './index.js';
import { store } from '../../../redux.js';
import { selectTeamSelection } from '../../../helpers/state.js';
import { openConfirm } from '../../../helpers/confirm.js';
import { toastError, toastSuccess } from '../../../helpers/toasts.js';
import { extractPolicyMessage } from './utils.js';
import { useIntegration, validateIntegrationBase, mapRowToItem } from './integration.js';
import { Icon } from '../../../atoms/Icon.jsx';

const LOOKUP_MODES = ['direct', 'integration'];

const SLOT_DEFAULTS = {
  // Outer wrapper.
  container: 'flex-c-st gap-4 w-full',
  // Team picker (only rendered when `team: 'picker'`).
  picker: 'field',
  pickerLabel: '',
  pickerSelect: 'min-w-48',
  // Header showing the current team name + member count.
  header: 'flex-sc justify-between gap-2 items-start',
  headerMain: 'flex-c-st gap-1 flex-1 min-w-0',
  headerName: 'text-lg font-semibold text-base-content',
  headerCount: 'text-sm text-base-content/60',
  // Search-to-add control. Input is positioned relative; results render in
  // an absolutely-positioned dropdown beneath it.
  search: 'relative w-full',
  searchInput: 'kinput kinput-bordered w-full',
  searchResults:
    'absolute z-10 left-0 right-0 mt-1 bg-base-100 border border-base-300 rounded-box shadow-lg max-h-72 overflow-auto',
  searchResult: 'flex-c-st gap-0 px-3 py-2 cursor-pointer hover:bg-base-200',
  searchResultName: 'text-base text-base-content',
  searchResultMeta: 'text-xs text-base-content/60',
  searchEmpty: 'px-3 py-2 text-sm text-base-content/60 italic',
  searchLoading: 'px-3 py-2 text-sm text-base-content/60',
  searchError: 'px-3 py-2 text-sm text-error',
  // Member list.
  list: 'flex-c-st gap-0 divide-y divide-base-200',
  listRow: 'flex-sc justify-between gap-2 py-2 px-1',
  listRowMain: 'flex-c-st gap-0 flex-1 min-w-0',
  listRowName: 'text-base text-base-content truncate',
  listRowMeta: 'text-sm text-base-content/60 truncate',
  listRowActions: 'flex-sc gap-1 shrink-0',
  removeButton: 'p-1 rounded hover:bg-base-200 text-base-content/70',
  // Pre-render states.
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

const validateTeam = (team, widgetName) => {
  if (team == null) return true; // default: 'picker'
  if (typeof team === 'string') {
    // 'current' | 'picker' | <slug>
    return true;
  }
  if (typeof team === 'object' && !Array.isArray(team)) {
    if (typeof team.teamSlug === 'string' && team.teamSlug) return true;
    if (typeof team.teamName === 'string' && team.teamName) return true;
    console.error(
      `${widgetName} Widget Error: config.team object must include a non-empty teamSlug or teamName.`,
    );
    return false;
  }
  console.error(
    `${widgetName} Widget Error: config.team must be a string ('current' | 'picker' | <slug>) or an object ({ teamSlug } | { teamName }).`,
  );
  return false;
};

const validateUserLookup = (userLookup, widgetName) => {
  if (userLookup == null) return true;
  if (typeof userLookup !== 'object' || Array.isArray(userLookup)) {
    console.error(
      `${widgetName} Widget Error: config.userLookup must be an object when provided.`,
    );
    return false;
  }
  const mode = userLookup.mode || 'direct';
  if (!LOOKUP_MODES.includes(mode)) {
    console.error(
      `${widgetName} Widget Error: config.userLookup.mode must be one of ${LOOKUP_MODES.join(', ')}.`,
    );
    return false;
  }
  if (mode === 'integration') {
    if (!validateIntegrationBase(userLookup, widgetName)) return false;
    const hasUserMap = userLookup.userMap != null;
    const hasTransform = userLookup.transform != null;
    if (hasUserMap && hasTransform) {
      console.error(
        `${widgetName} Widget Error: config.userLookup.userMap and config.userLookup.transform are mutually exclusive — provide one, not both.`,
      );
      return false;
    }
    if (!hasUserMap && !hasTransform) {
      console.error(
        `${widgetName} Widget Error: config.userLookup requires either userMap or transform when mode is 'integration'.`,
      );
      return false;
    }
    if (hasUserMap) {
      if (typeof userLookup.userMap !== 'object' || Array.isArray(userLookup.userMap)) {
        console.error(
          `${widgetName} Widget Error: config.userLookup.userMap must be a plain object.`,
        );
        return false;
      }
      if (typeof userLookup.userMap.username !== 'string' || !userLookup.userMap.username) {
        console.error(
          `${widgetName} Widget Error: config.userLookup.userMap.username is required (the membership API needs a username).`,
        );
        return false;
      }
    }
    if (hasTransform && typeof userLookup.transform !== 'function') {
      console.error(
        `${widgetName} Widget Error: config.userLookup.transform must be a function.`,
      );
      return false;
    }
    if (
      userLookup.searchParameter != null &&
      typeof userLookup.searchParameter !== 'string'
    ) {
      console.error(
        `${widgetName} Widget Error: config.userLookup.searchParameter must be a string when provided.`,
      );
      return false;
    }
  }
  return true;
};

const validateConfig = (config = {}) => {
  const widgetName = 'TeamMembers';
  if (!validateTeam(config.team, widgetName)) return false;
  if (
    config.teamsWidgetId != null &&
    typeof config.teamsWidgetId !== 'string'
  ) {
    console.error(
      `${widgetName} Widget Error: config.teamsWidgetId must be a string when provided.`,
    );
    return false;
  }
  if (!validateUserLookup(config.userLookup, widgetName)) return false;
  if (config.pickerLabel != null && typeof config.pickerLabel !== 'string') {
    console.error(
      `${widgetName} Widget Error: config.pickerLabel must be a string when provided.`,
    );
    return false;
  }
  if (config.protect != null) {
    if (!Array.isArray(config.protect)) {
      console.error(
        `${widgetName} Widget Error: config.protect must be an array of strings or RegExps when provided.`,
      );
      return false;
    }
    for (const entry of config.protect) {
      if (typeof entry !== 'string' && !(entry instanceof RegExp)) {
        console.error(
          `${widgetName} Widget Error: every config.protect entry must be a string (exact team name) or a RegExp.`,
        );
        return false;
      }
    }
  }
  if (
    config.protectedMessage != null &&
    typeof config.protectedMessage !== 'string'
  ) {
    console.error(
      `${widgetName} Widget Error: config.protectedMessage must be a string when provided.`,
    );
    return false;
  }
  if (!validateClassNames(config.classNames, widgetName)) return false;
  return true;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Canonicalize a Kinetic user record (from fetchUsers / memberships.user) or
// an integration-mapped row into `{ username, displayName, email }`. The
// membership API only needs `username`; the other fields are display niceties.
const canonicalizeUser = user => {
  if (!user) return null;
  if (!user.username) return null;
  return {
    username: user.username,
    displayName:
      user.displayName ||
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      user.username,
    email: user.email || null,
  };
};

// Returns true when the team's full name matches any `protect` entry.
// Strings match by exact full-name equality; RegExps via `.test(fullName)`.
// Empty / missing list → never protected.
const isTeamProtected = (fullName, protectList) => {
  if (!Array.isArray(protectList) || protectList.length === 0) return false;
  if (!fullName) return false;
  for (const entry of protectList) {
    if (typeof entry === 'string' && entry === fullName) return true;
    if (entry instanceof RegExp && entry.test(fullName)) return true;
  }
  return false;
};

// Sort member rows by displayName (case-insensitive), falling back to
// username. Stable enough for any reasonable team size.
const sortMembers = members => {
  return [...members].sort((a, b) => {
    const aKey = (a.displayName || a.username || '').toLowerCase();
    const bKey = (b.displayName || b.username || '').toLowerCase();
    if (aKey < bKey) return -1;
    if (aKey > bKey) return 1;
    return 0;
  });
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const TeamMembersContent = ({ config = {}, id, apiRef }) => {
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

  // Resolve the team target. Modes:
  //   'current'         → read selection from `state.widgets.teamSelection[teamsWidgetId]`
  //   'picker'          → render a select; user picks
  //   '<slug>'          → string treated as slug
  //   { teamSlug }      → explicit slug
  //   { teamName }      → look up the slug
  // Default (config.team omitted) → 'picker'.
  const teamConfig = config.team == null ? 'picker' : config.team;
  const teamsWidgetId = config.teamsWidgetId || null;

  // Picker state (only used in picker mode).
  const [pickerSlug, setPickerSlug] = useState(null);
  // Available teams for the picker.
  const [pickerTeams, setPickerTeams] = useState(null);
  // Resolved override from setTeam() — when set, overrides config.team.
  const [overrideTarget, setOverrideTarget] = useState(null);

  // Subscribe to the selected team published by a Teams widget — only fires
  // when teamConfig === 'current'. Defaults to a stable null when not in
  // 'current' mode so React doesn't bail on conditional hook order.
  const currentSelection = useSelector(
    teamConfig === 'current' && teamsWidgetId
      ? selectTeamSelection(teamsWidgetId)
      : () => null,
  );

  // The "effective" target — what we actually fetch. Walks through:
  //   overrideTarget (from setTeam) → teamConfig → null.
  const resolvedTarget = useMemo(() => {
    const t = overrideTarget != null ? overrideTarget : teamConfig;
    if (t === 'picker') {
      return pickerSlug ? { teamSlug: pickerSlug } : null;
    }
    if (t === 'current') {
      if (!teamsWidgetId) {
        // Configuration error — surfaced once below.
        return null;
      }
      return currentSelection
        ? { teamSlug: currentSelection.slug, teamName: currentSelection.name }
        : null;
    }
    if (typeof t === 'string') return { teamSlug: t };
    if (t && typeof t === 'object') {
      if (t.teamSlug) return { teamSlug: t.teamSlug };
      if (t.teamName) return { teamName: t.teamName };
    }
    return null;
  }, [overrideTarget, teamConfig, teamsWidgetId, currentSelection, pickerSlug]);

  // Warn once about misconfigured 'current'.
  const warnedRef = useRef(false);
  useEffect(() => {
    if (teamConfig === 'current' && !teamsWidgetId && !warnedRef.current) {
      warnedRef.current = true;
      console.warn(
        'TeamMembers Widget Warning: config.team is "current" but config.teamsWidgetId is not set. The widget will not resolve a team — set teamsWidgetId to the id of the Teams widget you want to follow.',
      );
    }
  }, [teamConfig, teamsWidgetId]);

  // ----- Picker option load ----------------------------------------------

  useEffect(() => {
    if (teamConfig !== 'picker' || overrideTarget != null) return;
    if (pickerTeams != null) return;
    fetchTeams({ limit: 1000, orderBy: 'name', direction: 'ASC' }).then(
      response => {
        if (response?.error) {
          setPickerTeams([]);
          return;
        }
        setPickerTeams(Array.isArray(response.teams) ? response.teams : []);
      },
    );
  }, [teamConfig, overrideTarget, pickerTeams]);

  // ----- Fetch the resolved team + memberships ---------------------------

  // We store the fetched record keyed by the resolution target so we can
  // detect a stale response landing after a target switch and discard it.
  const targetKey = useMemo(() => {
    if (!resolvedTarget) return null;
    return resolvedTarget.teamSlug
      ? `slug:${resolvedTarget.teamSlug}`
      : `name:${resolvedTarget.teamName}`;
  }, [resolvedTarget]);

  const [fetched, setFetched] = useState({
    key: null,
    team: null,
    loading: false,
    error: null,
  });

  const refresh = useCallback(async () => {
    if (!resolvedTarget) {
      setFetched({ key: null, team: null, loading: false, error: null });
      return;
    }
    const myKey = targetKey;
    setFetched(prev => ({ ...prev, key: myKey, loading: true, error: null }));
    let teamSlug = resolvedTarget.teamSlug;
    // If we only have a name, look up the slug first via a name-filtered list.
    if (!teamSlug && resolvedTarget.teamName) {
      const lookup = await fetchTeams({
        q: `name="${resolvedTarget.teamName}"`,
        limit: 1,
      });
      if (lookup?.error || !lookup.teams?.[0]) {
        setFetched(prev =>
          prev.key === myKey
            ? {
                key: myKey,
                team: null,
                loading: false,
                error:
                  lookup?.error?.message ||
                  `Team "${resolvedTarget.teamName}" not found.`,
              }
            : prev,
        );
        return;
      }
      teamSlug = lookup.teams[0].slug;
    }
    const response = await fetchTeam({
      teamSlug,
      include: 'memberships,memberships.user',
    });
    setFetched(prev => {
      if (prev.key !== myKey) return prev; // stale, discard
      if (response?.error) {
        return {
          key: myKey,
          team: null,
          loading: false,
          error: response.error.message || 'Failed to load team.',
        };
      }
      return {
        key: myKey,
        team: response.team || null,
        loading: false,
        error: null,
      };
    });
  }, [resolvedTarget, targetKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Canonical member list — derived from fetched.team.memberships.user.
  const members = useMemo(() => {
    const raw = fetched.team?.memberships || [];
    return sortMembers(
      raw.map(m => canonicalizeUser(m.user)).filter(Boolean),
    );
  }, [fetched.team]);

  // ----- Add (membership creation) ---------------------------------------

  const addMember = useCallback(
    async user => {
      const canonical = typeof user === 'string'
        ? canonicalizeUser({ username: user })
        : canonicalizeUser(user);
      if (!canonical) {
        toastError({
          title: 'Add member failed.',
          description: 'A username is required.',
        });
        return false;
      }
      if (!fetched.team?.slug) {
        toastError({
          title: 'Add member failed.',
          description: 'No team is currently loaded.',
        });
        return false;
      }
      // Avoid a redundant API call when the user is already in the team.
      if (members.some(m => m.username === canonical.username)) {
        toastError({
          title: 'Already a member.',
          description: `${canonical.displayName} is already on this team.`,
        });
        return false;
      }
      const response = await createMembership({
        team: { name: fetched.team.name },
        user: { username: canonical.username },
      });
      if (response?.error) {
        toastError({
          title: 'Add member failed.',
          description:
            extractPolicyMessage(response.error) ||
            response.error.message ||
            'Please try again.',
        });
        return false;
      }
      toastSuccess({ title: `Added ${canonical.displayName}.` });
      await refresh();
      return true;
    },
    [fetched.team, members, refresh],
  );

  // ----- Remove (membership delete) --------------------------------------

  const removeMember = useCallback(
    usernameOrUser => {
      const username =
        typeof usernameOrUser === 'string'
          ? usernameOrUser
          : usernameOrUser?.username;
      if (!username) return;
      const member = members.find(m => m.username === username);
      const label = member?.displayName || username;
      const teamSlug = fetched.team?.slug;
      if (!teamSlug) return;
      openConfirm({
        title: `Remove ${label}?`,
        description: `Remove this user from the team "${fetched.team.name}". They can be added back later. This does not delete the user account.`,
        acceptLabel: 'Remove',
        accept: async () => {
          const response = await deleteMembership({ teamSlug, username });
          if (response?.error) {
            toastError({
              title: 'Remove member failed.',
              description:
                extractPolicyMessage(response.error) ||
                response.error.message ||
                'Please try again.',
            });
            return;
          }
          toastSuccess({ title: `Removed ${label}.` });
          await refresh();
        },
      });
    },
    [fetched.team, members, refresh],
  );

  // ----- Imperative API --------------------------------------------------

  useEffect(() => {
    apiRef.current.refresh = refresh;
    apiRef.current.getTeam = () =>
      fetched.team
        ? { name: fetched.team.name, slug: fetched.team.slug }
        : null;
    apiRef.current.getMembers = () => members.map(m => ({ ...m }));
    apiRef.current.addMember = addMember;
    apiRef.current.removeMember = removeMember;
    apiRef.current.setTeam = target => {
      // Accepted shapes mirror config.team (minus 'picker'/'current' which
      // are config-time concepts).
      if (target == null) {
        setOverrideTarget(null);
        return true;
      }
      if (typeof target === 'string') {
        setOverrideTarget(target);
        return true;
      }
      if (typeof target === 'object' && (target.teamSlug || target.teamName)) {
        setOverrideTarget(target);
        return true;
      }
      return false;
    };
  }, [apiRef, refresh, fetched.team, members, addMember, removeMember]);

  // ----- Render ----------------------------------------------------------

  return (
    <div className={cn('container')}>
      {teamConfig === 'picker' && overrideTarget == null && (
        <PickerField
          cn={cn}
          label={config.pickerLabel || 'Team'}
          teams={pickerTeams}
          value={pickerSlug}
          onChange={setPickerSlug}
        />
      )}

      {!resolvedTarget && teamConfig === 'current' && (
        <div className={cn('empty')}>
          {teamsWidgetId
            ? 'No team selected. Select a team in the linked Teams widget.'
            : 'Configuration error: config.teamsWidgetId is required when team is "current".'}
        </div>
      )}

      {!resolvedTarget && teamConfig === 'picker' && (
        <div className={cn('empty')}>Pick a team to view its members.</div>
      )}

      {resolvedTarget && fetched.loading && (
        <div className={cn('loading')}>Loading…</div>
      )}

      {resolvedTarget && !fetched.loading && fetched.error && (
        <div className={cn('error')}>{fetched.error}</div>
      )}

      {resolvedTarget && !fetched.loading && !fetched.error && fetched.team && (() => {
        const protectedTeam = isTeamProtected(
          fetched.team.name,
          config.protect,
        );
        const protectedMessage =
          config.protectedMessage ||
          'Direct membership management is disabled for this team.';
        return (
          <>
            <Header cn={cn} team={fetched.team} memberCount={members.length} />

            {protectedTeam && (
              <div className={cn('empty')}>{protectedMessage}</div>
            )}

            {!protectedTeam && (
              <SearchAdd
                cn={cn}
                config={config}
                team={fetched.team}
                members={members}
                onAdd={addMember}
              />
            )}

            {members.length === 0 ? (
              <div className={cn('empty')}>No members yet.</div>
            ) : (
              <div className={cn('list')}>
                {members.map(m => (
                  <MemberRow
                    key={m.username}
                    cn={cn}
                    member={m}
                    readOnly={protectedTeam}
                    onRemove={() => removeMember(m.username)}
                  />
                ))}
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const PickerField = ({ cn, label, teams, value, onChange }) => (
  <div className={cn('picker')}>
    {label && <label className={cn('pickerLabel')}>{label}</label>}
    {teams == null ? (
      <div className={cn('loading')}>Loading…</div>
    ) : (
      <select
        className={cn('pickerSelect')}
        value={value || ''}
        onChange={e => onChange(e.target.value || null)}
      >
        <option value="">Select a team…</option>
        {teams.map(t => (
          <option key={t.slug} value={t.slug}>
            {t.name}
          </option>
        ))}
      </select>
    )}
  </div>
);

const Header = ({ cn, team, memberCount }) => (
  <div className={cn('header')}>
    <div className={cn('headerMain')}>
      <div className={cn('headerName')}>{team.name}</div>
      <div className={cn('headerCount')}>
        {memberCount} {memberCount === 1 ? 'member' : 'members'}
      </div>
    </div>
  </div>
);

const MemberRow = ({ cn, member, readOnly, onRemove }) => (
  <div className={cn('listRow')}>
    <div className={cn('listRowMain')}>
      <div className={cn('listRowName')}>{member.displayName}</div>
      <div className={cn('listRowMeta')}>
        {member.username}
        {member.email ? ` · ${member.email}` : ''}
      </div>
    </div>
    {!readOnly && (
      <div className={cn('listRowActions')}>
        <button
          type="button"
          className={cn('removeButton')}
          aria-label="Remove member"
          onClick={onRemove}
        >
          <Icon name="x" size={16} />
        </button>
      </div>
    )}
  </div>
);

// ---------------------------------------------------------------------------
// Search + add — direct or integration mode
// ---------------------------------------------------------------------------

const SearchAdd = ({ cn, config, team, members, onAdd }) => {
  const lookup = config.userLookup || { mode: 'direct' };
  const mode = lookup.mode || 'direct';
  if (mode === 'integration') {
    return (
      <SearchAddIntegration
        cn={cn}
        lookup={lookup}
        team={team}
        members={members}
        onAdd={onAdd}
      />
    );
  }
  return <SearchAddDirect cn={cn} team={team} members={members} onAdd={onAdd} />;
};

// Direct mode — `fetchUsers({ q })` with username + email starts-with.
// KQL's starts-with operator is `=*` (not the word `startsWith`), and KQL
// supports compound OR on indexed fields. Both username and email are
// indexed.
const SearchAddDirect = ({ cn, team, members, onAdd }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fetchIdRef = useRef(0);

  const runSearch = useCallback(
    debounce(async q => {
      const myId = ++fetchIdRef.current;
      if (!q || q.length < 2) {
        setResults(null);
        setLoading(false);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      const escaped = q.replace(/"/g, '\\"');
      const response = await fetchUsers({
        q: `(username =* "${escaped}") OR (email =* "${escaped}")`,
        limit: 20,
      });
      if (myId !== fetchIdRef.current) return;
      setLoading(false);
      if (response?.error) {
        setResults([]);
        setError(response.error.message || 'Search failed.');
        return;
      }
      const canonical = (response.users || [])
        .map(canonicalizeUser)
        .filter(Boolean);
      setResults(canonical);
    }, 200),
    [],
  );

  const onChange = e => {
    setQuery(e.target.value);
    runSearch(e.target.value);
  };

  const onPick = async user => {
    const ok = await onAdd(user);
    if (ok) {
      setQuery('');
      setResults(null);
    }
  };

  const memberSet = new Set(members.map(m => m.username));
  const filtered = (results || []).filter(u => !memberSet.has(u.username));

  return (
    <div className={cn('search')}>
      <input
        type="text"
        className={cn('searchInput')}
        placeholder="Add a member by username or email…"
        value={query}
        onChange={onChange}
      />
      {(loading || error || results != null) && query.length >= 2 && (
        <div className={cn('searchResults')}>
          {loading && <div className={cn('searchLoading')}>Searching…</div>}
          {!loading && error && <div className={cn('searchError')}>{error}</div>}
          {!loading && !error && filtered.length === 0 && (
            <div className={cn('searchEmpty')}>
              {results && results.length > 0
                ? 'Every match is already on this team.'
                : 'No matching users.'}
            </div>
          )}
          {!loading &&
            !error &&
            filtered.map(u => (
              <div
                key={u.username}
                className={cn('searchResult')}
                onClick={() => onPick(u)}
                role="button"
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onPick(u);
                  }
                }}
              >
                <div className={cn('searchResultName')}>{u.displayName}</div>
                <div className={cn('searchResultMeta')}>
                  {u.username}
                  {u.email ? ` · ${u.email}` : ''}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
};

// Integration mode — designer points the widget at a Kinetic integration
// that returns a list of users. `userMap` (or `transform`) canonicalizes
// each row into `{ username, displayName?, email? }`. `searchParameter`
// toggles between one-shot fetch + client-side filter (omitted) vs
// re-fetch on debounced typing (set).
const SearchAddIntegration = ({ cn, lookup, members, onAdd }) => {
  const [query, setQuery] = useState('');
  const [committedParams, setCommittedParams] = useState(lookup.parameters || {});

  // Effective integration config — bakes the search parameter into params
  // when `searchParameter` is configured. Without `searchParameter` the
  // config is stable (params don't change with `query`), so useIntegration
  // fires only once on mount.
  const integration = useMemo(() => {
    if (lookup.searchParameter) {
      return { ...lookup, parameters: committedParams };
    }
    return lookup;
  }, [lookup, committedParams]);

  // useIntegration auto-refires when its `integration` config reference
  // changes — so when committedParams updates, the new `integration` memo
  // reference triggers a fresh fetch. No manual refresh needed here.
  const { list, loading, error } = useIntegration(integration);

  // When searchParameter is set, re-run the integration on debounced
  // keystroke with the search value merged in.
  const refreshWithQuery = useMemo(
    () =>
      debounce(q => {
        setCommittedParams({
          ...(lookup.parameters || {}),
          [lookup.searchParameter]: q,
        });
      }, 200),
    [lookup.parameters, lookup.searchParameter],
  );

  const onChange = e => {
    setQuery(e.target.value);
    if (lookup.searchParameter) refreshWithQuery(e.target.value);
  };

  const canonicalRows = useMemo(() => {
    if (!Array.isArray(list)) return null;
    return list
      .map(row => mapRowToItem(row, lookup.userMap, lookup.transform))
      .map(canonicalizeUser)
      .filter(Boolean);
  }, [list, lookup.userMap, lookup.transform]);

  // Client-side filter when searchParameter is not set.
  const filtered = useMemo(() => {
    const memberSet = new Set(members.map(m => m.username));
    const base = (canonicalRows || []).filter(u => !memberSet.has(u.username));
    if (lookup.searchParameter) return base; // server already filtered
    if (!query || query.length < 1) return [];
    const q = query.toLowerCase();
    return base.filter(
      u =>
        u.username.toLowerCase().includes(q) ||
        (u.displayName && u.displayName.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)),
    );
  }, [canonicalRows, members, query, lookup.searchParameter]);

  const onPick = async user => {
    const ok = await onAdd(user);
    if (ok) {
      setQuery('');
      if (lookup.searchParameter) {
        setCommittedParams(lookup.parameters || {});
      }
    }
  };

  const showResults = query.length >= 1;

  return (
    <div className={cn('search')}>
      <input
        type="text"
        className={cn('searchInput')}
        placeholder="Add a member…"
        value={query}
        onChange={onChange}
      />
      {showResults && (
        <div className={cn('searchResults')}>
          {loading && <div className={cn('searchLoading')}>Searching…</div>}
          {!loading && error && (
            <div className={cn('searchError')}>
              {error.message || 'Search failed.'}
            </div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div className={cn('searchEmpty')}>
              {canonicalRows && canonicalRows.length > 0
                ? 'No matching users.'
                : 'No users available.'}
            </div>
          )}
          {!loading &&
            !error &&
            filtered.map(u => (
              <div
                key={u.username}
                className={cn('searchResult')}
                onClick={() => onPick(u)}
                role="button"
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onPick(u);
                  }
                }}
              >
                <div className={cn('searchResultName')}>{u.displayName}</div>
                <div className={cn('searchResultMeta')}>
                  {u.username}
                  {u.email ? ` · ${u.email}` : ''}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Widget wiring
// ---------------------------------------------------------------------------

const TeamMembersComponent = forwardRef(({ config, id }, ref) => {
  const apiRef = useRef({});
  return (
    <Provider store={store}>
      <WidgetAPI ref={ref} api={apiRef.current}>
        <TeamMembersContent config={config} id={id} apiRef={apiRef} />
      </WidgetAPI>
    </Provider>
  );
});

/**
 * Initializes a TeamMembers widget instance.
 *
 * Lists, adds, and removes members of a Kinetic team. The team is
 * resolved from `config.team` — an explicit slug or name, a built-in
 * picker, or `'current'` to follow a sibling Teams widget's selection.
 * Adding a member uses a typeahead-style search: either Kinetic's
 * built-in user search (`userLookup.mode: 'direct'`, the default) or a
 * Kinetic integration the designer points the widget at (`'integration'`
 * — same plumbing as BundleMenu's integration-sourced items).
 *
 * Usage from a Kinetic form's bundle script:
 *
 *   bundle.widgets.TeamMembers({
 *     container: K('content[Members]').element(),
 *     config: { team: 'current', teamsWidgetId: 'services-roles' },
 *     id: 'members',
 *   });
 *
 * @param {HTMLElement|ArrayLike<HTMLElement>} container Either a DOM
 *   element or an array-like whose first entry is one.
 * @param {Object} config Configuration. All fields optional.
 * @param {(string|Object)} [config.team] Team target. Defaults to
 *   `'picker'`. Accepted shapes:
 *   - `'picker'` — auto-renders a styled `<select>` of every team.
 *   - `'current'` — reads the selection from `config.teamsWidgetId`.
 *   - `'<slug>'` — explicit team slug.
 *   - `{ teamSlug: '<slug>' }` — explicit slug object form.
 *   - `{ teamName: '<full name>' }` — looked up by name on mount.
 * @param {string} [config.teamsWidgetId] Required when `team` is
 *   `'current'`. The id of the sibling Teams widget whose selection
 *   this widget should follow.
 * @param {Object} [config.userLookup] How the add-a-member search is
 *   sourced. Default `{ mode: 'direct' }` — Kinetic's built-in
 *   `username startsWith / email startsWith` search. Set
 *   `{ mode: 'integration', kappSlug, formSlug?, integrationName,
 *   listProperty, parameters?, searchParameter?, userMap | transform,
 *   errorProperty?, onSuccess?, onError? }` to source candidates from
 *   a Kinetic integration instead. `userMap` interpolates `{{path}}`
 *   placeholders into a canonical `{ username, displayName?, email? }`
 *   shape (username is required). `searchParameter`, when set, makes
 *   the widget re-call the integration with the typed query merged
 *   into `parameters[searchParameter]` (debounced); without it the
 *   widget fetches once and filters client-side.
 * @param {string} [config.pickerLabel] Label for the auto-rendered team
 *   picker. Only meaningful when `team === 'picker'`. Defaults to
 *   `"Team"`.
 * @param {Array<string|RegExp>} [config.protect] Visual-only protection
 *   list for "grouping" teams that shouldn't accept direct memberships.
 *   When the resolved team's full name matches any entry — string entries
 *   via exact equality, RegExp entries via `.test(fullName)` — the
 *   search/add input and per-row remove buttons are hidden and an
 *   inline message explains. Existing members still render read-only.
 *   The platform's security policy is still the actual gate; protection
 *   here is an accident guardrail (and a hint to the user that this
 *   team is a container, not a leaf), not a permission boundary.
 * @param {string} [config.protectedMessage] Override the message shown
 *   when the resolved team is protected. Defaults to
 *   `"Direct membership management is disabled for this team."`.
 * @param {Object} [config.classNames] Per-slot class overrides. Same
 *   convention as Profile / Attributes / Teams.
 * @param {string} [id] Optional id for instance tracking.
 */
export const TeamMembers = ({ container, config = {}, id } = {}) => {
  const resolved = resolveContainer(container, 'TeamMembers');
  if (resolved && validateConfig(config)) {
    return registerWidget(TeamMembers, {
      container: resolved,
      Component: TeamMembersComponent,
      props: { id, config },
      id,
    });
  }
  return Promise.reject(
    'The TeamMembers widget parameters are invalid. See the console for more details.',
  );
};
