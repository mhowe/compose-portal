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
import { checkSetup } from '../../helpers/setup.js';
import { appActions } from '../../helpers/state.js';
import { toastError, toastSuccess } from '../../helpers/toasts.js';

const SCOPE_TO_ATTRIBUTE_TYPE = {
  space: 'spaceAttributeDefinitions',
  userProfile: 'userProfileAttributeDefinitions',
};

// Must match the include list in App.jsx so post-deploy refresh populates the
// same fields the setup check and landing resolver rely on.
const SPACE_INCLUDE =
  'attributesMap,kapps,kapps.attributesMap,spaceAttributeDefinitions,kappAttributeDefinitions,userProfileAttributeDefinitions';

/**
 * Deploys a single missing manifest item and returns a result descriptor.
 * Never throws — failures are returned as { ok: false, item, error }.
 */
const deployOne = async item => {
  try {
    if (item.kind === 'kapp') {
      const { error } = await createKapp({
        kapp: {
          slug: item.name,
          // Title Case the slug as a reasonable default display name.
          name: item.name.charAt(0).toUpperCase() + item.name.slice(1),
        },
      });
      if (error) return { ok: false, item, error };
      return { ok: true, item };
    }

    const attributeType = SCOPE_TO_ATTRIBUTE_TYPE[item.scope];
    if (!attributeType) {
      return {
        ok: false,
        item,
        error: { message: `Unknown scope: ${item.scope}` },
      };
    }
    const { error } = await createAttributeDefinition({
      attributeType,
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
 * Today it:
 *   1. Shows setup status: for each required attribute definition / kapp the
 *      bundle expects, whether it exists on the live space.
 *   2. Runs Deploy — creates missing attribute definitions and the admin kapp
 *      via the Kinetic SDK. Handles each item independently so one failure
 *      doesn't block the others; re-fetches the space record on completion.
 *
 * More capabilities (defining additional kapps, configuring themes at the
 * space level, managing nav) land here over time.
 */
export const SpaceSettings = () => {
  const space = useSelector(state => state.app.space);
  const spaceAdmin = useSelector(state => !!state.app.profile?.spaceAdmin);

  const [deploying, setDeploying] = useState(false);
  const setup = useMemo(() => checkSetup(space), [space]);

  if (!spaceAdmin) return <Navigate to="/" replace />;

  const spaceDefs = new Set(
    (space?.spaceAttributeDefinitions || []).map(d => d.name),
  );
  const userDefs = new Set(
    (space?.userProfileAttributeDefinitions || []).map(d => d.name),
  );
  const kappSlugs = new Set((space?.kapps || []).map(k => k.slug));

  const manifestKappRow = setup.missing.find(m => m.kind === 'kapp');
  const rows = [
    ...BUNDLE_MANIFEST.space.attributes.map(a => ({
      scope: 'Space',
      kind: 'attribute',
      ...a,
      present: spaceDefs.has(a.name),
    })),
    ...BUNDLE_MANIFEST.userProfile.attributes.map(a => ({
      scope: 'User Profile',
      kind: 'attribute',
      ...a,
      present: userDefs.has(a.name),
    })),
    // Admin kapp row: surfaced from the setup check's kapp-missing entry when
    // present, or synthesized here when the kapp exists (nothing in the
    // manifest file enumerates it today).
    manifestKappRow
      ? { scope: 'Kapp', ...manifestKappRow, present: false }
      : {
          scope: 'Kapp',
          kind: 'kapp',
          name: 'admin',
          description:
            'Hosts bundle configuration forms referenced by space attributes like Default Space Form Slug.',
          present: kappSlugs.has('admin'),
        },
  ];

  const onDeployMissing = async () => {
    if (setup.missing.length === 0) return;
    setDeploying(true);

    const results = await Promise.all(setup.missing.map(deployOne));
    const succeeded = results.filter(r => r.ok);
    const failed = results.filter(r => !r.ok);

    // Log failures so an admin can inspect messages in the browser console.
    for (const f of failed) {
      console.error('Deploy failed for', f.item, f.error);
    }

    // Refresh space data so the table updates regardless of outcome.
    try {
      const response = await fetchSpace({ include: SPACE_INCLUDE });
      appActions.setSpace(response);
    } catch (error) {
      console.error('Failed to refresh space after deploy', error);
    }

    if (failed.length === 0) {
      toastSuccess({
        title: 'Deploy complete',
        description: `Created ${succeeded.length} item${succeeded.length === 1 ? '' : 's'}.`,
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

    setDeploying(false);
  };

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
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr
                  key={`${r.scope}:${r.name}`}
                  className="border-t border-base-300"
                >
                  <td className="p-3 whitespace-nowrap">{r.scope}</td>
                  <td className="p-3 font-medium whitespace-nowrap">
                    {r.name}
                  </td>
                  <td className="p-3 hidden md:table-cell text-sm text-base-content/70">
                    {r.description}
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    {r.present ? (
                      <span className="kbadge kbadge-success">
                        <Icon name="check" /> Defined
                      </span>
                    ) : (
                      <span className="kbadge kbadge-warning">
                        <Icon name="alert-triangle" /> Missing
                      </span>
                    )}
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
            onClick={onDeployMissing}
            disabled={setup.ok || deploying}
          >
            {setup.ok
              ? 'All Required Items Present'
              : deploying
                ? 'Deploying…'
                : `Deploy ${setup.missing.length} Missing Item${setup.missing.length === 1 ? '' : 's'}`}
          </button>
        </div>
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
