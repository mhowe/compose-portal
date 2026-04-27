import {
  createAttributeDefinition,
  createKapp,
  updateKapp,
} from '@kineticdata/react';
import {
  CAPABILITY_ATTRIBUTE_NAME,
  findInstalledKapp,
} from './capabilities.js';

/*
 * Capability installer (Phase 4a).
 *
 * Given a fully-fetched capability manifest, installs the parts the bundle
 * supports today: spaceConfiguration (user profile + team attribute
 * definitions), the kapp (POSTed from kapp.json), the kapp-level
 * `Capability Metadata` attribute definition, and the metadata value that
 * tags the kapp as installed.
 *
 * Forms, submissions, connections, task handlers, workflows, and manual
 * steps land in subsequent phases. The installer plans step rows for what's
 * present in the manifest; assets the manifest doesn't declare are simply
 * not in the plan, not skipped.
 *
 * Each step is **idempotent**: re-running install on a partially-installed
 * capability picks up where it left off without raising errors. Detection
 * relies on the canonical Capability Metadata id (not kapp slug), so a
 * capability whose kapp slug differs from its capability id still resolves
 * correctly.
 */

export const INSTALLER_STATUSES = {
  QUEUED: 'queued',
  RUNNING: 'running',
  SUCCESS: 'success',
  SKIPPED: 'skipped',
  FAILED: 'failed',
};

const ALREADY_EXISTS_RE = /already (exists|present|defined|in use)|duplicate/i;

const isAlreadyExistsError = error => {
  const text = String(error?.message || error?.error?.message || error || '');
  return ALREADY_EXISTS_RE.test(text);
};

const extractMessage = error =>
  error?.message ||
  error?.error?.message ||
  (typeof error === 'string' ? error : 'Unknown error');

const resolveUrl = (manifest, relative) => {
  if (!relative) return null;
  return new URL(relative, manifest.manifestUrl).href;
};

const fetchJson = async url => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }
  return response.json();
};

/**
 * Builds the step list from the manifest. Only includes steps for asset
 * types the manifest actually declares — empty/missing keys produce no
 * step at all.
 */
const planSteps = manifest => {
  const steps = [];
  const userAttrs = manifest.spaceConfiguration?.userProfileAttributes || [];
  const teamAttrs = manifest.spaceConfiguration?.teamAttributes || [];

  for (const attr of userAttrs) {
    steps.push({
      id: `user-attr:${attr.name}`,
      label: `User profile attribute: ${attr.name}`,
      kind: 'user-attribute',
      attribute: attr,
    });
  }
  for (const attr of teamAttrs) {
    steps.push({
      id: `team-attr:${attr.name}`,
      label: `Team attribute: ${attr.name}`,
      kind: 'team-attribute',
      attribute: attr,
    });
  }
  steps.push({ id: 'kapp', label: 'Kapp', kind: 'kapp' });
  steps.push({
    id: 'metadata-def',
    label: `Kapp attribute: ${CAPABILITY_ATTRIBUTE_NAME}`,
    kind: 'metadata-def',
  });
  steps.push({
    id: 'metadata-value',
    label: 'Write Capability Metadata',
    kind: 'metadata-value',
  });

  return steps.map(s => ({
    ...s,
    status: INSTALLER_STATUSES.QUEUED,
    message: null,
  }));
};

/**
 * Runs the installer and returns the final step list + a success flag.
 *
 * @param {Object} manifest Fully-fetched capability manifest (must include
 *   `manifestUrl` so relative URLs resolve, plus `id`, `version`, `kapp`,
 *   optional `spaceConfiguration`).
 * @param {Object} [options]
 * @param {Object} [options.space] Current space record from Redux. Used for
 *   idempotency hints; the installer also catches "already exists" errors
 *   from the API as a backstop.
 * @param {string} [options.registryUrl] Registry index URL the manifest came
 *   from. Stored in Capability Metadata for provenance.
 * @param {(steps: Array) => void} [options.onProgress] Called after each
 *   step state change with a fresh copy of the step list.
 */
