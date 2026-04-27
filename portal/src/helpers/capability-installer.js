import {
  createAttributeDefinition,
  createForm,
  createKapp,
  fetchConnections,
  fetchForms,
  fetchKapp,
  importConnection,
  importSubmissions,
  updateAttributeDefinition,
  updateKapp,
} from '@kineticdata/react';
import {
  CAPABILITY_ATTRIBUTE_NAME,
  findInstalledKapp,
} from './capabilities.js';

/*
 * Capability installer.
 *
 * Given a fully-fetched capability manifest, installs the parts the bundle
 * currently supports:
 *   - spaceConfiguration: user profile + team attribute definitions
 *   - integrations: connections (each definition file imported via the
 *     integrator import endpoint, preserving exported ids)
 *   - kapp: POSTed from kapp.json (Capability Metadata stripped from any
 *     pre-set attribute values; bundle writes the canonical value at the
 *     end of install)
 *   - Capability Metadata kappAttributeDefinition: idempotent create or
 *     update, owned by the bundle
 *   - forms: created within the kapp
 *   - form data: each CSV in form.data is POSTed as raw text to the
 *     bulk submissions import endpoint; only seeded for forms that were
 *     just created in this pass
 *   - Capability Metadata value: written last to tag the kapp as installed
 *
 * Task handlers, workflows, and manual_steps display land in later phases.
 *
 * The installer plans step rows from what the manifest actually declares;
 * asset types the manifest omits produce no step at all. Each step is
 * **idempotent** — re-running install on a partially-installed capability
 * picks up missing pieces without raising errors. Detection of "installed"
 * relies on the canonical Capability Metadata id rather than kapp slug, so
 * a capability whose kapp slug differs from its id still resolves correctly.
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

const fetchText = async url => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }
  return response.text();
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
  // Connections come before the kapp so any form-level integration
  // references (which carry connection ids) resolve to existing connections.
  const integrations = manifest.integrations || [];
  for (let i = 0; i < integrations.length; i++) {
    steps.push({
      id: `connection:${i}`,
      label: `Connection #${i + 1}`,
      kind: 'connection',
      integration: integrations[i],
      index: i,
    });
  }
  steps.push({ id: 'kapp', label: 'Kapp', kind: 'kapp' });
  steps.push({
    id: 'metadata-def',
    label: `Kapp attribute: ${CAPABILITY_ATTRIBUTE_NAME}`,
    kind: 'metadata-def',
  });
  // Forms + per-form seed data within the kapp.
  const forms = manifest.forms || [];
  for (let i = 0; i < forms.length; i++) {
    steps.push({
      id: `form:${i}`,
      label: `Form #${i + 1}`,
      kind: 'form',
      formEntry: forms[i],
      index: i,
    });
    if ((forms[i].data || []).length > 0) {
      steps.push({
        id: `form-seed:${i}`,
        label: `Seed form #${i + 1}`,
        kind: 'form-seed',
        formEntry: forms[i],
        index: i,
      });
    }
  }
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
  // Per-form context populated by 'form' steps; consumed by 'form-seed' so
  // we only seed CSV data into forms that were just created in this pass.
  const formContexts = {};

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
    } else if (step.kind === 'connection') {
      await run(step, async () => {
        const definitionUrl = resolveUrl(
          manifest,
          step.integration?.definition,
        );
        if (!definitionUrl) {
          throw new Error(
            `integrations[${step.index}].definition missing in manifest`,
          );
        }
        const exportJson = await fetchJson(definitionUrl);
        const connectionObject = exportJson?.connection || exportJson;
        const id = connectionObject?.id;
        // Existence check by id — the export carries stable ids the import
        // endpoint preserves, so re-runs detect a prior install cleanly.
        if (id) {
          const existingResp = await fetchConnections({});
          if (existingResp?.error) throw existingResp.error;
          const existing = (existingResp?.connections || []).find(
            c => c.id === id,
          );
          if (existing) {
            return {
              skipped: true,
              message: `Already imported: ${existing.name || id}`,
            };
          }
        }
        const result = await importConnection({ connection: connectionObject });
        if (result?.error) {
          if (isAlreadyExistsError(result.error)) {
            return {
              skipped: true,
              message: 'Already imported',
            };
          }
          throw result.error;
        }
        return {
          message: `Imported ${connectionObject?.name || id || 'connection'}`,
        };
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
        if (!definitionUrl) {
          console.error(
            'Capability install: manifest.kapp.definition missing. Full manifest:',
            manifest,
          );
          throw new Error(
            `manifest.kapp.definition missing — got manifest.kapp = ${JSON.stringify(manifest.kapp)}. Check the served manifest.json in the browser network tab.`,
          );
        }
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
        const desired = {
          name: CAPABILITY_ATTRIBUTE_NAME,
          description:
            'Compose Portal capability install metadata. Managed by the bundle.',
          allowsMultiple: false,
        };
        // Fetch the kapp's current attribute definitions to decide between
        // create / update / skip rather than relying on error-message matching
        // (which proved fragile — Kinetic's "must be unique and there are 2"
        // error doesn't match a generic already-exists pattern).
        const fetched = await fetchKapp({
          kappSlug,
          include: 'kappAttributeDefinitions',
        });
        if (fetched?.error) throw fetched.error;
        const defs = fetched?.kapp?.kappAttributeDefinitions || [];
        const existing = defs.find(d => d.name === CAPABILITY_ATTRIBUTE_NAME);

        if (existing) {
          const drift =
            existing.description !== desired.description ||
            !!existing.allowsMultiple !== desired.allowsMultiple;
          if (!drift) {
            return { skipped: true, message: 'Already defined' };
          }
          // Bundle-managed definition drifted — bring it back in line.
          const updateResult = await updateAttributeDefinition({
            attributeType: 'kappAttributeDefinitions',
            kappSlug,
            attributeName: CAPABILITY_ATTRIBUTE_NAME,
            attributeDefinition: desired,
          });
          if (updateResult?.error) throw updateResult.error;
          return { message: 'Updated to match bundle spec' };
        }

        const createResult = await createAttributeDefinition({
          attributeType: 'kappAttributeDefinitions',
          kappSlug,
          attributeDefinition: desired,
        });
        if (createResult?.error) throw createResult.error;
        return { message: 'Created' };
      });
    } else if (step.kind === 'form') {
      await run(step, async () => {
        if (!kappSlug) {
          throw new Error('Kapp slug unknown — earlier step must succeed');
        }
        const definitionUrl = resolveUrl(manifest, step.formEntry?.definition);
        if (!definitionUrl) {
          throw new Error(
            `forms[${step.index}].definition missing in manifest`,
          );
        }
        const formJson = await fetchJson(definitionUrl);
        const formObject = formJson?.form || formJson;
        const formSlug = formObject?.slug;
        if (!formSlug) {
          throw new Error(
            `Form definition at ${definitionUrl} missing slug`,
          );
        }
        // Idempotency: query for an existing form by slug in this kapp.
        const existingResp = await fetchForms({
          kappSlug,
          q: `slug = "${formSlug}"`,
          limit: 1,
        });
        if (existingResp?.error) throw existingResp.error;
        const existed = (existingResp?.forms || []).length > 0;
        if (existed) {
          // Mark as not-just-created so the seed step skips this form's data.
          formContexts[step.index] = { slug: formSlug, created: false };
          return {
            skipped: true,
            message: `${formSlug} already exists`,
          };
        }
        const result = await createForm({ kappSlug, form: formObject });
        if (result?.error) {
          if (isAlreadyExistsError(result.error)) {
            formContexts[step.index] = { slug: formSlug, created: false };
            return {
              skipped: true,
              message: `${formSlug} already exists`,
            };
          }
          throw result.error;
        }
        formContexts[step.index] = { slug: formSlug, created: true };
        return { message: `Created ${formSlug}` };
      });
    } else if (step.kind === 'form-seed') {
      await run(step, async () => {
        const ctx = formContexts[step.index];
        if (!ctx) {
          // The form step never ran or recorded context — nothing to do.
          return {
            skipped: true,
            message: 'Form not available',
          };
        }
        if (!ctx.created) {
          // Don't trample existing data on a re-install or a form the admin
          // already had. They can re-seed by deleting + re-installing.
          return {
            skipped: true,
            message: `${ctx.slug} pre-existed; data not seeded`,
          };
        }
        const dataUrls = step.formEntry?.data || [];
        let totalRows = 0;
        for (const relative of dataUrls) {
          const csvUrl = resolveUrl(manifest, relative);
          if (!csvUrl) continue;
          const csvText = await fetchText(csvUrl);
          // Rough row count for the message — header line excluded.
          const lines = csvText.split(/\r?\n/).filter(Boolean);
          totalRows += Math.max(0, lines.length - 1);
          const result = await importSubmissions({
            kappSlug,
            formSlug: ctx.slug,
            file: csvText,
          });
          if (result?.errors?.length) {
            throw new Error(
              `Bulk import reported ${result.errors.length} error(s); see browser console.`,
            );
          }
          if (result?.error) throw result.error;
        }
        return {
          message: `Seeded ~${totalRows} row${totalRows === 1 ? '' : 's'} into ${ctx.slug}`,
        };
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
