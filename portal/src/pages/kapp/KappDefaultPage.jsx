import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Link, useParams } from 'react-router-dom';
import { fetchForms } from '@kineticdata/react';
import { useData } from '../../helpers/hooks/useData.js';
import { PageHeading } from '../../components/PageHeading.jsx';
import { Loading } from '../../components/states/Loading.jsx';

/**
 * Bundle-default "kapp home" shown when a user lands on /kapps/:kappSlug and
 * the kapp has no Default Form Slug configured (or the configured form is
 * missing). Lists every active form in the kapp with:
 *   - New Request: working link to the form submission page
 *   - View Submissions: stub for now; will link to a submissions list page later
 *
 * This page is intentionally utilitarian — admins who want a richer kapp home
 * should set the kapp's 'Default Form Slug' attribute to point at a form that
 * renders the experience they want.
 */
export const KappDefaultPage = () => {
  const { kappSlug } = useParams();
  const space = useSelector(state => state.app.space);
  const kapp = (space?.kapps || []).find(k => k.slug === kappSlug);

  const params = useMemo(
    () => ({
      kappSlug,
      include: 'attributesMap',
      q: '(status = "Active" OR status = "New")',
    }),
    [kappSlug],
  );
  const { initialized, loading, response } = useData(fetchForms, params);
  const forms = response?.forms || [];

  return (
    <div className="gutter">
      <PageHeading title={kapp?.name || kappSlug} backTo="/" />

      {!initialized || loading ? (
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
