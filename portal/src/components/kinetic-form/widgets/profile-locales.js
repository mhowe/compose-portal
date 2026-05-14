/**
 * Canonical list of locale codes used by the Profile widget to validate
 * the curated `values` arrays a form designer supplies for the
 * `preferredLocale` core property.
 *
 * Format follows Java's `Locale.getAvailableLocales()` convention —
 * `language` or `language_COUNTRY` with an underscore separator (NOT a
 * hyphen, which is the BCP 47 convention). Kinetic stores
 * `preferredLocale` in this format, so designers should write entries
 * the same way.
 *
 * The list below covers the locales the JVM typically reports across
 * common deployments. It is not exhaustive — a designer who needs a
 * locale that isn't listed will see a console warning at widget
 * initialization (the entry is *not* dropped; validation is purely
 * advisory). To suppress the warning for a known-good locale, you can
 * add it here and rebuild the bundle.
 */
export const LOCALE_CODES = [
  // Bare language codes
  'aa', 'ab', 'ae', 'af', 'ak', 'am', 'an', 'ar', 'as', 'av', 'ay', 'az',
  'ba', 'be', 'bg', 'bh', 'bi', 'bm', 'bn', 'bo', 'br', 'bs',
  'ca', 'ce', 'ch', 'co', 'cr', 'cs', 'cv', 'cy',
  'da', 'de', 'dv', 'dz',
  'ee', 'el', 'en', 'eo', 'es', 'et', 'eu',
  'fa', 'ff', 'fi', 'fj', 'fo', 'fr', 'fy',
  'ga', 'gd', 'gl', 'gn', 'gu', 'gv',
  'ha', 'he', 'hi', 'ho', 'hr', 'ht', 'hu', 'hy', 'hz',
  'ia', 'id', 'ie', 'ig', 'ii', 'ik', 'in', 'io', 'is', 'it', 'iu', 'iw',
  'ja', 'ji', 'jv',
  'ka', 'kg', 'ki', 'kj', 'kk', 'kl', 'km', 'kn', 'ko', 'kr', 'ks', 'ku', 'kv', 'kw', 'ky',
  'la', 'lb', 'lg', 'li', 'ln', 'lo', 'lt', 'lu', 'lv',
  'mg', 'mh', 'mi', 'mk', 'ml', 'mn', 'mr', 'ms', 'mt', 'my',
  'na', 'nb', 'nd', 'ne', 'ng', 'nl', 'nn', 'no', 'nr', 'nv', 'ny',
  'oc', 'oj', 'om', 'or', 'os',
  'pa', 'pi', 'pl', 'ps', 'pt',
  'qu',
  'rm', 'rn', 'ro', 'ru', 'rw',
  'sa', 'sc', 'sd', 'se', 'sg', 'si', 'sk', 'sl', 'sm', 'sn', 'so', 'sq', 'sr', 'ss', 'st', 'su', 'sv', 'sw',
  'ta', 'te', 'tg', 'th', 'ti', 'tk', 'tl', 'tn', 'to', 'tr', 'ts', 'tt', 'tw', 'ty',
  'ug', 'uk', 'ur', 'uz',
  've', 'vi', 'vo',
  'wa', 'wo',
  'xh',
  'yi', 'yo',
  'za', 'zh', 'zu',

  // Common Arabic locales
  'ar_AE', 'ar_BH', 'ar_DZ', 'ar_EG', 'ar_IQ', 'ar_JO', 'ar_KW', 'ar_LB',
  'ar_LY', 'ar_MA', 'ar_OM', 'ar_QA', 'ar_SA', 'ar_SD', 'ar_SY', 'ar_TN', 'ar_YE',

  // Common English locales
  'en_AU', 'en_CA', 'en_GB', 'en_IE', 'en_IN', 'en_MT', 'en_NZ', 'en_PH',
  'en_SG', 'en_US', 'en_ZA',

  // Common Spanish locales
  'es_AR', 'es_BO', 'es_CL', 'es_CO', 'es_CR', 'es_CU', 'es_DO', 'es_EC',
  'es_ES', 'es_GT', 'es_HN', 'es_MX', 'es_NI', 'es_PA', 'es_PE', 'es_PR',
  'es_PY', 'es_SV', 'es_US', 'es_UY', 'es_VE',

  // Common French locales
  'fr_BE', 'fr_CA', 'fr_CH', 'fr_FR', 'fr_LU',

  // Common German locales
  'de_AT', 'de_CH', 'de_DE', 'de_GR', 'de_LU',

  // Common Italian locales
  'it_CH', 'it_IT',

  // Common Portuguese locales
  'pt_BR', 'pt_PT',

  // Common Dutch locales
  'nl_BE', 'nl_NL',

  // Common Chinese locales
  'zh_CN', 'zh_HK', 'zh_SG', 'zh_TW',

  // Common Japanese / Korean
  'ja_JP', 'ko_KR',

  // Common Scandinavian
  'sv_SE', 'da_DK', 'nb_NO', 'no_NO', 'fi_FI', 'is_IS',

  // Common Eastern European
  'pl_PL', 'cs_CZ', 'sk_SK', 'hu_HU', 'ro_RO', 'bg_BG', 'hr_HR', 'sl_SI',
  'sr_BA', 'sr_CS', 'sr_ME', 'sr_RS', 'el_CY', 'el_GR', 'et_EE', 'lt_LT',
  'lv_LV', 'mk_MK', 'sq_AL',

  // Russian-family
  'ru_RU', 'ru_UA', 'be_BY', 'uk_UA',

  // Common Asian
  'hi_IN', 'th_TH', 'vi_VN', 'id_ID', 'ms_MY', 'tl_PH', 'tr_CY', 'tr_TR',
  'he_IL', 'iw_IL', 'ta_IN', 'te_IN', 'kn_IN', 'ml_IN', 'mr_IN', 'gu_IN',
  'bn_BD', 'bn_IN', 'pa_IN', 'ur_IN', 'ur_PK',

  // Other notable
  'mt_MT', 'ga_IE', 'cy_GB', 'eu_ES', 'ca_ES', 'gl_ES', 'fo_FO',
];

const LOCALE_SET = new Set(LOCALE_CODES);

/**
 * Returns true if the given locale code is in the canonical list. Used
 * for advisory validation only — unknown codes warn but still render.
 */
export const isKnownLocale = code => LOCALE_SET.has(code);
