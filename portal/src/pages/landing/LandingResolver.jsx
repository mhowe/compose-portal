import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Navigate } from 'react-router-dom';
import { checkSetup, resolveLandingKapp } from '../../helpers/setup.js';
import { Loading } from '../../components/states/Loading.jsx';
import { EmbeddedLanding } from './EmbeddedLanding.jsx';

/**
 * Renders at `/`. Resolves where the user should land using the cascade
 * defined in helpers/setup.js, then redirects with `replace` so the browser
 * history reflects the resolved URL.
 *
 * Cascade:
 *   0. Setup incomplete? admin → /settings/space; non-admin → <EmbeddedLanding/>
 *   1. User profile 'Default Kapp Slug' (if set + kapp accessible) → /kapps/:slug
 *   2. Space 'Default Kapp Slug' (if set + kapp accessible) → /kapps/:slug
 *   3. Neither → <EmbeddedLanding/>
 *
 * Form rendering is the kapp page's job: KappDefaultPage at /kapps/:slug
 * reads the kapp's 'Default Form Slug' and renders the form inline (or the
 * forms table when no form is configured). This resolver therefore only
 * cares which kapp to route to — it does not redirect to form URLs.
 */
export const LandingResolver = () => {
  const space = useSelector(state => state.app.space);
  const profile = useSelector(state => state.app.profile);
  const spaceAdmin = profile?.spaceAdmin;

  const setup = useMemo(() => checkSetup(space), [space]);
  const target = useMemo(
    () => (space && profile ? resolveLandingKapp(space, profile) : null),
    [space, profile],
  );

  if (!space || !profile) return <Loading />;

  if (!setup.ok) {
    if (spaceAdmin) return <Navigate to="/settings/space" replace />;
    return <EmbeddedLanding />;
  }

  if (!target) return <EmbeddedLanding />;

  return <Navigate to={`/kapps/${target.slug}`} replace />;
};
