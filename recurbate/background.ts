import type { ActionMap } from "~background/action-types"
import { runMainWorld } from "~background/run-main-world"

async function seekRecurbate(tabId: number, timestamp: number): Promise<void> {
  const result = await runMainWorld<{
    error?: string
    success: boolean
  }>(tabId, async (targetTime) => {
    const video = document.querySelector("video") as HTMLVideoElement | null
    if (!video || !Number.isFinite(targetTime)) {
      return { success: false, error: "Recurbate video not found" }
    }

    const clampedTime = Math.max(0, targetTime)
    const timeline = (window as any).timeline
    if (typeof timeline?.resumeStreamLoading !== "function") {
      return { success: false, error: "Recurbate timeline API not found" }
    }

    const resumeStreamLoading = () => {
      try {
        timeline.resumeStreamLoading(clampedTime)
      } catch {}
    }

    try {
      timeline?.gotoTime?.(clampedTime)
    } catch {}

    video.currentTime = clampedTime

    try {
      timeline?.scrollToTime?.(clampedTime, true)
      timeline?.updateActiveFrame?.()
    } catch {}
    resumeStreamLoading()

    await new Promise((resolve) => setTimeout(resolve, 150))

    if (Math.abs(video.currentTime - clampedTime) > 1) {
      video.currentTime = clampedTime
    }

    resumeStreamLoading()

    return { success: true }
  }, [timestamp])

  if (!result?.success) throw new Error(result?.error || "Recurbate seek failed")
}

export const recurbateActions: ActionMap = {
  async seek(payload, context) {
    if (!context.senderTabId) throw new Error("Missing sender tab")

    const timestamp = Number(
      (payload as { timestamp?: unknown } | undefined)?.timestamp
    )
    if (!Number.isFinite(timestamp)) throw new Error("Invalid Recurbate timestamp")

    await seekRecurbate(context.senderTabId, timestamp)
    return null
  }
}
