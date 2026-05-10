import { useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Link, useParams } from 'react-router-dom';
import { fetchForms } from '@kineticdata/react';
import { useData } from '../../helpers/hooks/useData.js';
import {
  FORM_DISPLAY_MODE_FULLSCREEN,
  readFormDisplayMode,
  readKappDefaultFormSlug,
} from '../../helpers/setup.js';
import { layoutActions } from '../../helpers/state.js';
import { useInsideContainer } from '../../helpers/container-scope.js';
import { PageHeading } from '../../components/PageHeading.jsx';
import { Loading } from '../../components/states/Loading.jsx';
import { KineticForm } from '../../components/kinetic-form/KineticForm.jsx';

/**
 * Renders at /kapps/:kappSlug.
 *
 * If the kapp's 'Default Form Slug' attribute is set and the form exists,
 * render it inline as the kapp's home. Otherwise fall through to the built-in
 * forms table (New Request link works; View Submissions is a stub).
 *
 * Admins who want a richer kapp home should set 'Default Form Slug' to point
 * at a form that renders the experience they want.
 */
export const KappDefaultPage = () => {
  const { kappSlug } = useParams();
  const space = useSelector(state => state.app.space);
  const kapp = (space?.kapps || []).find(k => k.slug === kappSlug);
  const defaultFormSlug = readKappDefaultFormSlug(kapp);

  // Confirm the kapp's Default Form Slug exists before rendering it — falls
  // through to the forms table on misconfiguration rather than erroring.
  // attributesMap is included so we can read Display Mode off the same fetch.
  const defaultFormCheckParams = useMemo(
    () =>
      defaultFormSlug
        ? {
            kappSlug,
            q: `slug = "${defaultFormSlug}"`,
            include: 'attributesMap',
            limit: 1,
          }
        : null,
    [kappSlug, defaultFormSlug],
  );
  const defaultFormCheck = useData(fetchForms, defaultFormCheckParams);
  const defaultForm = defaultFormCheck.response?.forms?.[0];
  const defaultFormExists = !!defaultForm;

  // Forms table is only needed when we're rendering the fallback. Skip the
  // fetch entirely when a valid default form will render instead.
  const willRenderDefaultForm =
    defaultFormSlug &&
    defaultFormCheck.initialized &&
    !defaultFormCheck.loading &&
    defaultFormExists;
  const isFullscreen =
    willRenderDefaultForm &&
    readFormDisplayMode(defaultForm) === FORM_DISPLAY_MODE_FULLSCREEN;

  // Toggle bundle chrome based on the resolved display mode. Always restore
  // on unmount so leaving the kapp landing brings the chrome back. Skipped
  // when rendered inside a BundleContainer — see EmbeddedLanding for the
  // same rationale (chrome is owned by the host page, not the inner form).
  const insideContainer = useInsideContainer();
  useEffect(() => {
    if (insideContainer) return;
    layoutActions.setChromeHidden(isFullscreen);
    return () => layoutActions.setChromeHidden(false);
  }, [isFullscreen, insideContainer]);
  const formsTableParams = useMemo(
    () =>
      willRenderDefaultForm
        ? null
        : {
            kappSlug,
            include: 'attributesMap',
            q: '(status = "Active" OR status = "New")',
          },
    [kappSlug, willRenderDefaultForm],
  );
  const formsTable = useData(fetchForms, formsTableParams);
  const forms = formsTable.response?.forms || [];

  if (
    defaultFormCheckParams &&
    (!defaultFormCheck.initialized || defaultFormCheck.loading)
  ) {
    return <Loading />;
  }

  if (willRenderDefaultForm) {
    return isFullscreen ? (
      <KineticForm kappSlug={kappSlug} formSlug={defaultFormSlug} />
    ) : (
      <div className="gutter">
        <PageHeading title={kapp?.name || kappSlug} backTo="/kapps" />
        <KineticForm kappSlug={kappSlug} formSlug={defaultFormSlug} />
      </div>
    );
  }

  return (
    <div className="gutter">
      <PageHeading title={kapp?.name || kappSlug} backTo="/kapps" />

      {!formsTable.initialized || formsTable.loading ? (
        <Loading />
      ) : forms.length === 0 ? (
        <div className="kd-callout">No forms are available in this kapp.</div>
      ) : (
        <div className="overflow-x-auto rounded-box border border-base-300 bg-base-100">
          <table className="ktable w-full">
            <thead>
              <tr>
                <th className="text-left p-3">Form</th>
                <th className="text-left p-3 hidden md:table-cell">
                  Description
                </th>
                <th className="text-right p-3 w-0 whitespace-nowrap">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {forms.map(form => (
                <tr key={form.slug} className="border-t border-base-300">
                  <td className="p-3 font-medium">{form.name}</td>
                  <td className="p-3 hidden md:table-cell text-sm text-base-content/70">
                    {form.description}
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <Link
                      to={`/kapps/${kappSlug}/forms/${form.slug}`}
                      className="kbtn kbtn-sm kbtn-primary"
                    >
                      New Request
                    </Link>
                    <button
                      type="button"
                      className="kbtn kbtn-sm kbtn-ghost ml-2"
                      title="Submissions view is not yet implemented"
                      disabled
                    >
                      View Submissions
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
