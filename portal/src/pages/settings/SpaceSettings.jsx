import { useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link, Navigate } from 'react-router-dom';
import {
  createAttributeDefinition,
  createKapp,
  fetchSpace,
} from '@kineticdata/react';
import { PageHeading } from '../../components/PageHeading.jsx';
import { Icon } from '../../atoms/Icon.jsx';
import { AccordionSection } from '../../atoms/AccordionSection.jsx';
import { BUNDLE_MANIFEST } from '../../helpers/bundle-manifest.js';
import {
  getManifestStatus,
  readAttributeValues,
} from '../../helpers/setup.js';
import {
  getCapabilityStatuses,
  useCapabilityRegistry,
} from '../../helpers/capabilities.js';
import { Loading } from '../../components/states/Loading.jsx';
import { InstallCapabilityModal } from './InstallCapabilityModal.jsx';
import { ManualStepsModal } from './ManualStepsModal.jsx';
import { appActions } from '../../helpers/state.js';
import { toastError, toastSuccess } from '../../helpers/toasts.js';

// Must match the include list in App.jsx so post-deploy refresh populates the
// same fields the setup check + landing resolver + Space Settings rely on.
const SPACE_INCLUDE =
  'attributesMap,kapps,kapps.attributesMap,kapps.kappAttributeDefinitions,spaceAttributeDefinitions,userProfileAttributeDefinitions,teamAttributeDefinitions';

// Module-level refresh — extracted so it's stable across renders and can be
// referenced from useEffect without dep-array churn.
const refreshSpaceData = async () => {
  try {
    const response = await fetchSpace({ include: SPACE_INCLUDE });
    appActions.setSpace(response);
  } catch (error) {
    console.error('Failed to refresh space data', error);
  }
};

/**
 * Deploys a single manifest status row and returns a result descriptor.
 * Never throws — failures are returned as { ok: false, item, error }.
 */
const deployOne = async item => {
  try {
    if (item.kind === 'kapp') {
      const { error } = await createKapp({
        kapp: {
          slug: item.name,
          name: item.name.charAt(0).toUpperCase() + item.name.slice(1),
        },
      });
      if (error) return { ok: false, item, error };
      return { ok: true, item };
    }
    const { error } = await createAttributeDefinition({
      attributeType: item.attributeType,
      ...(item.kappSlug ? { kappSlug: item.kappSlug } : {}),
      attributeDefinition: {
        name: item.name,
        description: item.description,
        allowsMultiple: !!item.allowsMultiple,
      },
    });
    if (error) return { ok: false, item, error };
    return { ok: true, item };
  } catch (error) {
    return { ok: false, item, error };
  }
};

/**
 * Space Settings — admin-only page for deploying and configuring bundle
 * features. Each conceptual area lives in its own accordion section.
 *
 * Sections:
 *   - Bundle Setup: required space + user-profile attribute definitions and
 *     the admin kapp. Shows a warning badge when anything is missing.
 *   - Kapp Attributes: optional per-kapp attribute definitions, one inner
 *     table per attribute. Informational summary badge.
 *   - Capabilities: stub list of installable kapps (Phase 2). Detection is
 *     already real — Phase 3 wires the registry fetch and real install.
 *   - More Settings: future home for theming, nav, etc.
 */
