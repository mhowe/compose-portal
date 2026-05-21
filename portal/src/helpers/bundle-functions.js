import { searchSubmissions } from '@kineticdata/react';
import { ADMIN_KAPP_SLUG } from './constants.js';

/*
 * Bundle-wide customer-defined JS function registry.
 *
 * Functions are stored as one-submission-per-function on the
 * `admin/global-functions` form. At bootstrap (post-login, pre-private-routes)
 * each Submitted submission is compiled into a JS function and stashed on
 * `bundle.functions[Name]` so form bundle code, widgets, and the browser
 * console can call them as `bundle.functions.<name>(...)`.
 *
 * Each row's parameter list comes from its own `Args` field — comma-separated
 * identifiers, e.g. `submission, ctx` or `name, locale`. Blank or missing →
 * compiled as `(...args)` so the body can grab whatever was passed via rest.
 *
 * Treated as a capability per reference-capability-convention: when the form
 * is not installed in the space, the load is a silent no-op and
 * `bundle.functions` stays empty.
 *
 * Each function is compiled in isolation — one broken body logs its name and
 * doesn't prevent the others from registering.
 */

const FUNCTIONS_FORM_SLUG = 'global-functions';
const DEFAULT_ARG_LIST = ['...args'];

const parseArgList = raw => {
  const trimmed = (raw || '').trim();
  if (!trimmed) return DEFAULT_ARG_LIST;
  return trimmed.split(',').map(s => s.trim()).filter(Boolean);
};

const isFormNotFoundError = error =>
  Boolean(error?.notFound || error?.statusCode === 404 || error?.status === 404);

export const loadBundleFunctions = async () => {
  window.bundle = window.bundle || {};
  window.bundle.functions = {};

  const response = await searchSubmissions({
    kapp: ADMIN_KAPP_SLUG,
    form: FUNCTIONS_FORM_SLUG,
    search: {
      q: 'coreState = "Submitted" AND values[Status] = "Active"',
      include: ['values'],
      limit: 1000,
    },
  });

  if (response?.error) {
    if (!isFormNotFoundError(response.error)) {
      console.warn('bundle.functions: registry load failed', response.error);
    }
    return;
  }

  for (const submission of response?.submissions || []) {
    const name = submission?.values?.Name;
    const body = submission?.values?.Body;
    const args = submission?.values?.Args;
    if (!name || typeof body !== 'string') continue;
    try {
      window.bundle.functions[name] = new Function(
        ...parseArgList(args),
        body,
      );
    } catch (err) {
      console.warn(`bundle.functions: failed to compile "${name}"`, err);
    }
  }
};
