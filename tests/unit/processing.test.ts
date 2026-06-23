import { describe, expect, it } from "vitest"

import {
  createSpriteGridPreview,
  formatDuration,
  waitForVideoDuration
} from "~runtime/processing"

describe("processing", () => {
  it("formats short and long durations", () => {
    expect(formatDuration(0)).toBe("0:00")
    expect(formatDuration(65)).toBe("1:05")
    expect(formatDuration(3723)).toBe("1:02:03")
  })

  it("returns undefined without a video element", async () => {
    await expect(waitForVideoDuration(null)).resolves.toBeUndefined()
  })

  it("uses sprite frame count when calculating sampled timestamps", () => {
    const data = createSpriteGridPreview({
      columns: 6,
      frameCount: 4698,
      frameHeight: 168,
      frameWidth: 300,
      rows: 6,
      sampleRate: 3,
      urls: Array.from({ length: 131 }, (_, index) => `thumb-${index}.jpg`),
      videoDuration: 9395.333333
    })

    const lastThumbnail = data.thumbnails.at(-1)

    expect(data.metadata.totalThumbnails).toBe(1175)
    expect(lastThumbnail?.sprite?.sourceX).toBe(1200)
    expect(lastThumbnail?.timestamp).toBeCloseTo(
      (4696 / 4698) * 9395.333333
    )
  })
})
