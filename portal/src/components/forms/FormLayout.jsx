import t from 'prop-types';
import clsx from 'clsx';
import { useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { getAttributeValue } from '../../helpers/records.js';
import { Icon } from '../../atoms/Icon.jsx';
import { PageHeading } from '../PageHeading.jsx';
import {
  FORM_CHROME_BARE,
  RENDER_MODE_CONTAINER,
  RENDER_MODE_MODAL,
  useFormChrome,
  useRenderMode,
} from '../../helpers/container-scope.js';

/**
 * Generates a Layout component for CoreForm.
 *
 * @param {Object} [options]
 * @param {React.FC} [options.actionComponent] Additional component to render
 *  in the top right corner of the heading of the form layout.
 * @param {React.FC} [options.headingComponent] Additional component(s) to
 *  render in the heading of the form layout.
 * @param {string} [options.backTo] Path that the back button should use.
 * @returns {function({form: Object, content: (JSX.Element|JSX.Element[])}): *}
 */
export const generateFormLayout = ({
  actionComponent: Action,
  headingComponent: Heading,
  backTo,
} = {}) => {
  /**
   * Generate a FormLayout component to be used by the CoreForm component. The
   * props passed into this component are provided by CoreForm.
   *
   * @param {Object} options
   * @param {Object} options.form The Kinetic form record
   * @param {Object} options.submission The Kinetic submission record
   * @param {JSX.Element|JSX.Element[]} options.content The form content to
   *  render.
   */
  const FormLayout = ({
    form,
    submission,
    content,
    reviewPaginationControl,
  }) => {
    const spaceAdmin = useSelector(state => state.app.profile?.spaceAdmin);
    const renderMode = useRenderMode();
    const containerFormChrome = useFormChrome();
    const location = useLocation();
    const backPath = location.state?.backPath;
    const icon = getAttributeValue(form, 'Icon', 'forms');

    // Bare layout — no heading chrome, no gutter, no max-width centering,
    // no bordered content card; just the form content. Fires in three cases:
    //   1. Modal mode: the host modal provides title/close chrome and its
    //      own padding, so the page wrapper would double up.
    //   2. Container mode with the host opting in via
    //      `hideFormChrome: true` on BundleContainer — host page owns layout.
    //   3. Container mode with the form itself opting in via the
    //      `Form Chrome = bare` attribute — form has decided it doesn't
    //      want its standard wrapper when embedded.
    // PageHeading independently suppresses itself in modes 1 and 2 so any
    // other caller (not just this layout) gets the same treatment.
    const formAttrBare =
      (getAttributeValue(form, 'Form Chrome', 'forms') || '')
        .trim()
        .toLowerCase() === FORM_CHROME_BARE;
    const isBare =
      renderMode === RENDER_MODE_MODAL ||
      (renderMode === RENDER_MODE_CONTAINER &&
        (containerFormChrome === FORM_CHROME_BARE || formAttrBare));
    if (isBare) {
      return (
        <div className="flex-c-st gap-6">
          {content}
          {reviewPaginationControl}
        </div>
      );
    }

    return (
      <div className="gutter">
        <div className="max-w-screen-lg mx-auto full-form:max-w-full full-form:mx-0 pt-1 pb-6">
          <PageHeading
            title={form?.name}
            backTo={backTo}
            before={
              <div className="icon-box-lg">
                <Icon name={form ? icon : 'blank'} />
              </div>
            }
            after={
              form &&
              spaceAdmin && (
                <a
                  className="kbtn kbtn-ghost kbtn kbtn-circle"
                  href={`/app/console#/kapps/${form.kapp?.slug}/forms/edit/${form.slug}/general`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open Form Settings in Platform Console"
                >
                  <Icon name="settings-share" size={20} />
                </a>
              )
            }
          >
            <span className="ml-auto">
              {Action && (
                <Action
                  form={form}
                  submission={submission}
                  backTo={backTo || backPath}
                />
              )}
            </span>
          </PageHeading>
          {form && Heading && (
            <div className="mb-6">
              <Heading
                form={form}
                submission={submission}
                backTo={backTo || backPath}
              />
            </div>
          )}
          <div className={clsx('rounded-box md:border md:p-8 flex-c-st gap-6')}>
            {content}
            {reviewPaginationControl}
          </div>
        </div>
      </div>
    );
  };

  FormLayout.propTypes = {
    form: t.object,
    submission: t.object,
    content: t.any,
  };

  return FormLayout;
};
