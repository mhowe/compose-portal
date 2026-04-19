/*
 * Capabilities — a capability is a kapp (plus its associated forms, task
 * handlers, workflows, datastores) that provides a discrete, reusable
 * function to the space. The bundle installs them from a registry and
 * records install metadata on the kapp via a `Capability Metadata` attribute.
 *
 * This module is the integration point. Today it serves a hardcoded stub
 * list of capabilities for UI development; in a later phase it will fetch
 * from a GitHub Pages registry (default) plus any space-attribute-declared
 * override registries, and it will wire real install/upgrade actions.
 *
 * Detection of "installed" is already real against the live space data:
 * we look for a kapp whose slug matches the capability id AND whose
 * `Capability Metadata` kapp attribute carries a matching id. This keeps the
 * detection logic production-ready even while the registry fetch and
 * install flow remain stubbed.
 */

export const CAPABILITY_ATTRIBUTE_NAME = 'Capability Metadata';

/**
 * Phase-2 stub list. Replace this with a real registry fetch in Phase 3.
 */
export const STUB_CAPABILITIES = [
  {
    id: 'notification-templates',
    name: 'Notification Templates',
    description:
      'Reusable notification templates for email, SMS, and Slack — forms, default data, a task handler, and workflow components.',
    version: '0.1.0',
  },
  {
    id: 'robots',
    name: 'Robots',
    description:
      'Time-based workflow execution. Schedule recurring tasks and time-triggered automation.',
    version: '0.1.0',
  },
  {
    id: 'datastore',
    name: 'Datastore',
    description:
      'Manage shared reference data (e.g., list of states, departments) without duplicating across kapps.',
    version: '0.1.0',
  },
];

/**
 * Reads and parses the `Capability Metadata` attribute from a kapp record.
 * Returns the parsed object (shape: `{ id, version, installedAt?, checksums? }`)
 * or null when the attribute is absent or unparseable.
 */
export const readCapabilityMetadata = kapp => {
  const raw = kapp?.attributesMap?.[CAPABILITY_ATTRIBUTE_NAME]?.[0];
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/**
 * Augments each registry capability with live install status based on the
 * space's kapps. Produces one row per capability:
 *
 *   { ...capability, installed, installedVersion, upgradeAvailable, customized }
 *
 * @param {Array} capabilities The registry list (stub or real).
 * @param {Array} kapps The space's kapps (must include attributesMap).
 */
export const getCapabilityStatuses = (capabilities, kapps = []) =>
  capabilities.map(cap => {
    const kapp = kapps.find(k => k.slug === cap.id);
    const meta = kapp ? readCapabilityMetadata(kapp) : null;
    const installed = !!meta && meta.id === cap.id;
    const installedVersion = installed ? meta?.version : null;
    const upgradeAvailable =
      installed && !!installedVersion && installedVersion !== cap.version;
    // Customization detection lands in a later phase — stub to false now.
    const customized = false;
    return {
      ...cap,
      installed,
      installedVersion,
      upgradeAvailable,
      customized,
    };
  });