export const installCapability = async (manifest, options = {}) => {
  const { space, registryUrl, onProgress } = options;
  const steps = planSteps(manifest);

  let kappSlug = null;

  const update = (id, patch) => {
    const idx = steps.findIndex(s => s.id === id);
    if (idx >= 0) steps[idx] = { ...steps[idx], ...patch };
    onProgress?.([...steps]);
  };

  const run = async (step, fn) => {
    update(step.id, { status: INSTALLER_STATUSES.RUNNING });
    try {
      const outcome = await fn();
      update(step.id, {
        status: outcome?.skipped
          ? INSTALLER_STATUSES.SKIPPED
          : INSTALLER_STATUSES.SUCCESS,
        message: outcome?.message || null,
      });
    } catch (error) {
      console.error(`Install step "${step.id}" failed:`, error);
      update(step.id, {
        status: INSTALLER_STATUSES.FAILED,
        message: extractMessage(error),
      });
    }
  };

  onProgress?.([...steps]);

  const userDefs = new Set(
    (space?.userProfileAttributeDefinitions || []).map(d => d.name),
  );

  for (const step of steps) {
    // Bail subsequent steps if a critical earlier step failed.
    const anyFailed = steps.some(s => s.status === INSTALLER_STATUSES.FAILED);
    if (anyFailed && step.kind !== 'metadata-value') {
      // Allow metadata-value to attempt regardless? No — if kapp failed,
      // metadata-value can't run. Just stop here.
      break;
    }

    if (step.kind === 'user-attribute') {
      await run(step, async () => {
        if (userDefs.has(step.attribute.name)) {
          return { skipped: true, message: 'Already defined' };
        }
        const result = await createAttributeDefinition({
          attributeType: 'userProfileAttributeDefinitions',
          attributeDefinition: {
            name: step.attribute.name,
            description: step.attribute.description || '',
            allowsMultiple: !!step.attribute.allowsMultiple,
          },
        });
        if (result?.error) {
          if (isAlreadyExistsError(result.error)) {
            return { skipped: true, message: 'Already defined' };
          }
          throw result.error;
        }
        return { message: 'Created' };
      });
    } else if (step.kind === 'team-attribute') {
      await run(step, async () => {
        const result = await createAttributeDefinition({
          attributeType: 'teamAttributeDefinitions',
          attributeDefinition: {
            name: step.attribute.name,
            description: step.attribute.description || '',
            allowsMultiple: !!step.attribute.allowsMultiple,
          },
        });
        if (result?.error) {
          if (isAlreadyExistsError(result.error)) {
            return { skipped: true, message: 'Already defined' };
          }
          throw result.error;
        }
        return { message: 'Created' };
      });
    } else if (step.kind === 'kapp') {
      await run(step, async () => {
        const existing = findInstalledKapp(space?.kapps, manifest.id);
        if (existing) {
          kappSlug = existing.slug;
          return {
            skipped: true,
            message: `Already installed at /kapps/${existing.slug}`,
          };
        }
        const definitionUrl = resolveUrl(manifest, manifest.kapp?.definition);
        if (!definitionUrl) throw new Error('manifest.kapp.definition missing');
        const kappJson = await fetchJson(definitionUrl);
        const kappObject = kappJson?.kapp || kappJson;
        // Defensive: never let a pre-set Capability Metadata value sneak in
        // from the export — the installer writes the canonical value.
        if (Array.isArray(kappObject.attributes)) {
          kappObject.attributes = kappObject.attributes.filter(
            a => a.name !== CAPABILITY_ATTRIBUTE_NAME,
          );
        }
        const result = await createKapp({ kapp: kappObject });
        if (result?.error) {
          if (isAlreadyExistsError(result.error)) {
            kappSlug = kappObject.slug;
            return {
              skipped: true,
              message: `Already exists: ${kappObject.slug}`,
            };
          }
          throw result.error;
        }
        kappSlug = result?.kapp?.slug || kappObject.slug;
        return { message: `Created /kapps/${kappSlug}` };
      });
    } else if (step.kind === 'metadata-def') {
      await run(step, async () => {
        if (!kappSlug) {
          throw new Error('Kapp slug unknown — earlier step must succeed');
        }
        const result = await createAttributeDefinition({
          attributeType: 'kappAttributeDefinitions',
          kappSlug,
          attributeDefinition: {
            name: CAPABILITY_ATTRIBUTE_NAME,
            description:
              'Compose Portal capability install metadata. Managed by the bundle.',
            allowsMultiple: false,
          },
        });
        if (result?.error) {
          if (isAlreadyExistsError(result.error)) {
            return { skipped: true, message: 'Already defined' };
          }
          throw result.error;
        }
        return { message: 'Created' };
      });
    } else if (step.kind === 'metadata-value') {
      await run(step, async () => {
        if (!kappSlug) {
          throw new Error('Kapp slug unknown');
        }
        const metadata = {
          id: manifest.id,
          version: manifest.version,
          installedAt: new Date().toISOString(),
          registryUrl: registryUrl || manifest.registryUrl,
        };
        const result = await updateKapp({
          kappSlug,
          kapp: {
            attributesMap: {
              [CAPABILITY_ATTRIBUTE_NAME]: [JSON.stringify(metadata)],
            },
          },
          include: 'attributesMap',
        });
        if (result?.error) throw result.error;
        return { message: `Tagged ${manifest.id}@${manifest.version}` };
      });
    }
  }

  const success = !steps.some(s => s.status === INSTALLER_STATUSES.FAILED);
  return { steps: [...steps], success, kappSlug };
};
