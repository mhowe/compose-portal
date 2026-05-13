import { useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { fetchForms } from '@kineticdata/react';
import { useData } from '../../helpers/hooks/useData.js';
import { ADMIN_KAPP_SLUG } from '../../helpers/constants.js';
import {
  FORM_DISPLAY_MODE_FULLSCREEN,
  readFormDisplayMode,
  readSpaceDefaultFormSlugs,
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
 * The space's 'Default Space Form Slug' attribute is treated as a
 * comma-separated, ordered list of candidate form slugs that live in the
 * admin kapp. The first slug whose form the user can see (and that is
 * Active or New) is rendered inline. If none resolve, fall through to the
 * built-in kapp-cards view (plus a Space Settings link for admins).
 *
 * Also shown as a fallback when the landing resolver at / cascades through
 * without a target kapp, or when setup is incomplete for a non-admin user.
 */
export const EmbeddedLanding = () => {
  const space = useSelector(state => state.app.space);
  const spaceAdmin = useSelector(state => !!state.app.profile?.spaceAdmin);
  const kapps = space?.kapps || [];
  const adminKappExists = kapps.some(k => k.slug === ADMIN_KAPP_SLUG);
  // Memoize the parsed slug list — `readSpaceDefaultFormSlugs` builds a fresh
  // array each call, which would otherwise re-trigger the params useMemo (and
  // useData's setState) on every render and loop indefinitely.
  const configuredFormSlugs = useMemo(
    () => readSpaceDefaultFormSlugs(space),
    [space],
  );

  // Query every candidate slug in a single round trip; the first slug from
  // the configured order that came back wins. Forms the user cannot see and
  // inactive forms are filtered server-side. attributesMap is included so
  // we can read Display Mode off the same fetch.
  const formCheckParams = useMemo(() => {
    if (configuredFormSlugs.length === 0 || !adminKappExists) return null;
    const slugClause = configuredFormSlugs
      .map(s => `slug = "${s}"`)
      .join(' OR ');
    return {
      kappSlug: ADMIN_KAPP_SLUG,
      q: `(${slugClause}) AND (status = "Active" OR status = "New")`,
      include: 'attributesMap',
      limit: configuredFormSlugs.length,
    };
  }, [configuredFormSlugs, adminKappExists]);
  const { initialized, loading, response } = useData(
    fetchForms,
    formCheckParams,
  );
  const returnedForms = response?.forms || [];
  const form = configuredFormSlugs
    .map(slug => returnedForms.find(f => f.slug === slug))
    .find(Boolean);
  const configuredFormSlug = form?.slug;
  const willRenderForm = !!form && adminKappExists;
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
