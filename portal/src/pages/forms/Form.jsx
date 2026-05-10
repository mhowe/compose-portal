import { useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { deleteSubmission } from '@kineticdata/react';
import { generateFormLayout } from '../../components/forms/FormLayout.jsx';
import { KineticForm } from '../../components/kinetic-form/KineticForm.jsx';
import { openConfirm } from '../../helpers/confirm.js';
import { toastError, toastSuccess } from '../../helpers/toasts.js';
import { callIfFn } from '../../helpers/index.js';
import { Icon } from '../../atoms/Icon.jsx';

const generateDeleteDraftButton =
  ({ listActions }) =>
  ({ submission, backTo }) => {
    const navigate = useNavigate();

    if (
      !submission ||
      !['Service'].includes(submission.type) ||
      submission.coreState !== 'Draft'
    )
      return null;

    // Show delete button if submission is of type Service and is in Draft state
    return (
      <button
        type="button"
        className="kbtn kbtn-ghost kbtn-circle kbtn-lg"
        onClick={() => {
          openConfirm({
            title: 'Delete Draft',
            description: 'Are you sure you want to delete this draft request?',
            acceptLabel: 'Delete',
            accept: () =>
              deleteSubmission({ id: submission.id }).then(({ error }) => {
                if (error) {
                  toastError({
                    title: 'Failed to delete draft request',
                    description: error.message,
                  });
                } else {
                  toastSuccess({ title: 'Successfully deleted draft request' });
                  callIfFn(listActions?.reloadPage);
                  navigate(backTo || '/requests', {
                    state: { persistToasts: true },
                  });
                }
              }),
          });
        }}
        aria-label="Delete Draft"
        title="Delete Draft"
      >
        <Icon name="trash" />
      </button>
    );
  };

export const Form = ({ review, listActions }) => {
  const mobile = useSelector(state => state.view.mobile);
  const { kappSlug, formSlug, submissionId } = useParams();
  const portalKappSlug = useSelector(state => state.app.kappSlug);
  const navigate = useNavigate();
  const location = useLocation();
  // Back path precedence: explicit navigation state wins. For viewing an
  // existing submission, go to /requests. For a new-submission URL with a
  // kapp in the path (/kapps/:kappSlug/forms/:formSlug), return to the kapp
  // page — this handles direct URL visits and bookmarks, and avoids falling
  // through to PageHeading's ./.. default (which resolves to a broken
  // /kapps/:kappSlug/forms path). Otherwise on mobile return home.
  //
  // PageHeading itself decides what to do with these inside a container or
  // modal (it ignores literal backTo in container mode and renders nothing
  // in modal mode), so we don't branch on render mode here.
  const backTo =
    location.state?.backPath ||
    (submissionId
      ? '/requests'
      : kappSlug
        ? `/kapps/${kappSlug}`
        : mobile
          ? '/'
          : null);

  const DeleteDraftButton = useMemo(
    () => generateDeleteDraftButton({ listActions }),
    [listActions],
  );

  const Layout = useMemo(
    () => generateFormLayout({ backTo, actionComponent: DeleteDraftButton }),
    [backTo, DeleteDraftButton],
  );

  const handleCompleted = useCallback(
    response => {
      // Redirect if there is no confirmation page to render.
      if (response.submission?.displayedPage?.type !== 'confirmation') {
        navigate(`/requests/${response.submission.id}`);
      }
    },
    [navigate],
  );

  return (
    <KineticForm
      kappSlug={kappSlug || portalKappSlug}
      formSlug={formSlug}
      submissionId={submissionId}
      components={{ Layout }}
      completed={handleCompleted}
      review={review}
    />
  );
};
