import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { Home } from './home/Home.jsx';
import { Actions } from './tickets/actions/Actions.jsx';
import { Requests } from './tickets/requests/Requests.jsx';
import { Form } from './forms/Form.jsx';
import { ProfileResolver } from './profile/ProfileResolver.jsx';
import { SettingsRouting } from './settings/index.jsx';
import { LandingResolver } from './landing/LandingResolver.jsx';
import { EmbeddedLanding } from './landing/EmbeddedLanding.jsx';
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

/**
 * The route table that defines bundle pages. Used both at the top level
 * (inside `PrivateRoutes` under the app's `BrowserRouter` / `HashRouter`) and
 * inside a `BundleContainer` widget (under that container's `MemoryRouter`),
 * so any page reachable from a real URL is also reachable from a container's
 * `initialPath` or imperative `navigate()`.
 *
 * Excludes routes that don't belong inside a container (e.g. the full-page
 * Theme editor, which intentionally bypasses chrome at the route level rather
 * than via Display Mode).
 */
export const BundleRoutes = () => {
  return (
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
      {/* Space landing page — kapp cards + admin settings link.
          Always reachable via /kapps regardless of resolver defaults. */}
      <Route path="/kapps" element={<EmbeddedLanding />} />
      {/* Bundle-default kapp page (forms table). Admins can override by
          setting the kapp's 'Default Form Slug' attribute, which the
          landing resolver picks up. */}
      <Route path="/kapps/:kappSlug" element={<KappDefaultPage />} />

      {/* Portal routes */}
      <Route path="/actions/*" element={<Actions />} />
      <Route path="/requests/*" element={<Requests />} />
      <Route path="/forms/:formSlug/:submissionId?" element={<Form />} />
      <Route path="/profile" element={<ProfileResolver />} />
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
  );
};