export const SpaceSettings = () => {
  const space = useSelector(state => state.app.space);
  const spaceAdmin = useSelector(state => !!state.app.profile?.spaceAdmin);

  const [deploying, setDeploying] = useState(false);
  const [busyKeys, setBusyKeys] = useState(() => new Set());
  const [installing, setInstalling] = useState(null);
  const [managingSteps, setManagingSteps] = useState(null);

  const status = useMemo(() => getManifestStatus(space), [space]);
  const registryUrls = useMemo(
    () => readAttributeValues(space, 'Capability Registry URLs'),
    [space],
  );
  const registry = useCapabilityRegistry(registryUrls);
  const capabilities = useMemo(
    () => getCapabilityStatuses(registry.capabilities, space?.kapps),
    [registry.capabilities, space?.kapps],
  );

  if (!spaceAdmin) return <Navigate to="/" replace />;

  const rowKey = row =>
    `${row.scope}:${row.kappSlug || ''}:${row.kind}:${row.name}`;

  const setupRows = status.filter(r => r.scope !== 'kapp-attribute');
  const missingItems = status.filter(r => !r.present);
  const setupMissingRequired = missingItems.filter(r => r.required);
  const setupOk = setupMissingRequired.length === 0;

  const kappAttrRows = status.filter(r => r.scope === 'kapp-attribute');
  const kappAttrMissing = kappAttrRows.filter(r => !r.present);

  const capabilityInstalled = capabilities.filter(c => c.installed).length;
  const capabilityUpgrades = capabilities.filter(c => c.upgradeAvailable).length;
  const capabilityAvailable = capabilities.length - capabilityInstalled;

  // Theme section state — driven entirely off the Bundle Setup row for
  // 'Theme' so the two sections stay consistent with no extra fetching.
  const themeRow = setupRows.find(
    r => r.scope === 'space' && r.name === 'Theme',
  );
  const themeDefined = !!themeRow?.present;
  const themeValueSet = !!space?.attributesMap?.['Theme']?.[0];

  const refreshSpace = refreshSpaceData;

  // Track whether something the user is mid-flighting on. Refreshing space
  // data while a deploy or install is running could overwrite optimistic
  // state with stale-mid-call data.
  const inFlightRef = useRef(false);
  inFlightRef.current = !!(deploying || installing || managingSteps);

  // Refresh on mount and on tab/window focus so admins who flip to the
  // Kinetic admin console (clear an attribute, change a kapp, etc.) and
  // come back see fresh state without manually reloading the page.
  useEffect(() => {
    refreshSpaceData();
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !inFlightRef.current) {
        refreshSpaceData();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const runDeploy = async items => {
    if (items.length === 0) return;
    const keys = new Set(items.map(rowKey));
    setBusyKeys(prev => new Set([...prev, ...keys]));
    if (items.length > 1) setDeploying(true);

    const results = await Promise.all(items.map(deployOne));
    const failed = results.filter(r => !r.ok);
    const succeeded = results.filter(r => r.ok);

    for (const f of failed) console.error('Deploy failed for', f.item, f.error);
    await refreshSpace();

    if (failed.length === 0) {
      toastSuccess({
        title: items.length === 1 ? 'Deployed' : 'Deploy complete',
        description:
          items.length === 1
            ? `Created ${succeeded[0].item.scopeLabel} — ${succeeded[0].item.name}.`
            : `Created ${succeeded.length} item${succeeded.length === 1 ? '' : 's'}.`,
      });
    } else if (succeeded.length === 0) {
      toastError({
        title: 'Deploy failed',
        description: `${failed.length} item${failed.length === 1 ? '' : 's'} could not be created. See the browser console for details.`,
      });
    } else {
      toastError({
        title: 'Deploy partially succeeded',
        description: `${succeeded.length} created, ${failed.length} failed. See the browser console for details.`,
      });
    }

    setBusyKeys(prev => {
      const next = new Set(prev);
      for (const k of keys) next.delete(k);
      return next;
    });
    if (items.length > 1) setDeploying(false);
  };

  const renderStatusCell = row => {
    if (row.present) {
      return (
        <span className="kbadge kbadge-success">
          <Icon name="check" /> Defined
        </span>
      );
    }
    return (
      <span
        className={`kbadge ${row.required ? 'kbadge-warning' : 'kbadge-ghost'}`}
      >
        <Icon name={row.required ? 'alert-triangle' : 'minus'} />{' '}
        {row.required ? 'Missing' : 'Not defined'}
      </span>
    );
  };

  const renderDeployCell = row => {
    if (row.present) return null;
    const key = rowKey(row);
    const busy = busyKeys.has(key);
    return (
      <button
        type="button"
        className="kbtn kbtn-xs kbtn-primary"
        onClick={() => runDeploy([row])}
        disabled={busy || deploying}
      >
        {busy ? 'Deploying…' : 'Deploy'}
      </button>
    );
  };

  const kappAttrGroups = BUNDLE_MANIFEST.kapp.attributes.map(attr => ({
    attr,
    rows: status.filter(
      r => r.scope === 'kapp-attribute' && r.name === attr.name,
    ),
  }));

  const setupHeaderBadge = setupOk ? (
    <span className="kbadge kbadge-success">
      <Icon name="check" /> All set
    </span>
  ) : (
    <span className="kbadge kbadge-warning">
      <Icon name="alert-triangle" /> {setupMissingRequired.length} missing
    </span>
  );

  const kappAttrsHeaderBadge = (
    <span className="kbadge kbadge-ghost">
      {kappAttrRows.length - kappAttrMissing.length} defined ·{' '}
      {kappAttrMissing.length} not defined
    </span>
  );

  const capabilitiesHeaderBadge = registry.loading ? (
    <span className="kbadge kbadge-ghost">Loading…</span>
  ) : registry.errors.length > 0 && capabilities.length === 0 ? (
    <span className="kbadge kbadge-warning">
      <Icon name="alert-triangle" /> Registry error
    </span>
  ) : registryUrls.length === 0 ? (
    <span className="kbadge kbadge-ghost">No registry configured</span>
  ) : (
    <div className="flex-sc gap-2">
      {capabilityUpgrades > 0 && (
        <span className="kbadge kbadge-info">
          <Icon name="refresh" /> {capabilityUpgrades} upgrade
          {capabilityUpgrades === 1 ? '' : 's'}
        </span>
      )}
      <span className="kbadge kbadge-ghost">
        {capabilityInstalled} installed · {capabilityAvailable} available
      </span>
    </div>
  );

  return (
    <div className="gutter">
      <PageHeading title="Space Settings" backTo="/" />

      <div className="flex-c-ss gap-4">
        <AccordionSection
          title="Bundle Setup"
          headerRight={setupHeaderBadge}
          initialOpen={!setupOk}
        >
          <p className="text-sm text-base-content/70 mb-3">
            Compose Portal expects these attribute definitions and kapps to
            exist on the space. Values may be left blank; the bundle falls
            through to its embedded defaults when a value isn't configured.
            Only missing <em>definitions</em> block the bundle from running
            normally.
          </p>

          <div className="overflow-x-auto rounded-box border border-base-300 bg-base-100 w-full">
            <table className="ktable w-full">
              <thead>
                <tr>
                  <th className="text-left p-3">Scope</th>
                  <th className="text-left p-3">Name</th>
                  <th className="text-left p-3 hidden md:table-cell">
                    Description
                  </th>
                  <th className="text-left p-3 w-0 whitespace-nowrap">
                    Status
                  </th>
                  <th className="text-right p-3 w-0 whitespace-nowrap" />
                </tr>
              </thead>
              <tbody>
                {setupRows.map(row => (
                  <tr key={rowKey(row)} className="border-t border-base-300">
                    <td className="p-3 whitespace-nowrap">{row.scopeLabel}</td>
                    <td className="p-3 font-medium whitespace-nowrap">
                      {row.name}
                    </td>
                    <td className="p-3 hidden md:table-cell text-sm text-base-content/70">
                      {row.description}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {renderStatusCell(row)}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      {renderDeployCell(row)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex-sc gap-3 mt-4 flex-wrap">
            <button
              type="button"
              className="kbtn kbtn-primary"
              onClick={() => runDeploy(missingItems)}
              disabled={missingItems.length === 0 || deploying}
            >
              {missingItems.length === 0
                ? 'All Items Defined'
                : deploying
                  ? 'Deploying…'
                  : `Deploy ${missingItems.length} Missing Item${missingItems.length === 1 ? '' : 's'}`}
            </button>
            {!setupOk && (
              <span className="text-sm text-base-content/70">
                {setupMissingRequired.length} required item
                {setupMissingRequired.length === 1 ? '' : 's'} still blocking
                setup.
              </span>
            )}
          </div>
        </AccordionSection>

        <AccordionSection
          title="Kapp Attributes"
          headerRight={kappAttrsHeaderBadge}
          initialOpen={false}
        >
          <p className="text-sm text-base-content/70 mb-3">
            Kapp-level attribute definitions the bundle reads when present.
            Optional — the bundle falls through to built-in views when not
            defined — but deploying them gives each kapp's admins a place to
            configure kapp-specific behavior.
          </p>

          {kappAttrGroups.length === 0 ? (
            <div className="kd-callout">
              No kapp attribute definitions are declared in the manifest yet.
            </div>
          ) : (
            <div className="flex-c-ss gap-4">
              {kappAttrGroups.map(({ attr, rows }) => (
                <div
                  key={attr.name}
                  className="flex-c-ss gap-2 p-4 rounded-box border border-base-300 bg-base-100 w-full"
                >
                  <div className="flex-sc gap-2 flex-wrap">
                    <span className="text-h4 font-semibold">{attr.name}</span>
                    {attr.required && (
                      <span className="kbadge kbadge-warning kbadge-sm">
                        Required
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-base-content/70">
                    {attr.description}
                  </p>
                  {rows.length === 0 ? (
                    <div className="text-sm text-base-content/60 italic">
                      No kapps found on this space.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-box border border-base-300 w-full">
                      <table className="ktable w-full">
                        <thead>
                          <tr>
                            <th className="text-left p-3">Kapp</th>
                            <th className="text-left p-3 w-0 whitespace-nowrap">
                              Status
                            </th>
                            <th className="text-right p-3 w-0 whitespace-nowrap" />
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(row => (
                            <tr
                              key={rowKey(row)}
                              className="border-t border-base-300"
                            >
                              <td className="p-3 font-medium whitespace-nowrap">
                                {row.kappSlug}
                              </td>
                              <td className="p-3 whitespace-nowrap">
                                {renderStatusCell(row)}
                              </td>
                              <td className="p-3 text-right whitespace-nowrap">
                                {renderDeployCell(row)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </AccordionSection>

        <AccordionSection
          title="Capabilities"
          headerRight={capabilitiesHeaderBadge}
          initialOpen={false}
        >
          <p className="text-sm text-base-content/70 mb-3">
            Capabilities are kapps (plus forms, task handlers, workflows, and
            datastores) that provide discrete, reusable functions — things
            like notification templates, scheduled jobs, or shared reference
            data. The bundle fetches the available list from each URL in the
            space attribute <code>Capability Registry URLs</code> and merges
            them; install status is detected from each kapp's{' '}
            <code>Capability Metadata</code> attribute.
          </p>
          <p className="text-xs text-base-content/60 italic mb-3">
            One-click install is not yet implemented. You can see what's
            available and whether it's already installed; the Install/Upgrade
            button will become functional in a later phase.
          </p>

          {registryUrls.length === 0 ? (
            <div className="kd-callout">
              No <code>Capability Registry URLs</code> configured. Add one or
              more URLs to the space attribute (e.g. your GitHub Pages
              registry index.json) in the Kinetic admin console.
            </div>
          ) : registry.loading ? (
            <Loading />
          ) : (
            <>
              {registry.errors.length > 0 && (
                <div className="kalert kalert-warning mb-3">
                  <Icon name="alert-triangle" />
                  <div>
                    <div className="font-semibold">
                      {registry.errors.length} fetch error
                      {registry.errors.length === 1 ? '' : 's'}
                    </div>
                    <div className="text-sm">
                      Some registries or manifests could not be retrieved. See
                      the browser console for details.
                    </div>
                  </div>
                </div>
              )}
              {capabilities.length === 0 ? (
                <div className="kd-callout">
                  No capabilities returned by the configured registr
                  {registryUrls.length === 1 ? 'y' : 'ies'}.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {capabilities.map(cap => (
                    <div
                      key={cap.id}
                      className="flex-c-ss gap-2 p-4 rounded-box border border-base-300 bg-base-100"
                    >
                      <div className="flex-sc gap-2 w-full">
                        <span className="text-h4 font-semibold flex-auto">
                          {cap.name}
                        </span>
                        {cap.installed ? (
                          cap.upgradeAvailable ? (
                            <span className="kbadge kbadge-info">
                              <Icon name="refresh" /> Upgrade
                            </span>
                          ) : (
                            <span className="kbadge kbadge-success">
                              <Icon name="check" /> Installed
                            </span>
                          )
                        ) : (
                          <span className="kbadge kbadge-ghost">Available</span>
                        )}
                      </div>
                      <p className="text-sm text-base-content/70">
                        {cap.description}
                      </p>
                      <div className="flex-sc gap-3 text-xs text-base-content/60">
                        <span>Version {cap.version}</span>
                        {cap.installed &&
                          cap.installedVersion &&
                          cap.installedVersion !== cap.version && (
                            <span>(installed: {cap.installedVersion})</span>
                          )}
                      </div>
                      <div className="flex-sc gap-2 mt-2 flex-wrap">
                        <button
                          type="button"
                          className="kbtn kbtn-sm kbtn-primary"
                          onClick={() => setInstalling(cap)}
                          disabled={cap.installed}
                          title={
                            cap.installed
                              ? cap.upgradeAvailable
                                ? 'Upgrade flow lands in a later phase'
                                : 'Capability is already installed'
                              : 'Install this capability'
                          }
                        >
                          {cap.installed
                            ? cap.upgradeAvailable
                              ? 'Upgrade (coming soon)'
                              : 'Installed'
                            : 'Install'}
                        </button>
                        {cap.installed && cap.manualSteps?.total > 0 && (
                          <button
                            type="button"
                            className={`kbtn kbtn-sm ${cap.manualSteps.pending > 0 ? 'kbtn-warning' : 'kbtn-ghost'}`}
                            onClick={() => setManagingSteps(cap)}
                            title="Open the manual-step checklist for this capability"
                          >
                            <Icon
                              name={
                                cap.manualSteps.pending > 0
                                  ? 'alert-triangle'
                                  : 'circle-check'
                              }
                              size={14}
                            />
                            Manual steps ({cap.manualSteps.completed}/
                            {cap.manualSteps.total})
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </AccordionSection>

        <AccordionSection
          title="Theming"
          headerRight={
            !themeDefined ? (
              <span className="kbadge kbadge-warning">
                <Icon name="alert-triangle" /> Attribute missing
              </span>
            ) : themeValueSet ? (
              <span className="kbadge kbadge-success">
                <Icon name="check" /> Customized
              </span>
            ) : (
              <span className="kbadge kbadge-ghost">Bundle defaults</span>
            )
          }
          initialOpen={false}
        >
          <p className="text-sm text-base-content/70 mb-3">
            Edit the space-level theme — colors, radius, and logo. The space
            theme is the baseline for the whole portal; per-kapp themes layer
            on top of it.
          </p>
          {!themeDefined ? (
            <div className="kd-callout">
              The <code>Theme</code> space attribute definition has not been
              deployed yet. Deploy it from the Bundle Setup section above, then
              return here to start editing.
            </div>
          ) : (
            <div className="flex-sc gap-3 flex-wrap">
              <Link to="/settings/space/theme" className="kbtn kbtn-primary">
                <Icon name="palette" /> Edit Space Theme
              </Link>
              <span className="text-sm text-base-content/70">
                Opens the full-page theme editor with a live preview.
              </span>
            </div>
          )}
        </AccordionSection>

        <AccordionSection title="More Settings" initialOpen={false}>
          <p className="text-sm text-base-content/70">
            Additional space-level configuration (kapp management, nav, etc.)
            will appear here as the bundle grows.
          </p>
        </AccordionSection>
      </div>

      {managingSteps && (
        <ManualStepsModal
          capability={managingSteps}
          installedKapp={managingSteps.installedKapp}
          onChange={() => refreshSpace()}
          onClose={() => setManagingSteps(null)}
        />
      )}

      {installing && (
        <InstallCapabilityModal
          capability={installing}
          onComplete={() => {
            // Refresh space so the new kapp + Capability Metadata show up
            // in the Capabilities accordion as Installed.
            refreshSpace();
          }}
          onClose={() => setInstalling(null)}
        />
      )}
    </div>
  );
};
