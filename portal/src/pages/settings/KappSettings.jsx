import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link, Navigate, useParams } from 'react-router-dom';
import {
  fetchForms,
  searchSubmissions,
  updateKapp,
} from '@kineticdata/react';
import { PageHeading } from '../../components/PageHeading.jsx';
import { Icon } from '../../atoms/Icon.jsx';
import { AccordionSection } from '../../atoms/AccordionSection.jsx';
import { Loading } from '../../components/states/Loading.jsx';
import { useData } from '../../helpers/hooks/useData.js';
import { appActions, selectKappBySlug } from '../../helpers/state.js';
import { toastError, toastSuccess } from '../../helpers/toasts.js';

const FORM_STATUSES = ['New', 'Active', 'Inactive', 'Delete'];
const SUBMISSIONS_LIMIT = 1000;

// KQL filters on indexed submittedAt; ms suffix stripped per Kinetic's
// datetime convention (see memory: feedback_kinetic_datetime_format).
const thirtyDaysAgoIso = () =>
  new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z');

// Reads `kapp.attributesMap[name]` into a plain array (always an array,
// even when absent — keeps editor row logic uniform across single + multi
// valued definitions).
const valuesFor = (kapp, name) => {
  const raw = kapp?.attributesMap?.[name];
  if (Array.isArray(raw)) return raw;
  return [];
};

// Initial editor state: every definition gets at least one row (so a
// fresh attribute renders an empty input the admin can type into).
const seedDraft = kapp =>
  (kapp?.kappAttributeDefinitions || []).reduce((acc, def) => {
    const current = valuesFor(kapp, def.name);
    acc[def.name] = current.length > 0 ? current.slice() : [''];
    return acc;
  }, {});

const trimValues = arr => arr.map(s => s.trim()).filter(s => s !== '');

const arraysEqual = (a, b) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

const Stat = ({ label, value, hint }) => (
  <div className="flex-c-st gap-1 p-4 rounded-box border border-base-300 bg-base-100">
    <div className="text-xs uppercase tracking-wide text-base-content/60">
      {label}
    </div>
    <div className="text-2xl font-semibold leading-tight">{value}</div>
    {hint && <div className="text-xs text-base-content/60">{hint}</div>}
  </div>
);

