/*
 * Bundle-level constants.
 */

/**
 * The kapp where bundle-level configuration forms live. The bundle looks here
 * for the form named in the space's 'Default Space Form Slug' attribute.
 *
 * Convention, not configuration: every compose-portal deployment is expected
 * to have a kapp with this slug. Setup check flags it as missing when absent.
 * Can be promoted to a space-attribute override later if a customer actually
 * needs to rename it.
 */
export const ADMIN_KAPP_SLUG = 'admin';
