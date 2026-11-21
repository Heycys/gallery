import { createStore } from '../lib/store';

export const extensionSettingsVisible = createStore(false);
export const openExtensionSettings = () => extensionSettingsVisible.set(true);

/** Consume this special address before ordinary document navigation handles it. */
export function consumeExtensionSettingsLink() {
  if (location.hash !== '#settings/extensions') return false;
  history.replaceState(history.state, '', location.pathname + location.search);
  openExtensionSettings();
  return true;
}