export const KappSettings = () => {
  const { kappSlug } = useParams();
  const spaceAdmin = useSelector(state => !!state.app.profile?.spaceAdmin);
  const spaceLoaded = useSelector(state => !!state.app.space);
  const kapp = useSelector(selectKappBySlug(kappSlug));

  // ---- Metrics ---------------------------------------------------------
  const formsParams = useMemo(
    () => (kappSlug ? { kappSlug, limit: 1000 } : null),
    [kappSlug],
  );
  const formsQuery = useData(fetchForms, formsParams);
  const forms = formsQuery.response?.forms || [];
  const formsLoading = formsQuery.initialized && formsQuery.loading;

  const formsByStatus = useMemo(() => {
    const counts = Object.fromEntries(FORM_STATUSES.map(s => [s, 0]));
    for (const f of forms) {
      if (counts[f.status] != null) counts[f.status] += 1;
    }
    return counts;
  }, [forms]);

  const submissionsParams = useMemo(() => {
    if (!kappSlug) return null;
    return {
      kapp: kappSlug,
      search: {
        q: `submittedAt > "${thirtyDaysAgoIso()}"`,
        include: ['form'],
        limit: SUBMISSIONS_LIMIT,
        orderBy: 'submittedAt',
      },
    };
  }, [kappSlug]);
  const submissionsQuery = useData(searchSubmissions, submissionsParams);
  const submissions = submissionsQuery.response?.submissions || [];
  const submissionsLoading =
    submissionsQuery.initialized && submissionsQuery.loading;
  const submissionsLabel = submissionsLoading
    ? '…'
    : submissions.length >= SUBMISSIONS_LIMIT
      ? `${SUBMISSIONS_LIMIT}+`
      : String(submissions.length);

  // ---- Theming section state -------------------------------------------
  const themeDefined = !!(kapp?.kappAttributeDefinitions || []).some(
    d => d.name === 'Theme',
  );
  const themeValueSet = !!kapp?.attributesMap?.Theme?.[0];

  // ---- Attribute editor -------------------------------------------------
  // Definitions are stable across renders (driven by the kapp record), but
  // the draft state needs to reset when the user navigates between kapps.
  // Keyed by slug so we don't accidentally cross-pollinate edits.
  const [draftKey, setDraftKey] = useState(kappSlug);
  const [draft, setDraft] = useState(() => seedDraft(kapp));
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (draftKey !== kappSlug) {
      setDraftKey(kappSlug);
      setDraft(seedDraft(kapp));
    }
  }, [kappSlug, kapp, draftKey]);
  // Re-seed when the kapp record arrives or its attributesMap changes
  // (e.g. another save or a manual refresh elsewhere). Skipped while the
  // user is saving — the post-save effect re-syncs explicitly below.
  useEffect(() => {
    if (saving) return;
    setDraft(seedDraft(kapp));
  }, [kapp, saving]);

  const definitions = kapp?.kappAttributeDefinitions || [];

  // Build the dirty check against the *current* persisted state so the
  // Save button only enables on real changes.
  const isDirty = useMemo(() => {
    for (const def of definitions) {
      const persisted = valuesFor(kapp, def.name);
      const drafted = trimValues(draft[def.name] ?? []);
      if (!arraysEqual(persisted, drafted)) return true;
    }
    return false;
  }, [definitions, draft, kapp]);

  if (!spaceAdmin) return <Navigate to="/" replace />;

  if (!spaceLoaded) {
    return (
      <div className="gutter">
        <Loading />
      </div>
    );
  }

  if (!kapp) {
    return (
      <div className="gutter">
        <PageHeading title="Kapp Settings" backTo="/kapps" />
        <div className="kd-callout">
          No kapp found with slug <code>{kappSlug}</code>.
        </div>
      </div>
    );
  }

  const setRow = (name, i, value) =>
    setDraft(prev => {
      const next = [...(prev[name] ?? [''])];
      while (next.length <= i) next.push('');
      next[i] = value;
      return { ...prev, [name]: next };
    });

  const removeRow = (name, i) =>
    setDraft(prev => {
      const next = [...(prev[name] ?? [''])];
      next.splice(i, 1);
      // Keep at least one row so the field stays editable after the last
      // value is removed.
      return { ...prev, [name]: next.length > 0 ? next : [''] };
    });

  const addRow = name =>
    setDraft(prev => ({ ...prev, [name]: [...(prev[name] ?? []), ''] }));

  const resetDraft = () => setDraft(seedDraft(kapp));

  const handleSave = async () => {
    setSaving(true);
    const attributesMap = {};
    for (const def of definitions) {
      attributesMap[def.name] = trimValues(draft[def.name] ?? []);
    }
    const response = await updateKapp({
      kappSlug,
      kapp: { attributesMap },
      include: 'attributesMap',
    });
    setSaving(false);
    if (response.error) {
      console.error('Failed to save kapp attributes', response.error);
      toastError({
        title: 'Save failed',
        description:
          response.error?.message ||
          'Could not save kapp attributes. See the browser console for details.',
      });
      return;
    }
    if (response.kapp?.attributesMap) {
      appActions.updateKappData({
        slug: kappSlug,
        attributesMap: response.kapp.attributesMap,
      });
    }
    toastSuccess({
      title: 'Saved',
      description: 'Kapp attributes updated.',
    });
  };

  const themeBadge = !themeDefined ? (
    <span className="kbadge kbadge-warning">
      <Icon name="alert-triangle" /> Attribute missing
    </span>
  ) : themeValueSet ? (
    <span className="kbadge kbadge-success">
      <Icon name="check" /> Customized
    </span>
  ) : (
    <span className="kbadge kbadge-ghost">Bundle defaults</span>
  );

  const statusLine = FORM_STATUSES.map(
    s => `${s}: ${formsLoading ? '…' : formsByStatus[s]}`,
  ).join(' · ');

  return (
    <div className="gutter">
      <PageHeading title={kapp.name} backTo={`/kapps/${kappSlug}`} />

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        <Stat
          label="Forms"
          value={formsLoading ? '…' : forms.length}
          hint={statusLine}
        />
        <Stat
          label="Submissions (30 days)"
          value={submissionsLabel}
          hint={
            submissions.length >= SUBMISSIONS_LIMIT
              ? `Capped at ${SUBMISSIONS_LIMIT}; the kapp had at least this many in the last 30 days.`
              : undefined
          }
        />
      </div>

      <div className="flex-c-ss gap-4">
        {/* Theming */}
        <AccordionSection
          title="Theming"
          headerRight={themeBadge}
          initialOpen={false}
        >
          <p className="text-sm text-base-content/70 mb-3">
            Edit this kapp's theme — colors, radius, and logo. Per-kapp
            themes layer on top of the space theme; keys left blank fall
            through to the space theme (and then bundle defaults).
          </p>
          {!themeDefined ? (
            <div className="kd-callout">
              The <code>Theme</code> kapp-attribute definition has not been
              deployed on this kapp. Deploy it from Space Settings → Kapp
              Attributes, then return here to start editing.
            </div>
          ) : (
            <div className="flex-sc gap-3 flex-wrap">
              <Link
                to={`/kapps/${kappSlug}/settings/theme`}
                className="kbtn kbtn-primary"
              >
                <Icon name="palette" /> Edit Kapp Theme
              </Link>
              <span className="text-sm text-base-content/70">
                Opens the full-page theme editor with a live preview.
              </span>
            </div>
          )}
        </AccordionSection>

        {/* Attributes */}
        <AccordionSection
          title="Kapp Attributes"
          headerRight={
            <span className="kbadge kbadge-ghost">
              {definitions.length} attribute
              {definitions.length === 1 ? '' : 's'}
            </span>
          }
          initialOpen={true}
        >
          <p className="text-sm text-base-content/70 mb-4">
            Free-text values for every attribute definition on this kapp.
            Leave a field blank to clear it; multi-value attributes add a
            row per value.
          </p>

          {definitions.length === 0 ? (
            <div className="kd-callout">
              This kapp has no attribute definitions.
            </div>
          ) : (
            <>
              <div className="flex-c-st gap-6 w-full">
                {definitions.map(def => {
                  const rows = draft[def.name] ?? [''];
                  return (
                    <div key={def.name} className="field">
                      <label className="font-medium">{def.name}</label>
                      <div className="flex-c-st gap-2">
                        {rows.map((value, i) => (
                          <div
                            key={i}
                            className={
                              def.allowsMultiple ? 'flex-sc gap-2' : undefined
                            }
                          >
                            <input
                              type="text"
                              className="kinput w-full min-w-48"
                              value={value}
                              onChange={e =>
                                setRow(def.name, i, e.target.value)
                              }
                            />
                            {def.allowsMultiple && rows.length > 1 && (
                              <button
                                type="button"
                                className="kbtn kbtn-ghost kbtn-sm kbtn-circle"
                                onClick={() => removeRow(def.name, i)}
                                aria-label={`Remove ${def.name} entry`}
                              >
                                <Icon name="x" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      {def.allowsMultiple && (
                        <button
                          type="button"
                          className="kbtn kbtn-ghost kbtn-xs self-start"
                          onClick={() => addRow(def.name)}
                        >
                          <Icon name="plus" /> Add another
                        </button>
                      )}
                      {def.description && (
                        <p className="text-sm text-base-content/60">
                          {def.description}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex-sc gap-3 mt-6 justify-end">
                <button
                  type="button"
                  className="kbtn kbtn-ghost"
                  onClick={resetDraft}
                  disabled={!isDirty || saving}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className="kbtn kbtn-primary"
                  onClick={handleSave}
                  disabled={!isDirty || saving}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </>
          )}
        </AccordionSection>
      </div>
    </div>
  );
};
