import { recurbateFeatures } from "~recurbate/features"
import {
  getRecurbatePageKey,
  RECURBATE_MATCHES
} from "~recurbate/url"
import type {
  PreviewContext,
  PreviewData,
  RecurbateFeature,
  RecurbateMount,
  VideoProvider
} from "~runtime/types"
import {
  processSpriteGridImages,
  waitForVideoDuration
} from "~runtime/processing"

export const RECURBATE_MOUNT: RecurbateMount = {
  button: ".plyr__time--current",
  embedded: ".video-content-wrapper ~ .video-info"
}

export const RECURBATE_FEATURES: RecurbateFeature[] = recurbateFeatures

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForTimeline(): Promise<HTMLElement> {
  let clickedPlay = false

  for (let i = 0; i < 300; i++) {
    const timeline = document.getElementById("timeline")
    if (timeline) return timeline

    if (!clickedPlay) {
      const playButton = document.getElementById("play_button") as HTMLElement | null
      if (playButton) {
        playButton.click()
        clickedPlay = true
      }
    }

    await sleep(100)
  }

  throw new Error("Recurbate timeline not found")
}

function getStripeUrl(timeline: HTMLElement): string | null {
  const dataUrl = timeline.getAttribute("data-background-image")
  if (dataUrl) return dataUrl

  const match = timeline.style.backgroundImage.match(
    /url\(["']?(.*?-stripe\.(?:jpg|jpeg|png|webp).*?)["']?\)/i
  )
  return match?.[1] || null
}

export function getRecurbateTimelineDuration(
  timeline: Pick<HTMLElement, "dataset">
): number | undefined {
  const duration = Number(timeline.dataset.duration)
  if (!Number.isFinite(duration) || duration <= 0) return undefined

  const prerollDuration = Number(timeline.dataset.prerollDuration)
  return duration + (Number.isFinite(prerollDuration) ? prerollDuration : 0)
}

export function createRecurbateSeekToTime(
  context: Pick<PreviewContext, "afterThumbnailSeek" | "runProviderAction">
): (timestamp: number) => Promise<void> {
  return async (timestamp: number) => {
    if (!Number.isFinite(timestamp)) return

    try {
      await context.runProviderAction<void>("seek", { timestamp })
    } catch {
      const video = document.querySelector("video") as HTMLVideoElement | null
      if (!video) return
      video.currentTime = timestamp
    }

    await context.afterThumbnailSeek()
  }
}

export async function loadRecurbatePreview(
  context: PreviewContext
): Promise<PreviewData> {
  const timeline = await waitForTimeline()
  const stripeUrl = getStripeUrl(timeline)
  if (!stripeUrl) throw new Error("Recurbate stripe image not found")

  const dataUrls = await context.fetchImages([stripeUrl])
  const duration =
    (await waitForVideoDuration(document.querySelector("video"))) ||
    getRecurbateTimelineDuration(timeline)

  return processSpriteGridImages(
    dataUrls,
    1,
    128,
    0,
    duration,
    createRecurbateSeekToTime(context)
  )
}

export const recurbateProvider: VideoProvider = {
  id: "recurbate",
  label: "Recurbate",
  matches: RECURBATE_MATCHES,
  defaults: {
    displayMode: "embedded",
    autoOpen: true
  },
  mount: RECURBATE_MOUNT,
  features: RECURBATE_FEATURES,
  getPageKey: getRecurbatePageKey,
  loadPreview: loadRecurbatePreview
}
