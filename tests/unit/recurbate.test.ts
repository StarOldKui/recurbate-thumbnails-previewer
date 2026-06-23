import { afterEach, describe, expect, it, vi } from "vitest"

import {
  createRecurbateSeekToTime,
  getRecurbateTimelineDuration
} from "~recurbate"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("recurbate", () => {
  it("uses timeline duration plus preroll as a fallback video duration", () => {
    expect(
      getRecurbateTimelineDuration({
        dataset: {
          duration: "4529.999333",
          prerollDuration: "2.37"
        }
      } as unknown as HTMLElement)
    ).toBeCloseTo(4532.369333)
  })

  it("seeks through the recurbate action before running after-seek UX", async () => {
    const afterThumbnailSeek = vi.fn()
    const runProviderAction = vi.fn(async () => null)
    const seekToTime = createRecurbateSeekToTime({
      afterThumbnailSeek,
      runProviderAction
    })

    await seekToTime(120)

    expect(runProviderAction).toHaveBeenCalledWith("seek", { timestamp: 120 })
    expect(afterThumbnailSeek).toHaveBeenCalledOnce()
  })

  it("falls back to direct video seeking when the recurbate action fails", async () => {
    const video = { currentTime: 0 }
    const afterThumbnailSeek = vi.fn()
    const runProviderAction = vi.fn(async () => {
      throw new Error("failed")
    })
    vi.stubGlobal("document", {
      querySelector: vi.fn(() => video)
    })

    const seekToTime = createRecurbateSeekToTime({
      afterThumbnailSeek,
      runProviderAction
    })

    await seekToTime(240)

    expect(video.currentTime).toBe(240)
    expect(afterThumbnailSeek).toHaveBeenCalledOnce()
  })
})
