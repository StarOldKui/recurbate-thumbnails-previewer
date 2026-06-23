import type { PreviewContext, PreviewData, VideoProvider } from "~runtime/types"
import type { MissAvThumbnailConfig } from "~missav/background"
import { getMissAvPageKey, MISSAV_MATCHES } from "~missav/url"
import {
  createSpriteGridPreview,
  waitForVideoDuration
} from "~runtime/processing"

const startupSeekDelays = [100, 500, 1200]

type MissAvSeekContext = Pick<PreviewContext, "afterThumbnailSeek">

function getMissAvVideo(video: HTMLVideoElement): HTMLVideoElement {
  return (document.querySelector(".player") as HTMLVideoElement | null) || video
}

function seekMissAvVideo(video: HTMLVideoElement, timestamp: number): void {
  getMissAvVideo(video).currentTime = timestamp
}

function startMissAvVideo(video: HTMLVideoElement): void {
  void video.play().catch(() => {
    const playerRoot = video.closest(".plyr")
    const playButton = playerRoot?.querySelector<HTMLElement>(
      ".plyr__control--overlaid, [data-plyr='play']"
    )

    playButton?.click()
  })
}

export function createMissAvSeekToTime(context: MissAvSeekContext) {
  return (timestamp: number) => {
    const video = document.querySelector(".player") as HTMLVideoElement | null
    if (!video || !Number.isFinite(timestamp)) return

    if (video.paused) {
      startMissAvVideo(video)
      startupSeekDelays.forEach((delay) => {
        window.setTimeout(() => seekMissAvVideo(video, timestamp), delay)
      })
    } else {
      seekMissAvVideo(video, timestamp)
    }

    void context.afterThumbnailSeek(".player")
  }
}

export const missAvProvider: VideoProvider = {
  id: "missav",
  label: "MissAV",
  matches: MISSAV_MATCHES,
  defaults: {
    displayMode: "embedded",
    autoOpen: true
  },
  mount: {
    button: ".plyr__time--duration",
    embedded: "div[x-show*='video_details']"
  },
  getPageKey: getMissAvPageKey,
  async loadPreview(context): Promise<PreviewData | null> {
    const thumbnail = await context.runProviderAction<MissAvThumbnailConfig>(
      "thumbnail-config"
    )
    const video = document.querySelector(".player") as HTMLVideoElement | null
    const duration = await waitForVideoDuration(video)

    return createSpriteGridPreview({
      columns: thumbnail.col || 6,
      frameCount: thumbnail.picNum,
      frameHeight: thumbnail.height || 168,
      frameWidth: thumbnail.width || 300,
      rows: thumbnail.row || 6,
      sampleRate: 3,
      seekToTime: createMissAvSeekToTime(context),
      urls: thumbnail.urls,
      videoDuration: duration
    })
  }
}
