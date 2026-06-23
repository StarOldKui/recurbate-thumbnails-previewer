import { afterEach, describe, expect, it, vi } from "vitest"

import { createMissAvSeekToTime } from "~missav"
import { getMissAvPageKey } from "~missav/url"

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("missav provider", () => {
  it("detects MissAV video page keys", () => {
    expect(getMissAvPageKey(new URL("https://missav.ws/cn/mbrbn-061"))).toBe(
      "mbrbn-061"
    )
    expect(getMissAvPageKey(new URL("https://missav.ws/cn"))).toBeNull()
  })

  it("starts a cold player before seeking", () => {
    vi.useFakeTimers()
    const video = {
      closest: vi.fn(),
      currentTime: 0,
      paused: true,
      play: vi.fn(() => Promise.resolve())
    }
    const afterThumbnailSeek = vi.fn()
    const querySelector = vi.fn((selector: string) =>
      selector === ".player" ? video : null
    )
    vi.stubGlobal("document", { querySelector })
    vi.stubGlobal("window", { setTimeout })

    const seekToTime = createMissAvSeekToTime({
      afterThumbnailSeek
    })

    seekToTime(42)

    expect(querySelector).toHaveBeenCalledWith(".player")
    expect(video.play).toHaveBeenCalledOnce()
    expect(video.currentTime).toBe(0)
    vi.runAllTimers()
    expect(video.currentTime).toBe(42)
    expect(afterThumbnailSeek).toHaveBeenCalledWith(".player")
  })

  it("seeks immediately when the player is already playing", () => {
    const video = {
      closest: vi.fn(),
      currentTime: 10,
      paused: false,
      play: vi.fn()
    }
    const afterThumbnailSeek = vi.fn()
    vi.stubGlobal("document", {
      querySelector: vi.fn(() => video)
    })

    const seekToTime = createMissAvSeekToTime({
      afterThumbnailSeek
    })

    seekToTime(120)

    expect(video.play).not.toHaveBeenCalled()
    expect(video.currentTime).toBe(120)
    expect(afterThumbnailSeek).toHaveBeenCalledWith(".player")
  })

  it("does not run after-seek UX when the player is missing", () => {
    const afterThumbnailSeek = vi.fn()
    vi.stubGlobal("document", {
      querySelector: vi.fn(() => null)
    })

    const seekToTime = createMissAvSeekToTime({
      afterThumbnailSeek
    })

    seekToTime(120)

    expect(afterThumbnailSeek).not.toHaveBeenCalled()
  })
})
