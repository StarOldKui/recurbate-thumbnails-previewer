import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  DEFAULT_SETTINGS,
  getSettings,
  getSettingsKey,
  setSettings
} from "~runtime/storage"
import type { VideoProvider } from "~runtime/types"

let storageGet: ReturnType<typeof vi.fn>
let storageSet: ReturnType<typeof vi.fn>

const provider = {
  id: "missav",
  label: "MissAV",
  matches: [],
  defaults: {
    autoOpen: false
  },
  getPageKey: () => null,
  loadPreview: vi.fn()
} satisfies VideoProvider

describe("storage", () => {
  beforeEach(() => {
    storageGet = vi.fn()
    storageSet = vi.fn()

    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: storageGet,
          set: storageSet
        }
      }
    })
  })

  it("derives provider settings keys", () => {
    expect(getSettingsKey("missav")).toBe("vtp:missav:settings")
    expect(DEFAULT_SETTINGS).toEqual({
      displayMode: "embedded",
      autoOpen: true
    })
  })

  it("merges defaults with stored values", async () => {
    storageGet.mockResolvedValue({
      [getSettingsKey("missav")]: {
        displayMode: "popup"
      }
    })

    await expect(getSettings(provider)).resolves.toEqual({
      displayMode: "popup",
      autoOpen: false
    })
  })

  it("writes settings to the provider key", async () => {
    storageSet.mockResolvedValue(undefined)

    await setSettings(provider, {
      displayMode: "popup",
      autoOpen: false
    })

    expect(storageSet).toHaveBeenCalledWith({
      [getSettingsKey("missav")]: {
        displayMode: "popup",
        autoOpen: false
      }
    })
  })
})
