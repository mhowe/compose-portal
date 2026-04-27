import { Modal } from '../../atoms/Modal.jsx';
import { ManualStepsList } from '../../components/capabilities/ManualStepsList.jsx';

/**
 * Standalone modal for editing an installed capability's manual-step
 * checklist outside the install flow. Rendered when an admin clicks the
 * "Manual steps (X/N)" affordance on a capability card.
 *
 * The list itself persists changes per-click directly to the kapp's
 * Capability Metadata; this modal is a thin wrapper that opens/closes
 * and forwards an onChange so the parent can refresh space data.
 */
export const ManualStepsModal = ({
  capability,
  installedKapp,
  onClose,
  onChange,
}) => (
  <Modal
    open
    onOpenChange={({ open }) => {
      if (!open) onClose();
    }}
    title={`Manual Steps — ${capability.name}`}
    size="md"
    closeOnEscape
    closeOnInteractOutside
  >
    <div slot="body">
      <p className="text-sm text-base-content/70 mb-3">
        These steps require an admin to complete a configuration action in
        the Kinetic admin console. Check off each step once it's done; the
        completion state is stored on the capability's kapp.
      </p>
      <ManualStepsList
        capability={capability}
        installedKapp={installedKapp}
        onChange={onChange}
      />
    </div>
    <div slot="footer">
      <button type="button" className="kbtn kbtn-ghost" onClick={onClose}>
        Close
      </button>
    </div>
  </Modal>
);
