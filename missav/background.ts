import type { ActionMap } from "~background/action-types"
import { runMainWorld } from "~background/run-main-world"

export interface MissAvThumbnailConfig {
  col: number
  picNum?: number
  height: number
  row: number
  urls: string[]
  width: number
}

async function getMissAvThumbnailConfig(
  tabId: number
): Promise<MissAvThumbnailConfig> {
  const result = await runMainWorld<{
    config?: MissAvThumbnailConfig
    error?: string
    success: boolean
  }>(tabId, async () => {
    for (let i = 0; i < 100; i++) {
      const thumbnail = (window as any).player?.config?.thumbnail
      if (Array.isArray(thumbnail?.urls) && thumbnail.urls.length > 0) {
        return {
          success: true,
          config: {
            col: thumbnail.col,
            height: thumbnail.height,
            picNum: thumbnail.pic_num,
            row: thumbnail.row,
            urls: thumbnail.urls,
            width: thumbnail.width
          }
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    return { success: false, error: "MissAV thumbnails not found" }
  })

  if (!result?.success || !result.config) {
    throw new Error(result?.error || "MissAV script failed")
  }
  return result.config
}

export const missAvActions: ActionMap = {
  async "thumbnail-config"(_payload, context) {
    if (!context.senderTabId) throw new Error("Missing sender tab")
    return getMissAvThumbnailConfig(context.senderTabId)
  }
}
