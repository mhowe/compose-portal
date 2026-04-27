import { useEffect, useMemo, useState } from 'react';

/*
 * Capabilities — a capability is a kapp (plus its associated forms, task
 * handlers, workflows, datastores, and integrations) that provides a
 * discrete, reusable function to the space. The bundle fetches the list of
 * available capabilities from one or more registries (static JSON indexes
 * typically hosted on GitHub Pages or similar) and records install metadata
 * on each installed kapp via a 'Capability Metadata' attribute.
 *
 * This module covers Phase 3: fetching registries and detecting installed
 * status. Phase 4+ will add the actual install action.
 */

export const CAPABILITY_ATTRIBUTE_NAME = 'Capability Metadata';

/**
 * Reads and parses the 'Capability Metadata' attribute from a kapp record.
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
 * Finds the kapp on a space whose Capability Metadata attribute carries the
 * given capability id. Returns the kapp record or null.
 *
 * Detection is by metadata id (not kapp slug) because kapp.json is the
 * source of truth for the installed kapp's slug — which can differ from
 * the capability id (and from version to version of the same capability).
 */
export const findInstalledKapp = (kapps, capabilityId) =>
  (kapps || []).find(k => readCapabilityMetadata(k)?.id === capabilityId) ||
  null;

/**
 * Returns manual-step status for an installed capability:
 *   { total, completed, pending, steps: [{id, text, link, completed}] }
 *
 * `steps` enumerates the manifest's manual_steps in declared order, with
 * each entry's completion state pulled from the kapp's metadata. Steps
 * present on the kapp but not in the manifest (orphaned by a version
 * change) are ignored — the manifest is the source of truth for which
 * steps to render.
 */
export const getManualStepStatus = (capability, kapp) => {
  const manifestSteps = capability?.notes?.manual_steps || [];
  const meta = kapp ? readCapabilityMetadata(kapp) : null;
  const completionMap = meta?.manualSteps || {};
  const steps = manifestSteps.map(s => ({
    id: String(s.id),
    text: s.text || '',
    link: s.link || null,
    completed: !!completionMap[String(s.id)]?.completed,
  }));
  const completed = steps.filter(s => s.completed).length;
  return {
    total: steps.length,
    completed,
    pending: steps.length - completed,
    steps,
  };
};

/**
 * Augments each registry capability with live install status based on the
 * space's kapps. Produces one row per capability:
 *
 *   { ...capability, installed, installedVersion, installedKapp,
 *     upgradeAvailable, customized, manualSteps }
 *
 * `manualSteps` is the result of getManualStepStatus when the capability
 * is installed; an empty/zero status when not.
 *
 * @param {Array} capabilities The merged registry list.
 * @param {Array} kapps The space's kapps (must include attributesMap).
 */
export const getCapabilityStatuses = (capabilities, kapps = []) =>
  capabilities.map(cap => {
    const kapp = findInstalledKapp(kapps, cap.id);
    const meta = kapp ? readCapabilityMetadata(kapp) : null;
    const installed = !!meta;
    const installedVersion = installed ? meta?.version : null;
    const upgradeAvailable =
      installed && !!installedVersion && installedVersion !== cap.version;
    // Customization detection lands in a later phase — stub to false now.
    const customized = false;
    const manualSteps = installed
      ? getManualStepStatus(cap, kapp)
      : { total: 0, completed: 0, pending: 0, steps: [] };
    return {
      ...cap,
      installed,
      installedVersion,
      installedKapp: kapp || null,
      upgradeAvailable,
      customized,
      manualSteps,
    };
  });

/**
 * Fetches a single registry index.json and each capability's manifest.json.
 * Never throws — failures are returned as entries in the `errors` array so
 * partial success surfaces what succeeded.
 *
 * @param {string} indexUrl Absolute URL to the registry's index.json.
 * @returns {Promise<{ registryUrl: string, capabilities: Array, errors: Array }>}
 */
export const fetchRegistry = async indexUrl => {
  const errors = [];
  let index;
  try {
    const response = await fetch(indexUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    index = await response.json();
  } catch (error) {
    return {
      registryUrl: indexUrl,
      capabilities: [],
      errors: [
        {
          url: indexUrl,
          message: `Failed to fetch registry index: ${error.message}`,
        },
      ],
    };
  }

  const entries = Array.isArray(index?.capabilities) ? index.capabilities : [];
  const manifests = await Promise.all(
    entries.map(async entry => {
      let manifestUrl;
      try {
        manifestUrl = new URL(entry.manifestUrl, indexUrl).href;
      } catch (error) {
        errors.push({
          url: entry.manifestUrl,
          message: `Invalid manifest URL: ${error.message}`,
        });
        return null;
      }
      try {
        const response = await fetch(manifestUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const manifest = await response.json();
        return { ...manifest, registryUrl: indexUrl, manifestUrl };
      } catch (error) {
        errors.push({
          url: manifestUrl,
          message: `Failed to fetch manifest: ${error.message}`,
        });
        return null;
      }
    }),
  );

  return {
    registryUrl: indexUrl,
    capabilities: manifests.filter(Boolean),
    errors,
  };
};

/**
 * Fetches every registry URL, merges the capabilities, de-duplicates by id
 * (first wins), and surfaces any errors for the UI to display.
 *
 * @param {Array<string>} urls Registry index URLs.
 * @returns {Promise<{ capabilities: Array, errors: Array }>}
 */
export const fetchAllRegistries = async urls => {
  if (!urls || urls.length === 0) return { capabilities: [], errors: [] };
  const results = await Promise.all(urls.map(fetchRegistry));
  const seen = new Set();
  const capabilities = [];
  const errors = [];
  for (const r of results) {
    errors.push(...r.errors);
    for (const cap of r.capabilities) {
      if (cap?.id && !seen.has(cap.id)) {
        seen.add(cap.id);
        capabilities.push(cap);
      }
    }
  }
  return { capabilities, errors };
};

/**
 * React hook that fetches the combined registry list when the URL set
 * changes. Idle until an URL array is provided; supports empty input by
 * immediately returning an empty capabilities list with no errors.
 *
 * Returns `{ initialized, loading, capabilities, errors }`.
 */
export const useCapabilityRegistry = urls => {
  const urlsKey = useMemo(() => (urls || []).join('|'), [urls]);
  const [state, setState] = useState({
    initialized: false,
    loading: false,
    capabilities: [],
    errors: [],
  });

  useEffect(() => {
    const parsed = urlsKey.split('|').filter(Boolean);
    if (parsed.length === 0) {
      setState({
        initialized: true,
        loading: false,
        capabilities: [],
        errors: [],
      });
      return;
    }

    let cancelled = false;
    setState(prev => ({ ...prev, loading: true }));
    fetchAllRegistries(parsed).then(result => {
      if (cancelled) return;
      setState({
        initialized: true,
        loading: false,
        capabilities: result.capabilities,
        errors: result.errors,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [urlsKey]);

  return state;
};
