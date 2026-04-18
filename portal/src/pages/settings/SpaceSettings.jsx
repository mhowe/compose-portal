import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Navigate } from 'react-router-dom';
import { PageHeading } from '../../components/PageHeading.jsx';
import { Icon } from '../../atoms/Icon.jsx';
import { BUNDLE_MANIFEST } from '../../helpers/bundle-manifest.js';
import { checkSetup } from '../../helpers/setup.js';

/**
 * Space Settings — admin-only page that will eventually let space admins
 * deploy and configure bundle features. Today it does two things:
 *
 *   1. Shows setup status: for each required attribute definition the bundle
 *      expects, whether it exists on the live space.
 *   2. Renders a Deploy button stub — clicking it will (in a future pass)
 *      create the missing attribute definitions via the Kinetic SDK.
 *
 * More capabilities (defining additional kapps, configuring themes at the
 * space level, managing nav) land here over time. Keep the visual simple
 * for now; we'll refine when the feature set grows.
 */
export const SpaceSettings = () => {
  const space = useSelector(state => state.app.space);
  const spaceAdmin = useSelector(state => !!state.app.profile?.spaceAdmin);

  const setup = useMemo(() => checkSetup(space), [space]);

  if (!spaceAdmin) return <Navigate to="/" replace />;

  const spaceDefs = new Set(
    (space?.spaceAttributeDefinitions || []).map(d => d.name),
  );
  const userDefs = new Set(
    (space?.userProfileAttributeDefinitions || []).map(d => d.name),
  );

  const rows = [
    ...BUNDLE_MANIFEST.space.attributes.map(a => ({
      scope: 'Space',
      ...a,
      present: spaceDefs.has(a.name),
    })),
    ...BUNDLE_MANIFEST.userProfile.attributes.map(a => ({
      scope: 'User Profile',
      ...a,
      present: userDefs.has(a.name),
    })),
  ];

  const onDeployMissing = () => {
    // TODO: implement via Kinetic SDK. Options we'll explore:
    //   - updateSpace with spaceAttributeDefinitions: [...existing, ...missing]
    //   - dedicated createSpaceAttributeDefinition / createUserProfileAttributeDefinition
    //     functions from @kineticdata/react if they exist
    // Until then, instruct the admin to define these manually in the Kinetic
    // admin console.
    alert(
      'Deploy is not yet wired up. For now, create the missing attribute ' +
        'definitions in the Kinetic admin console (Space → Attribute ' +
        'Definitions and Users → Profile Attribute Definitions).',
    );
  };

  return (
    <div className="gutter">
      <PageHeading title="Space Settings" backTo="/" />

      <section className="flex-c-ss gap-3 mb-8">
        <h2 className="text-h3 font-semibold">Bundle Setup</h2>
        <p className="text-sm text-base-content/70 max-w-prose">
          Compose Portal expects these attribute definitions to exist on the
          space. Values may be left blank; the bundle falls through to its
          embedded defaults when a value isn't configured. Only missing{' '}
          <em>definitions</em> block the bundle from running normally.
        </p>

        <div className="overflow-x-auto rounded-box border border-base-300 bg-base-100 w-full">
          <table className="ktable w-full">
            <thead>
              <tr>
                <th className="text-left p-3">Scope</th>
                <th className="text-left p-3">Attribute</th>
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
            disabled={setup.ok}
          >
            {setup.ok
              ? 'All Required Definitions Present'
              : 'Deploy Missing Definitions'}
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
