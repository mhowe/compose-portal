import { useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { fetchForms } from '@kineticdata/react';
import { useData } from '../../helpers/hooks/useData.js';
import { ADMIN_KAPP_SLUG } from '../../helpers/constants.js';
import {
  FORM_DISPLAY_MODE_FULLSCREEN,
  readFormDisplayMode,
  readSpaceDefaultProfileFormSlugs,
} from '../../helpers/setup.js';
import { layoutActions } from '../../helpers/state.js';
import { useInsideContainer } from '../../helpers/container-scope.js';
import { Loading } from '../../components/states/Loading.jsx';
import { KineticForm } from '../../components/kinetic-form/KineticForm.jsx';
import { Profile } from './Profile.jsx';

/**
 * /profile resolver.
 *
 * The space's 'Default Profile Form Slug' attribute is treated as a
 * comma-separated, ordered list of candidate form slugs that live in the
 * admin kapp. The first slug whose form the user can see (and that is
 * Active or New) is rendered inline in place of the built-in profile UI.
 * If none resolve, fall through to the bundle's standard Profile page.
 *
 * Audience routing happens via slug order plus Form security policies —
 * not via per-user attributes. List the most-restricted form first
 * (e.g. 'vip-profile, standard-profile'); users who fail the policy on
 * the earlier candidate fall through to the next.
 */
export const ProfileResolver = () => {
  const space = useSelector(state => state.app.space);
  const kapps = space?.kapps || [];
  const adminKappExists = kapps.some(k => k.slug === ADMIN_KAPP_SLUG);
  // Memoize the parsed slug list — readSpaceDefaultProfileFormSlugs builds
  // a fresh array each call, which would otherwise re-trigger the params
  // useMemo (and useData's setState) on every render and loop indefinitely.
  const configuredFormSlugs = useMemo(
    () => readSpaceDefaultProfileFormSlugs(space),
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
  // restore on unmount so navigating away from a fullscreen profile brings
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

  return <Profile />;
};
