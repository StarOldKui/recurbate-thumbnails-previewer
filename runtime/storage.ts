import type { Settings, VideoProvider } from "~runtime/types"

export const DEFAULT_SETTINGS: Settings = {
  displayMode: "embedded",
  autoOpen: true
}

export function getSettingsKey(providerId: string): string {
  return `vtp:${providerId}:settings`
}

export async function getSettings(provider: VideoProvider): Promise<Settings> {
  const settingsKey = getSettingsKey(provider.id)
  const stored = await chrome.storage.local.get(settingsKey)
  return {
    ...DEFAULT_SETTINGS,
    ...provider.defaults,
    ...(stored[settingsKey] || {})
  }
}

export async function setSettings(
  provider: VideoProvider,
  settings: Settings
): Promise<void> {
  await chrome.storage.local.set({ [getSettingsKey(provider.id)]: settings })
}
