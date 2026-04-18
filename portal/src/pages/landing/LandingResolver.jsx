import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Navigate } from 'react-router-dom';
import { fetchForms, fetchKapp } from '@kineticdata/react';
import { useData } from '../../helpers/hooks/useData.js';
import {
  checkSetup,
  readKappDefaultFormSlug,
  resolveLandingKapp,
} from '../../helpers/setup.js';
import { Loading } from '../../components/states/Loading.jsx';
import { EmbeddedLanding } from './EmbeddedLanding.jsx';

/**
 * Renders at `/`. Resolves where the user should actually land using the
 * cascade defined in helpers/setup.js, then redirects with `replace` so the
 * browser history reflects the resolved URL.
 *
 * Cascade:
 *   0. Setup incomplete? admin → /settings/space; non-admin → embedded landing
 *   1. User profile 'Default Kapp Slug' attribute (if set + kapp accessible)
 *   2. Space 'Default Kapp Slug' attribute (if set + kapp accessible)
 *   3. Neither → embedded landing
 *
 * Within the resolved kapp:
 *   - Kapp 'Default Form Slug' attribute set and form exists → that form
 *   - Otherwise → /kapps/:slug (kapp default page)
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

  // Fetch the resolved target kapp so we can read its Default Form Slug.
  // Only when setup is ok and we have a target to resolve.
  const kappParams = useMemo(
    () =>
      setup.ok && target
        ? { kappSlug: target.slug, include: 'attributesMap' }
        : null,
    [setup.ok, target],
  );
  const {
    initialized: kappInit,
    loading: kappLoading,
    response: kappData,
  } = useData(fetchKapp, kappParams);
  const targetKapp = kappInit && !kappLoading ? kappData?.kapp : null;
  const formSlug = targetKapp ? readKappDefaultFormSlug(targetKapp) : undefined;

  // Confirm the referenced form actually exists in the target kapp. If the
  // query returns zero results, fall through to the kapp default page per
  // edge case 3.
  const formParams = useMemo(
    () =>
      target && formSlug
        ? { kappSlug: target.slug, q: `slug = "${formSlug}"`, limit: 1 }
        : null,
    [target, formSlug],
  );
  const {
    initialized: formInit,
    loading: formLoading,
    response: formData,
  } = useData(fetchForms, formParams);

  if (!space || !profile) return <Loading />;

  if (!setup.ok) {
    if (spaceAdmin) return <Navigate to="/settings/space" replace />;
    return <EmbeddedLanding />;
  }

  if (!target) return <EmbeddedLanding />;

  if (kappParams && (!kappInit || kappLoading)) return <Loading />;

  if (!formSlug) {
    return <Navigate to={`/kapps/${target.slug}`} replace />;
  }

  if (formParams && (!formInit || formLoading)) return <Loading />;

  const formExists = (formData?.forms || []).length > 0;
  if (!formExists) {
    return <Navigate to={`/kapps/${target.slug}`} replace />;
  }

  return (
    <Navigate to={`/kapps/${target.slug}/forms/${formSlug}`} replace />
  );
};
