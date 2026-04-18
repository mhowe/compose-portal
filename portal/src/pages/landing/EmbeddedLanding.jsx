import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Icon } from '../../atoms/Icon.jsx';
import { PageHeading } from '../../components/PageHeading.jsx';

/**
 * Bundle-default landing page. Shown when:
 *   - Neither user profile nor space has a 'Default Kapp Slug' value, OR
 *   - Setup is incomplete and the current user is not a space admin.
 *
 * Renders a card per kapp the user can see, plus a space-settings link for
 * admins. Intentionally plain — refine the visual treatment later.
 */
export const EmbeddedLanding = () => {
  const space = useSelector(state => state.app.space);
  const spaceAdmin = useSelector(state => !!state.app.profile?.spaceAdmin);
  const kapps = space?.kapps || [];

  return (
    <div className="gutter">
      <PageHeading title={space?.name || 'Portal'} backTo={null} />

      {kapps.length === 0 ? (
        <div className="kd-callout">
          No kapps are available to you right now.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {kapps.map(kapp => (
            <Link
              key={kapp.slug}
              to={`/kapps/${kapp.slug}`}
              className="flex-c-ss gap-2 p-6 rounded-box bg-base-100 border border-base-300 hover:border-primary hover:shadow-md transition"
            >
              <div className="text-h3 font-semibold">{kapp.name}</div>
              {kapp.description && (
                <div className="text-sm text-base-content/70">
                  {kapp.description}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      {spaceAdmin && (
        <div className="mt-8 flex-sc gap-3">
          <Link
            to="/settings/space"
            className="kbtn kbtn-outline kbtn-primary"
          >
            <Icon name="settings" />
            Space Settings
          </Link>
        </div>
      )}
    </div>
  );
};
