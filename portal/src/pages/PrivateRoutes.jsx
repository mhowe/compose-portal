import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Home } from './home/Home.jsx';
import { Actions } from './tickets/actions/Actions.jsx';
import { Requests } from './tickets/requests/Requests.jsx';
import { Form } from './forms/Form.jsx';
import { Profile } from './profile/Profile.jsx';
import { SettingsRouting } from './settings/index.jsx';
import { Header } from '../components/header/Header.jsx';
import { SearchModal } from '../components/search/SearchModal.jsx';
import { Theme } from './theme/index.jsx';
import { LandingResolver } from './landing/LandingResolver.jsx';
import { KappDefaultPage } from './kapp/KappDefaultPage.jsx';

const Redirect = ({ to }) => {
  const params = useParams();
  return (
    <Navigate
      to={(typeof to === 'function' ? to(params) : to) || '/'}
      replace={true}
    />
  );
};

export const PrivateRoutes = () => {
  const spaceAdmin = useSelector(state => state.app.profile?.spaceAdmin);
  return (
    <Routes>
      {/* Theme page */}
      {spaceAdmin && <Route path="/theme" element={<Theme />} />}

      {/* Other Routes*/}
      <Route
        path="/*"
        element={
          <>
            {/* Shared header */}
            <Header />

            <Routes>
              {/* Canonical route for submissions */}
              <Route
                path="/kapps/:kappSlug/forms/:formSlug/submissions/:submissionId"
                element={
                  <Redirect
                    to={params =>
                      `/kapps/${params.kappSlug}/forms/${params.formSlug}/${params.submissionId}`
                    }
                  />
                }
              />
              {/* Canonical route for forms */}
              <Route
                path="/kapps/:kappSlug/forms/:formSlug/:submissionId?"
                element={<Form />}
              />
              {/* Bundle-default kapp page (forms table). Admins can override by
                  setting the kapp's 'Default Form Slug' attribute, which the
                  landing resolver picks up. */}
              <Route path="/kapps/:kappSlug" element={<KappDefaultPage />} />

              {/* Portal routes */}
              <Route path="/actions/*" element={<Actions />} />
              <Route path="/requests/*" element={<Requests />} />
              <Route
                path="/forms/:formSlug/:submissionId?"
                element={<Form />}
              />
              <Route path="/profile" element={<Profile />} />
              <Route path="/settings/*" element={<SettingsRouting />} />
              <Route path="/login" element={<Navigate to="/" />} />

              {/* Reference: preserves momentum-portal's Home at a stable URL so
                  we can use it as a visual/UX reference while building the
                  form-driven replacement. Do not link to this in production UI. */}
              <Route path="/_reference/legacy-home" element={<Home />} />

              {/* Landing resolver at exact root. Other unmatched paths fall
                  through to the legacy Home component for now. */}
              <Route path="/" element={<LandingResolver />} />
              <Route path="/*" element={<Home />} />
            </Routes>

            {/* Global search modal */}
            <SearchModal />
          </>
        }
      />
    </Routes>
  );
};
