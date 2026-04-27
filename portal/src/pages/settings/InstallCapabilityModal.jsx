import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Modal } from '../../atoms/Modal.jsx';
import { Icon } from '../../atoms/Icon.jsx';
import {
  installCapability,
  INSTALLER_STATUSES,
} from '../../helpers/capability-installer.js';

const StepIcon = ({ status }) => {
  switch (status) {
    case INSTALLER_STATUSES.RUNNING:
      return (
        <Icon name="loader-2" className="animate-spin text-info" size={20} />
      );
    case INSTALLER_STATUSES.SUCCESS:
      return <Icon name="circle-check" className="text-success" size={20} />;
    case INSTALLER_STATUSES.SKIPPED:
      return (
        <Icon name="circle-minus" className="text-base-content/50" size={20} />
      );
    case INSTALLER_STATUSES.FAILED:
      return <Icon name="circle-x" className="text-error" size={20} />;
    case INSTALLER_STATUSES.QUEUED:
    default:
      return (
        <Icon name="circle" className="text-base-content/30" size={20} />
      );
  }
};

/**
 * Install Capability dialog.
 *
 * Renders a modal that fires `installCapability` on mount and streams
 * step-by-step progress into the body. Cannot be dismissed mid-install
 * (closeOnEscape / closeOnInteractOutside disabled until finished). On
 * completion, calls `onComplete` so the caller can refresh space data.
 */
export const InstallCapabilityModal = ({ capability, onClose, onComplete }) => {
  const space = useSelector(state => state.app.space);
  const [steps, setSteps] = useState([]);
  const [finished, setFinished] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    installCapability(capability, {
      space,
      registryUrl: capability.registryUrl,
      onProgress: nextSteps => {
        if (!cancelled) setSteps(nextSteps);
      },
    }).then(result => {
      if (cancelled) return;
      setSuccess(result.success);
      setFinished(true);
      onComplete?.(result);
    });
    return () => {
      cancelled = true;
    };
    // Capability is stable for this modal's lifetime — installing once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Modal
      open
      onOpenChange={({ open }) => {
        if (!open && finished) onClose();
      }}
      title={`Install ${capability.name}`}
      size="md"
      closeOnEscape={finished}
      closeOnInteractOutside={false}
    >
      <div slot="body" className="flex-c-st gap-3">
        <p className="text-sm text-base-content/70">
          Compose Portal is creating the parts of <strong>{capability.name}</strong> on
          your space. Each step is independent — re-running install picks up
          anything that was missed.
        </p>

        {steps.length === 0 ? (
          <div className="text-sm text-base-content/60 italic">Preparing…</div>
        ) : (
          <ul className="flex-c-st gap-2">
            {steps.map(step => (
              <li key={step.id} className="flex-sc gap-3">
                <StepIcon status={step.status} />
                <div className="flex-c-ss flex-auto">
                  <div className="font-medium text-sm">{step.label}</div>
                  {step.message && (
                    <div className="text-xs text-base-content/60">
                      {step.message}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {finished && (
          <div
            className={`kalert ${success ? 'kalert-success' : 'kalert-error'} mt-2`}
          >
            <Icon name={success ? 'check' : 'alert-triangle'} />
            <div>
              {success
                ? `Installed ${capability.name} v${capability.version}.`
                : 'Install completed with errors. See the browser console for details.'}
            </div>
          </div>
        )}

        <p className="text-xs text-base-content/50 italic mt-2">
          Phase 4a installs the kapp and tags it with Capability Metadata.
          Forms, task handlers, workflows, and integrations land in later
          phases.
        </p>
      </div>

      <div slot="footer">
        <button
          type="button"
          className="kbtn kbtn-primary"
          onClick={onClose}
          disabled={!finished}
        >
          {finished ? 'Close' : 'Installing…'}
        </button>
      </div>
    </Modal>
  );
};
