import { useState } from 'react';
import t from 'prop-types';
import clsx from 'clsx';
import { Icon } from './Icon.jsx';

/**
 * Collapsible section styled to match the compose-portal surface. Built on
 * native <details>/<summary> for accessibility (keyboard + screen readers)
 * and converted to controlled state so `initialOpen` only seeds the mount
 * state — user toggles persist regardless of prop changes afterwards.
 *
 * @param {string} props.title Shown as the section heading.
 * @param {React.ReactNode} [props.headerRight] Optional content rendered on
 *   the right side of the header (warning/summary badges, etc.).
 * @param {boolean} [props.initialOpen=false] Whether the section should be
 *   open on first render. Subsequent prop changes do not force-toggle.
 * @param {string} [props.className] Extra classes on the outer <details>.
 */
export const AccordionSection = ({
  title,
  headerRight,
  initialOpen = false,
  className,
  children,
}) => {
  const [open, setOpen] = useState(initialOpen);

  return (
    <details
      className={clsx(
        'group rounded-box border border-base-300 bg-base-100',
        className,
      )}
      open={open}
      onToggle={e => setOpen(e.currentTarget.open)}
    >
      <summary className="list-none [&::-webkit-details-marker]:hidden flex-sc gap-3 p-4 cursor-pointer select-none">
        <Icon
          name="chevron-right"
          size={20}
          className="flex-none transition-transform group-open:rotate-90"
        />
        <span className="text-h3 font-semibold flex-auto text-left">
          {title}
        </span>
        {headerRight}
      </summary>
      <div className="p-4 pt-0 border-t border-base-300">{children}</div>
    </details>
  );
};

AccordionSection.propTypes = {
  title: t.string.isRequired,
  headerRight: t.node,
  initialOpen: t.bool,
  className: t.string,
  children: t.node,
};
