import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';
import t from 'prop-types';
import clsx from 'clsx';
import { fetchProfile, fetchSpace } from '@kineticdata/react';
import { Toaster } from './atoms/Toaster.jsx';
import { Loading } from './components/states/Loading.jsx';
import { Error } from './components/states/Error.jsx';
import { closeConfirm } from './helpers/confirm.js';
import {
  appActions,
  selectCurrentKapp,
  SPACE_INCLUDE,
  themeActions,
} from './helpers/state.js';
import { clearToasts } from './helpers/toasts.js';
import useRouteChange from './helpers/hooks/useRouteChange.js';
import { PrivateRoutes } from './pages/PrivateRoutes.jsx';
import { PublicRoutes } from './pages/PublicRoutes.jsx';
import { Login } from './pages/login/Login.jsx';
import { ConfirmationModal } from './components/confirm/ConfirmationModal.jsx';
import { ModalSlot } from './components/modal/ModalSlot.jsx';
import { NavBridge } from './components/NavBridge.jsx';
import { useData } from './helpers/hooks/useData.js';
import { loadBundleFunctions } from './helpers/bundle-functions.js';

export const App = ({
  initialized,
  loggedIn,
  loginProps,
  timedOut,
  serverError,
}) => {
  // Get redux theme state
  const { css: themeCSS } = useSelector(state => state.theme);
  // Update the styles if there is a theme set
  useEffect(() => {
    if (themeCSS) {
      // If themeCSS exists, create a stylesheet and set themeCSS as the content
      const cssSheet = new CSSStyleSheet();
      cssSheet.replace(themeCSS);
      // Set this new constructed stylesheet to be used by the page
      document.adoptedStyleSheets = [cssSheet];
    }
  }, [themeCSS]);

  // Get redux app state
  const { authenticated, kappSlug, error, space, profile } = useSelector(
    state => state.app,
  );
  // The current kapp is the cached record for the current global kappSlug.
  // Reads through selectCurrentKapp so per-scope context can layer in later
  // without each consumer re-wiring.
  const kapp = useSelector(selectCurrentKapp);

  // Track the kapp slug from the URL so the global current-kapp context
  // follows the user as they navigate between kapps, rather than being pinned
  // to whatever the space's default landing kapp is. The space-default still
  // drives initial landing (the fallback in setSpace), and the user can land
  // on a non-kapp
  // route (e.g. /profile) where this effect doesn't override.
  const location = useLocation();
  const urlKappSlug = useMemo(() => {
    const m = location.pathname.match(/^\/kapps\/([^/?#]+)/);
    return m ? m[1] : null;
  }, [location.pathname]);
  useEffect(() => {
    if (urlKappSlug && urlKappSlug !== kappSlug) {
      appActions.setKappSlug(urlKappSlug);
    }
  }, [urlKappSlug, kappSlug]);

  // Set an `authenticated` flag in global state that is synced to the loggedIn
  // prop, and can be used in the app to determine if the user is authenticated
  useEffect(() => {
    if (authenticated !== loggedIn) {
      appActions.setAuthenticated(loggedIn);
    }
  }, [authenticated, loggedIn]);

  // Fetch space data. We'll assume that the space record is available publicly
  // so we can get the config data stored in space attributes. The authenticated
  // include uses the shared SPACE_INCLUDE constant, which nests full kapp
  // detail (attributes, categories, categorizations) under kapps.* — one
  // round trip primes state.app.kappCache for every kapp the user can see.
  const spaceParams = useMemo(
    () =>
      initialized
        ? loggedIn
          ? { include: SPACE_INCLUDE }
          : { public: true, include: 'attributesMap,kapps' }
        : null,
    [initialized, loggedIn],
  );
  const {
    initialized: spaceInit,
    loading: spaceLoading,
    response: spaceData,
  } = useData(fetchSpace, spaceParams);
  // Set the space data into redux
  useEffect(() => {
    if (spaceInit && !spaceLoading) {
      appActions.setSpace(spaceData);
    }
  }, [spaceInit, spaceLoading, spaceData]);

  // Fetch profile data once the user is logged in
  const profileParams = useMemo(
    () =>
      initialized && loggedIn
        ? { include: 'profileAttributesMap,attributesMap,memberships' }
        : null,
    [initialized, loggedIn],
  );
  const {
    initialized: profileInit,
    loading: profileLoading,
    response: profileData,
  } = useData(fetchProfile, profileParams);
  // Set the profile data into redux
  useEffect(() => {
    if (profileInit && !profileLoading) {
      appActions.setProfile(profileData);
    }
  }, [profileInit, profileLoading, profileData]);

  // Compile the customer-defined bundle.functions registry once the user is
  // authenticated and the space record has loaded. Blocks PrivateRoutes mount
  // (and therefore any CoreForm rendering) so form bundle code can assume
  // `bundle.functions.X` is defined when it runs. Silent no-op when the
  // backing form isn't installed. See helpers/bundle-functions.js.
  const [functionsReady, setFunctionsReady] = useState(false);
  useEffect(() => {
    if (loggedIn && space && !functionsReady) {
      loadBundleFunctions().finally(() => setFunctionsReady(true));
    }
  }, [loggedIn, space, functionsReady]);

  // The theme cascade is URL-driven, not slug-driven. state.app.kappSlug is
  // sticky on purpose (so /profile, /settings, etc. still know which kapp the
  // user just came from), but the page should only *wear* a kapp's theme when
  // the user is actually under /kapps/:slug. Resolving the theme target off
  // urlKappSlug means navigating back to /kapps drops the kapp layer and the
  // space theme takes over.
  const themeKapp = useSelector(state =>
    urlKappSlug ? state.app.kappCache?.[urlKappSlug] || null : null,
  );
  useEffect(() => {
    themeActions.setTheme({ space, kapp: themeKapp });
  }, [space, themeKapp]);

  // Clear toasts and confirmation modals whenever we change routes
  useRouteChange((pathname, state) => {
    if (!state?.persistToasts) {
      clearToasts();
    }
    closeConfirm();
  }, []);

  return (
    <>
      <div className="flex-c-st flex-auto overflow-auto">
        {/* Header element where we will render headers via a portal */}
        <header id="app-header" className="flex-none" />

        <main
          id="app-main"
          className={clsx(
            'flex-auto relative overflow-y-auto overflow-x-hidden scrollbar',
          )}
        >
          {serverError || error ? (
            // If an error occurred during auth or fetching app data, show an
            // error screen
            <Error error={serverError || error} header={true} />
          ) : !initialized || !space ? (
            // If auth isn't initialized or space record isn't fetched, show a
            // loading screen
            <Loading />
          ) : !loggedIn ? (
            // If the user is not logged in, render the public routes, which
            // will default to rendering the login page for all unmatched routes
            <PublicRoutes loginProps={loginProps} />
          ) : kapp && profile && functionsReady ? (
            // If the user is logged in and kapp and profile data has been
            // fetched, render the private routes, and render the Login
            // component in a modal if auth times out
            <>
              <PrivateRoutes />
              {timedOut && (
                <dialog open>
                  <Login {...loginProps} />
                </dialog>
              )}
            </>
          ) : (
            <Loading />
          )}

          {/* Toast container */}
          <Toaster />
        </main>

        {/* Footer element where we will render footers via a portal */}
        <footer id="app-footer" />
      </div>

      {/* Panels element where we will render panels via a portal */}
      <div id="app-panels" />

      {/* Global confirmation modal */}
      <ConfirmationModal />

      {/* Programmatic modal stack — driven by bundle.utils.openModal and by
          chrome widgets configured with target: 'modal'. */}
      <ModalSlot />

      {/* Bridges React Router's navigate into bundle.utils.navigate so form
          scripts outside the React tree can do SPA navigations. */}
      <NavBridge />
    </>
  );
};

App.propTypes = {
  initialized: t.bool,
  loggedIn: t.bool,
  loginProps: t.object,
  timedOut: t.bool,
  serverError: t.object,
};
