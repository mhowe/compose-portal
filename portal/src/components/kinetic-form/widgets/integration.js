/**
 * Shared plumbing for widgets that load data from a Kinetic integration and
 * consume the response's array. Currently used by `BundleMenu` (maps rows to
 * menu items) and `BundleCounter` (counts the array length). Anything else
 * that needs "fetch an integration, get back a typed list, expose loading /
 * error / refresh state" should consume `useIntegration` rather than
 * duplicating fetch logic.
 *
 * Exports:
 *   - `useIntegration` — React hook returning { list, loading, error, refresh }.
 *   - `mapRowToItem` / `interpolateValue` / `interpolateString` — template
 *     helpers for `{{path.to.value}}` substitution in `itemMap`-style configs.
 *   - `validateIntegrationBase` — validator for the fields shared across
 *     widgets. Widgets layer their own validators on top for widget-specific
 *     fields (e.g. menu's `itemMap` / `transform`).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { get } from 'lodash-es';
import { executeIntegration } from '../../../helpers/api.js';

/* ------------------------------------------------------------------ */
/* Template interpolation                                              */
/*                                                                    */
/* `{{path.to.value}}` in a string is replaced by `_.get(row, path)`. */
/* Lodash-style paths: dots, bracket notation with quotes, array      */
/* indices. Plain strings (no `{{...}}`) are literals. Recursive over */
/* nested objects so `clickAction.path: '{{values.Path}}'` works.     */
/*                                                                    */
/* Missing values resolve to '' (empty string) rather than skipping   */
/* the row — easier for designers to spot misconfigured paths than    */
/* silent empties.                                                    */
/* ------------------------------------------------------------------ */

const TEMPLATE_RE = /\{\{([^}]+)\}\}/g;

export const interpolateString = (str, row) => {
  if (typeof str !== 'string' || !str.includes('{{')) return str;
  return str.replace(TEMPLATE_RE, (_match, path) => {
    const value = get(row, path.trim());
    return value == null ? '' : String(value);
  });
};

export const interpolateValue = (value, row) => {
  if (typeof value === 'string') return interpolateString(value, row);
  if (Array.isArray(value)) return value.map(v => interpolateValue(v, row));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = interpolateValue(v, row);
    }
    return out;
  }
  return value;
};

export const mapRowToItem = (row, itemMap, transform) => {
  if (typeof transform === 'function') return transform(row);
  if (itemMap) return interpolateValue(itemMap, row);
  return row;
};

/* ------------------------------------------------------------------ */
/* Validator for the fields every integration-aware widget shares.    */
/* Returns true / false. Widgets call this first, then layer their    */
/* own validation for widget-specific extras.                         */
/* ------------------------------------------------------------------ */

export const validateIntegrationBase = (integration, widgetName = 'Widget') => {
  if (integration == null) return true;
  if (typeof integration !== 'object') {
    console.error(`${widgetName} Widget Error: integration must be an object.`);
    return false;
  }
  if (typeof integration.kappSlug !== 'string' || !integration.kappSlug) {
    console.error(
      `${widgetName} Widget Error: integration.kappSlug is required.`,
    );
    return false;
  }
  if (
    typeof integration.integrationName !== 'string' ||
    !integration.integrationName
  ) {
    console.error(
      `${widgetName} Widget Error: integration.integrationName is required.`,
    );
    return false;
  }
  if (
    typeof integration.listProperty !== 'string' ||
    !integration.listProperty
  ) {
    console.error(
      `${widgetName} Widget Error: integration.listProperty is required.`,
    );
    return false;
  }
  if (integration.formSlug != null && typeof integration.formSlug !== 'string') {
    console.error(
      `${widgetName} Widget Error: integration.formSlug must be a string when provided.`,
    );
    return false;
  }
  if (
    integration.parameters != null &&
    (typeof integration.parameters !== 'object' ||
      Array.isArray(integration.parameters))
  ) {
    console.error(
      `${widgetName} Widget Error: integration.parameters must be a plain object of key/value pairs.`,
    );
    return false;
  }
  if (
    integration.errorProperty != null &&
    typeof integration.errorProperty !== 'string'
  ) {
    console.error(
      `${widgetName} Widget Error: integration.errorProperty must be a string.`,
    );
    return false;
  }
  if (
    integration.onError != null &&
    typeof integration.onError !== 'function'
  ) {
    console.error(
      `${widgetName} Widget Error: integration.onError must be a function.`,
    );
    return false;
  }
  if (
    integration.onSuccess != null &&
    typeof integration.onSuccess !== 'function'
  ) {
    console.error(
      `${widgetName} Widget Error: integration.onSuccess must be a function.`,
    );
    return false;
  }
  return true;
};

/* ------------------------------------------------------------------ */
/* Fetch hook.                                                         */
/*                                                                    */
/* Returns:                                                            */
/*   list    — the array at integration.listProperty, or null if not  */
/*             yet loaded / errored / no integration provided.        */
/*   loading — true while a fetch is in flight.                        */
/*   error   — { message, ... } object on request or shape errors.    */
/*   refresh — callback to re-run the fetch (also exposed as widget   */
/*             api.refresh()).                                         */
/*                                                                    */
/* Calls integration.onSuccess(response) on success and                */
/* integration.onError(err) on either request errors or shape errors. */
/*                                                                    */
/* Race guard: if the consumer re-fetches before the prior request    */
/* resolves, the prior response is dropped on arrival.                */
/* ------------------------------------------------------------------ */

export const useIntegration = integration => {
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fetchIdRef = useRef(0);

  const refresh = useCallback(() => {
    if (!integration) return;
    const myId = ++fetchIdRef.current;
    setLoading(true);
    setError(null);
    executeIntegration({
      kappSlug: integration.kappSlug,
      formSlug: integration.formSlug,
      integrationName: integration.integrationName,
      // Default to an empty object so JSON.stringify produces "{}" rather
      // than undefined — Kinetic's integration endpoint rejects requests
      // with a missing body.
      parameters: integration.parameters || {},
    }).then(response => {
      if (myId !== fetchIdRef.current) return;
      setLoading(false);
      // executeIntegration's error handler returns { error: { message, ... } }
      if (response && response.error) {
        setError(response.error);
        if (typeof integration.onError === 'function') {
          integration.onError(response.error);
        }
        return;
      }
      // Some integrations report errors inside the response body itself.
      if (integration.errorProperty) {
        const customError = get(response, integration.errorProperty);
        if (customError) {
          const err =
            typeof customError === 'object' && customError !== null
              ? customError
              : { message: String(customError) };
          setError(err);
          if (typeof integration.onError === 'function') {
            integration.onError(err);
          }
          return;
        }
      }
      const resolved = get(response, integration.listProperty);
      if (!Array.isArray(resolved)) {
        const err = {
          message: `Integration response listProperty '${integration.listProperty}' is not an array.`,
        };
        setError(err);
        if (typeof integration.onError === 'function') {
          integration.onError(err);
        }
        return;
      }
      setList(resolved);
      if (typeof integration.onSuccess === 'function') {
        integration.onSuccess(response);
      }
    });
  }, [integration]);

  // Fetch on mount and whenever the integration config reference changes.
  // Per Pattern A widget mounting, props are stable for the widget's
  // lifetime, so this effectively fires once unless something explicitly
  // calls `refresh`.
  useEffect(() => {
    refresh();
  }, [refresh]);

  return { list, loading, error, refresh };
};
