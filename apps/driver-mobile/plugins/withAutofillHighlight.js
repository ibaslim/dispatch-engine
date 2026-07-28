const { withAndroidStyles } = require('@expo/config-plugins');

const ITEM_NAME = 'android:autofilledHighlight';
const TRANSPARENT = '@android:color/transparent';

/**
 * Config plugin: remove the yellow overlay Android draws over autofilled text
 * fields by setting `android:autofilledHighlight` to transparent on AppTheme.
 * This is a native theme attribute (API 28+) with no React Native prop, so it
 * must be applied here to survive `expo prebuild`.
 */
module.exports = function withAutofillHighlight(config) {
  return withAndroidStyles(config, (cfg) => {
    const styles = cfg.modResults;
    const appTheme = styles.resources.style?.find((s) => s.$.name === 'AppTheme');
    if (appTheme) {
      appTheme.item = (appTheme.item ?? []).filter((i) => i.$.name !== ITEM_NAME);
      appTheme.item.push({ $: { name: ITEM_NAME }, _: TRANSPARENT });
    }
    return cfg;
  });
};
