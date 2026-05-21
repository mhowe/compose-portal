import { Route, Routes } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Header } from '../components/header/Header.jsx';
import { SearchModal } from '../components/search/SearchModal.jsx';
import { Theme } from './theme/index.jsx';
import { BundleRoutes } from './BundleRoutes.jsx';

export const PrivateRoutes = () => {
  const spaceAdmin = useSelector(state => state.app.profile?.spaceAdmin);
  return (
    <Routes>
      {/* Theme editor — full-page (no header chrome) for both targets.
          Both routes are admin-only; SpaceSettings provides the entry point
          for /settings/space/theme. /theme remains as the legacy entry point
          for the portal kapp's theme until the future Kapp Settings page
          provides per-kapp routing. */}
      {spaceAdmin && (
        <Route
          path="/settings/space/theme"
          element={<Theme target="space" />}
        />
      )}
      {spaceAdmin && (
        <Route
          path="/kapps/:kappSlug/settings/theme"
          element={<Theme />}
        />
      )}
      {spaceAdmin && <Route path="/theme" element={<Theme />} />}

      {/* Other Routes*/}
      <Route
        path="/*"
        element={
          <>
            {/* Shared header */}
            <Header />

            {/* Bundle's page routes (also used inside BundleContainer widget
                so any page reachable here is reachable from a container) */}
            <BundleRoutes />

            {/* Global search modal */}
            <SearchModal />
          </>
        }
      />
    </Routes>
  );
};
