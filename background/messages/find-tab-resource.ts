import type { PlasmoMessaging } from "@plasmohq/messaging"

import {
  registerRequest,
  throwIfAborted,
  unregisterRequest
} from "~background/request-registry"

interface FindTabResourceRequest {
  requestId?: string
  videoUrl: string
  pattern?: string
  timeoutMs?: number
}

interface FindTabResourceResponse {
  success: boolean
  url?: string | null
  error?: string
}

const TAB_READY_TIMEOUT_MS = 30000
const DEFAULT_RESOURCE_TIMEOUT_MS = 180000
const MAX_RESOURCE_TIMEOUT_MS = 180000

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

async function waitTabReady(
  tabId: number,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false

    const finish = (error?: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      chrome.tabs.onUpdated.removeListener(onUpdated)
      signal?.removeEventListener("abort", onAbort)

      if (error) {
        reject(error instanceof Error ? error : new Error(String(error)))
        return
      }

      resolve()
    }

    const onAbort = () => finish(new Error("Request aborted"))
    const onUpdated = (
      updatedTabId: number,
      info: chrome.tabs.TabChangeInfo
    ) => {
      if (
        updatedTabId === tabId &&
        (info.status === "loading" || info.status === "complete")
      ) {
        finish()
      }
    }

    const timer = setTimeout(() => {
      finish(new Error("Tab load timeout"))
    }, timeoutMs)

    signal?.addEventListener("abort", onAbort, { once: true })
    chrome.tabs.onUpdated.addListener(onUpdated)
    chrome.tabs
      .get(tabId)
      .then((tab) => {
        if (tab.status === "loading" || tab.status === "complete") finish()
      })
      .catch(finish)
  })
}

const handler: PlasmoMessaging.MessageHandler<
  FindTabResourceRequest,
  FindTabResourceResponse
> = async (req, res) => {
  const {
    requestId,
    videoUrl,
    pattern = "-stripe",
    timeoutMs = DEFAULT_RESOURCE_TIMEOUT_MS
  } = req.body || {}
  const signal = registerRequest(requestId)
  let tabId: number | null = null

  try {
    throwIfAborted(signal)

    if (!videoUrl) {
      res.send({ success: false, error: "Missing videoUrl" })
      return
    }

    if (!isAllowedTargetUrl(req.sender.tab?.url, videoUrl)) {
      res.send({ success: false, error: "Find resource denied" })
      return
    }

    const tab = await chrome.tabs.create({ url: videoUrl, active: false })
    tabId = tab.id || null
    if (!tabId) throw new Error("Failed to create tab")

    const onAbort = () => {
      if (tabId !== null) chrome.tabs.remove(tabId).catch(() => {})
    }
    signal?.addEventListener("abort", onAbort, { once: true })
    throwIfAborted(signal)

    await waitTabReady(tabId, TAB_READY_TIMEOUT_MS, signal)
    throwIfAborted(signal)

    const resourceTimeoutMs = Math.min(
      Math.max(10000, timeoutMs),
      MAX_RESOURCE_TIMEOUT_MS
    )

    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      args: [pattern, resourceTimeoutMs],
      func: async (resourcePattern: string, waitMs: number) => {
        const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

        try {
          const currentWindow = window as any
          const CanvasElement = currentWindow.HTMLCanvasElement
          if (CanvasElement?.prototype?.getContext) {
            const getContext = CanvasElement.prototype.getContext
            CanvasElement.prototype.getContext = function(
              type: string,
              ...contextArgs: any[]
            ) {
              const normalizedType = String(type || "").toLowerCase()
              if (
                normalizedType === "webgl" ||
                normalizedType === "webgl2" ||
                normalizedType === "webgpu"
              ) {
                return null
              }
              return getContext.apply(this, [type, ...contextArgs])
            }
          }
          if (currentWindow.AudioContext) currentWindow.AudioContext = function() {}
          if (currentWindow.webkitAudioContext) {
            currentWindow.webkitAudioContext = function() {}
          }
        } catch {}

        function matchesResource(name: string): boolean {
          if (resourcePattern === "-stripe") {
            return /-stripe\.(jpg|jpeg|png|webp)/i.test(name)
          }

          return name.includes(resourcePattern)
        }

        function findResource(): string | null {
          const entries = performance.getEntriesByType(
            "resource"
          ) as PerformanceResourceTiming[]
          const resource = entries.find((entry) => matchesResource(entry.name))
          return resource?.name || null
        }

        async function waitByPolling(): Promise<string | null> {
          const start = Date.now()
          while (Date.now() - start < waitMs) {
            const found = findResource()
            if (found) return found
            await sleep(250)
          }

          return null
        }

        const initialResource = findResource()
        if (initialResource) return initialResource

        if (typeof PerformanceObserver !== "function") {
          return waitByPolling()
        }

        return new Promise<string | null>((resolve) => {
          let done = false
          let checkTimer: number | null = null
          let observer: PerformanceObserver | null = null
          let timeoutTimer: number | null = null

          const finish = (url: string | null) => {
            if (done) return
            done = true
            if (checkTimer !== null) window.clearInterval(checkTimer)
            if (timeoutTimer !== null) window.clearTimeout(timeoutTimer)
            observer?.disconnect()
            resolve(url)
          }

          observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (matchesResource(entry.name)) {
                finish(entry.name)
                return
              }
            }
          })

          try {
            observer.observe({ type: "resource", buffered: true })
          } catch {}

          checkTimer = window.setInterval(() => {
            const found = findResource()
            if (found) finish(found)
          }, 250)

          timeoutTimer = window.setTimeout(() => finish(null), waitMs)
        })
      }
    })

    res.send({ success: true, url: result.result || null })
  } catch (error) {
    res.send({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    })
  } finally {
    if (tabId !== null) {
      try {
        await chrome.tabs.remove(tabId)
      } catch {}
    }
    unregisterRequest(requestId)
  }
}

export default handler
