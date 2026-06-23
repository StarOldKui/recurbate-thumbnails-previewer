import type { PlasmoMessaging } from "@plasmohq/messaging"

interface OpenTabsRequest {
  urls: string[]
}

interface OpenTabsResponse {
  success: boolean
  openedCount?: number
  error?: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isAllowedTargetUrl(
  senderUrl: string | undefined,
  targetUrl: string
): boolean {
  try {
    if (!senderUrl) return false
    const sender = new URL(senderUrl)
    const target = new URL(targetUrl)
    return (
      ["http:", "https:"].includes(target.protocol) &&
      target.hostname === sender.hostname
    )
  } catch {
    return false
  }
}

const handler: PlasmoMessaging.MessageHandler<
  OpenTabsRequest,
  OpenTabsResponse
> = async (req, res) => {
  try {
    const urls = req.body?.urls || []
    if (!Array.isArray(urls)) {
      res.send({ success: false, error: "Invalid urls" })
      return
    }

    if (urls.some((url) => !isAllowedTargetUrl(req.sender.tab?.url, url))) {
      res.send({ success: false, error: "Open tabs denied" })
      return
    }

    for (const url of urls) {
      await chrome.tabs.create({ url, active: false })
      await sleep(100)
    }

    res.send({ success: true, openedCount: urls.length })
  } catch (error) {
    res.send({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

export default handler
