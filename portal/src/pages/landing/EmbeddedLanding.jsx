import { useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { fetchForms } from '@kineticdata/react';
import { useData } from '../../helpers/hooks/useData.js';
import { ADMIN_KAPP_SLUG } from '../../helpers/constants.js';
import {
  FORM_DISPLAY_MODE_FULLSCREEN,
  readFormDisplayMode,
  readSpaceDefaultFormSlug,
} from '../../helpers/setup.js';
import { layoutActions } from '../../helpers/state.js';
import { useInsideContainer } from '../../helpers/container-scope.js';
import { Icon } from '../../atoms/Icon.jsx';
import { PageHeading } from '../../components/PageHeading.jsx';
import { Loading } from '../../components/states/Loading.jsx';
import { KineticForm } from '../../components/kinetic-form/KineticForm.jsx';

/**
 * Space landing at /kapps.
 *
 * If the space's 'Default Space Form Slug' attribute is set and the form
 * exists in the admin kapp, render it inline here. Otherwise fall through to
 * the built-in kapp-cards view (plus a Space Settings link for admins).
 *
 * Also shown as a fallback when the landing resolver at / cascades through
 * without a target kapp, or when setup is incomplete for a non-admin user.
 */
export const EmbeddedLanding = () => {
  const space = useSelector(state => state.app.space);
  const spaceAdmin = useSelector(state => !!state.app.profile?.spaceAdmin);
  const kapps = space?.kapps || [];
  const adminKappExists = kapps.some(k => k.slug === ADMIN_KAPP_SLUG);
  const configuredFormSlug = readSpaceDefaultFormSlug(space);

  // Confirm the configured form actually exists in the admin kapp. If it
  // doesn't, fall through to the built-in view rather than letting CoreForm
  // render an error. We also pull attributesMap so we can read Display Mode
  // off the same fetch.
  const formCheckParams = useMemo(
    () =>
      configuredFormSlug && adminKappExists
        ? {
            kappSlug: ADMIN_KAPP_SLUG,
            q: `slug = "${configuredFormSlug}"`,
            include: 'attributesMap',
            limit: 1,
          }
        : null,
    [configuredFormSlug, adminKappExists],
  );
  const { initialized, loading, response } = useData(
    fetchForms,
    formCheckParams,
  );
  const form = response?.forms?.[0];
  const formExists = !!form;
  const willRenderForm =
    configuredFormSlug && adminKappExists && formExists;
  const isFullscreen =
    willRenderForm &&
    readFormDisplayMode(form) === FORM_DISPLAY_MODE_FULLSCREEN;

  // Toggle the bundle's chrome based on the resolved display mode. Always
  // restore on unmount so navigating away from a fullscreen landing brings
  // the rest of the portal's chrome back. Skipped when this page is rendered
  // inside a BundleContainer — chrome is owned by whatever page hosts that
  // container, and an inner form must not flip global chrome state.
  const insideContainer = useInsideContainer();
  useEffect(() => {
    if (insideContainer) return;
    layoutActions.setChromeHidden(isFullscreen);
    return () => layoutActions.setChromeHidden(false);
  }, [isFullscreen, insideContainer]);

  if (formCheckParams && (!initialized || loading)) return <Loading />;

  // Render the custom form inline when configured and valid.
  if (willRenderForm) {
    return isFullscreen ? (
      <KineticForm kappSlug={ADMIN_KAPP_SLUG} formSlug={configuredFormSlug} />
    ) : (
      <div className="gutter">
        <KineticForm
          kappSlug={ADMIN_KAPP_SLUG}
          formSlug={configuredFormSlug}
        />
      </div>
    );
  }

  // Fallback: built-in kapp cards.
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
