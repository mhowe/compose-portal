import { useCallback, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { fetchKapp, updateKapp } from '@kineticdata/react';
import {
  CAPABILITY_ATTRIBUTE_NAME,
  readCapabilityMetadata,
} from '../../helpers/capabilities.js';
import { Icon } from '../../atoms/Icon.jsx';
import { toastError } from '../../helpers/toasts.js';

/**
 * Renders a checklist of post-install manual steps for an installed
 * capability. Each step's completion state is persisted into the
 * Capability Metadata attribute on the installed kapp; clicking a
 * checkbox optimistically updates local state, writes through to the
 * kapp, and reverts on failure.
 *
 * The capability's manifest is the source of truth for which steps to
 * render and their text — only completion state lives on the kapp.
 *
 * @param {Object} props.capability  Capability manifest (must carry
 *   notes.manual_steps if any). When the manifest declares no steps,
 *   the component renders nothing.
 * @param {Object} props.installedKapp  The kapp record that carries the
 *   Capability Metadata attribute. Required to know which kapp to write to.
 * @param {Function} [props.onChange]  Called with the freshly-saved
 *   metadata after each successful save (caller can refresh space data
 *   if it wants the rest of the UI to reflect new completion counts).
 */
export const ManualStepsList = ({ capability, installedKapp, onChange }) => {
  const profile = useSelector(state => state.app.profile);
  const manifestSteps = capability?.notes?.manual_steps || [];

  // Working metadata — seeded from the kapp's current Capability Metadata
  // attribute and updated locally on each save so subsequent saves don't
  // reference stale state.
  const [workingMeta, setWorkingMeta] = useState(
    () => readCapabilityMetadata(installedKapp) || {},
  );
  const [savingIds, setSavingIds] = useState(() => new Set());

  const completionFor = useCallback(
    stepId =>
      !!(workingMeta?.manualSteps && workingMeta.manualSteps[stepId]?.completed),
    [workingMeta],
  );

  const handleToggle = useCallback(
    async (stepId, nextValue) => {
      if (!installedKapp?.slug) return;

      // Build the next metadata: preserve everything outside manualSteps,
      // patch just this step's record.
      const nextManualSteps = { ...(workingMeta.manualSteps || {}) };
      if (nextValue) {
        nextManualSteps[stepId] = {
          completed: true,
          completedAt: new Date().toISOString(),
          completedBy: profile?.username || null,
        };
      } else {
        nextManualSteps[stepId] = { completed: false };
      }
      const nextMeta = { ...workingMeta, manualSteps: nextManualSteps };

      // Optimistic
      const previousMeta = workingMeta;
      setWorkingMeta(nextMeta);
      setSavingIds(prev => new Set([...prev, stepId]));

      try {
        const result = await updateKapp({
          kappSlug: installedKapp.slug,
          kapp: {
            attributesMap: {
              [CAPABILITY_ATTRIBUTE_NAME]: [JSON.stringify(nextMeta)],
            },
          },
          include: 'attributesMap',
        });
        if (result?.error) throw result.error;
        // Re-read the saved attribute to make sure our local state matches
        // exactly what landed on the kapp (defensive against any
        // server-side coercion).
        const refreshed = await fetchKapp({
          kappSlug: installedKapp.slug,
          include: 'attributesMap',
        });
        const live =
          readCapabilityMetadata(refreshed?.kapp) || nextMeta;
        setWorkingMeta(live);
        onChange?.(live);
      } catch (error) {
        console.error('Failed to save manual step state', error);
        setWorkingMeta(previousMeta);
        toastError({
          title: 'Could not save step state',
          description: error?.message || String(error),
        });
      } finally {
        setSavingIds(prev => {
          const next = new Set(prev);
          next.delete(stepId);
          return next;
        });
      }
    },
    [installedKapp?.slug, onChange, profile?.username, workingMeta],
  );

  const summary = useMemo(() => {
    if (manifestSteps.length === 0) return null;
    const completed = manifestSteps.filter(s =>
      completionFor(String(s.id)),
    ).length;
    return { completed, total: manifestSteps.length };
  }, [manifestSteps, completionFor]);

  if (manifestSteps.length === 0) return null;

  return (
    <div className="flex-c-st gap-3">
      <div className="flex-sc gap-2">
        <span className="text-h4 font-semibold flex-auto">Manual Steps</span>
        {summary && (
          <span
            className={`kbadge ${summary.completed === summary.total ? 'kbadge-success' : 'kbadge-warning'}`}
          >
            {summary.completed} / {summary.total} complete
          </span>
        )}
      </div>
      <ul className="flex-c-st gap-2">
        {manifestSteps.map(step => {
          const stepId = String(step.id);
          const checked = completionFor(stepId);
          const saving = savingIds.has(stepId);
          return (
            <li
              key={stepId}
              className="flex-sc gap-3 p-3 rounded-box border border-base-300 bg-base-100"
            >
              <input
                type="checkbox"
                className="kcheckbox kcheckbox-primary mt-1 flex-none"
                checked={checked}
                disabled={saving}
                onChange={e => handleToggle(stepId, e.target.checked)}
                aria-label={`Mark step ${stepId} as ${checked ? 'incomplete' : 'complete'}`}
              />
              <div className="flex-c-ss flex-auto gap-1">
                <div className="text-sm">{step.text}</div>
                {step.link && (
                  <a
                    href={step.link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary inline-flex items-center gap-1"
                  >
                    Open in admin console
                    <Icon name="external-link" size={14} />
                  </a>
                )}
              </div>
              {saving && (
                <Icon
                  name="loader-2"
                  className="animate-spin text-info flex-none"
                  size={18}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};
