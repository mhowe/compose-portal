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
 * Augments each registry capability with live install status based on the
 * space's kapps. Produces one row per capability:
 *
 *   { ...capability, installed, installedVersion, upgradeAvailable, customized }
 *
 * @param {Array} capabilities The merged registry list.
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
