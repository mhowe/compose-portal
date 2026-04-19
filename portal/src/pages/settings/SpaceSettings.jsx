import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { Navigate } from 'react-router-dom';
import {
  createAttributeDefinition,
  createKapp,
  fetchSpace,
} from '@kineticdata/react';
import { PageHeading } from '../../components/PageHeading.jsx';
import { Icon } from '../../atoms/Icon.jsx';
import { BUNDLE_MANIFEST } from '../../helpers/bundle-manifest.js';
import { getManifestStatus } from '../../helpers/setup.js';
import { appActions } from '../../helpers/state.js';
import { toastError, toastSuccess } from '../../helpers/toasts.js';

// Must match the include list in App.jsx so post-deploy refresh populates the
// same fields the setup check + landing resolver + Space Settings rely on.
const SPACE_INCLUDE =
  'attributesMap,kapps,kapps.attributesMap,kapps.kappAttributeDefinitions,spaceAttributeDefinitions,userProfileAttributeDefinitions';

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
        allowsMultiple: false,
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
 * features.
 *
 * Shows two tables:
 *   1. Bundle Setup — space + user-profile attribute definitions + admin kapp.
 *      All required; missing items block setup.ok.
 *   2. Kapp Attributes — one table per kapp attribute in the manifest, with
 *      a row per kapp showing definition status. Today this surfaces
 *      'Default Form Slug' across every kapp. Rows are optional (not
 *      required for setup.ok) but can still be deployed individually or via
 *      the top-level Deploy button.
 *
 * Deploy actions:
 *   - Top-level "Deploy Missing Items" deploys every item showing as missing
 *     (required + optional) in one batch.
 *   - Per-row Deploy deploys just that one item.
 * Both re-fetch the space on completion so the UI updates without a reload.
 */
export const SpaceSettings = () => {
  const space = useSelector(state => state.app.space);
  const spaceAdmin = useSelector(state => !!state.app.profile?.spaceAdmin);

  const [deploying, setDeploying] = useState(false);
  // Item keys currently being deployed (either via top button or per-row).
  // Used to disable the buttons mid-flight.
  const [busyKeys, setBusyKeys] = useState(() => new Set());

  const status = useMemo(() => getManifestStatus(space), [space]);

  if (!spaceAdmin) return <Navigate to="/" replace />;

  // Stable identifier for a row — also used as React key.
  const rowKey = row =>
    `${row.scope}:${row.kappSlug || ''}:${row.kind}:${row.name}`;

  const setupRows = status.filter(r => r.scope !== 'kapp-attribute');
  const missingItems = status.filter(r => !r.present);
  const missingRequired = missingItems.filter(r => r.required);
  const setupOk = missingRequired.length === 0;

  const refreshSpace = async () => {
    try {
      const response = await fetchSpace({ include: SPACE_INCLUDE });
      appActions.setSpace(response);
    } catch (error) {
      console.error('Failed to refresh space after deploy', error);
    }
  };

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

  // Group kapp-attribute rows by attribute name for display.
  const kappAttrGroups = BUNDLE_MANIFEST.kapp.attributes.map(attr => ({
    attr,
    rows: status.filter(
      r => r.scope === 'kapp-attribute' && r.name === attr.name,
    ),
  }));

  return (
    <div className="gutter">
      <PageHeading title="Space Settings" backTo="/" />

      <section className="flex-c-ss gap-3 mb-8">
        <h2 className="text-h3 font-semibold">Bundle Setup</h2>
        <p className="text-sm text-base-content/70 max-w-prose">
          Compose Portal expects these attribute definitions and kapps to exist
          on the space. Values may be left blank; the bundle falls through to
          its embedded defaults when a value isn't configured. Only missing{' '}
          <em>definitions</em> block the bundle from running normally.
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
                <th className="text-left p-3 w-0 whitespace-nowrap">Status</th>
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

        <div className="flex-sc gap-3 mt-2">
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
              {missingRequired.length} required item
              {missingRequired.length === 1 ? '' : 's'} still blocking setup.
            </span>
          )}
        </div>
      </section>

      <section className="flex-c-ss gap-3 mb-8">
        <h2 className="text-h3 font-semibold">Kapp Attributes</h2>
        <p className="text-sm text-base-content/70 max-w-prose">
          Kapp-level attribute definitions the bundle reads when present.
          These are optional — the bundle falls through to built-in views
          when not defined — but deploying them gives each kapp's admins a
          place to configure kapp-specific behavior.
        </p>

        {kappAttrGroups.length === 0 ? (
          <div className="kd-callout">
            No kapp attribute definitions are declared in the manifest yet.
          </div>
        ) : (
          kappAttrGroups.map(({ attr, rows }) => (
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
              <p className="text-sm text-base-content/70 max-w-prose">
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
          ))
        )}
      </section>

      <section className="flex-c-ss gap-3 mb-8">
        <h2 className="text-h3 font-semibold">More Settings</h2>
        <p className="text-sm text-base-content/70 max-w-prose">
          Additional space-level configuration (theming, kapp management, nav,
          etc.) will appear here as the bundle grows.
        </p>
      </section>
    </div>
  );
};
