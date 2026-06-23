import type { PlasmoMessaging } from "@plasmohq/messaging"

import {
  registerRequest,
  throwIfAborted,
  unregisterRequest
} from "~background/request-registry"

interface FetchImagesRequest {
  requestId?: string
  urls: string[]
}

interface FetchImagesResponse {
  success: boolean
  dataUrls?: string[]
  error?: string
}

const FETCH_IMAGE_CONCURRENCY = 6

function getImageMimeType(url: string, contentType: string): string {
  const mimeType = contentType.split(";")[0].trim().toLowerCase()
  if (mimeType.startsWith("image/")) return mimeType

  const pathname = new URL(url).pathname.toLowerCase()
  if (pathname.endsWith(".png")) return "image/png"
  if (pathname.endsWith(".webp")) return "image/webp"
  if (pathname.endsWith(".gif")) return "image/gif"

  return "image/jpeg"
}

async function blobToDataUrl(blob: Blob, mimeType: string): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ""

  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }

  return `data:${mimeType};base64,${btoa(binary)}`
}

function attachAbortSignal(
  controller: AbortController,
  signal?: AbortSignal
): () => void {
  if (!signal) return () => {}
  const onAbort = () => controller.abort()
  signal.addEventListener("abort", onAbort, { once: true })
  return () => signal.removeEventListener("abort", onAbort)
}

async function fetchImage(url: string, signal?: AbortSignal): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    throwIfAborted(signal)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10000)
    const detachAbort = attachAbortSignal(controller, signal)

    try {
      const response = await fetch(url, {
        signal: controller.signal
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const contentType = response.headers.get("content-type") || ""
      const mimeType = contentType.split(";")[0].trim().toLowerCase()
      const isUnknownBinary =
        !mimeType ||
        mimeType === "application/octet-stream" ||
        mimeType === "binary/octet-stream"

      if (mimeType && !mimeType.startsWith("image/") && !isUnknownBinary) {
        throw new Error(`Non-image response: ${contentType}`)
      }

      return await blobToDataUrl(
        await response.blob(),
        getImageMimeType(url, contentType)
      )
    } catch (error) {
      if (attempt === 2) throw error
      await new Promise((resolve) => setTimeout(resolve, 1000))
    } finally {
      clearTimeout(timer)
      detachAbort()
    }
  }

  throw new Error("Unexpected image fetch flow")
}

async function fetchImages(urls: string[], signal?: AbortSignal): Promise<string[]> {
  const results: string[] = new Array(urls.length)
  let nextIndex = 0

  const worker = async () => {
    while (nextIndex < urls.length) {
      throwIfAborted(signal)
      const index = nextIndex++
      results[index] = await fetchImage(urls[index], signal)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(FETCH_IMAGE_CONCURRENCY, urls.length) }, worker)
  )

  return results
}

const handler: PlasmoMessaging.MessageHandler<
  FetchImagesRequest,
  FetchImagesResponse
> = async (req, res) => {
  const requestId = req.body?.requestId
  const signal = registerRequest(requestId)

  try {
    const urls = req.body?.urls
    if (!Array.isArray(urls)) {
      res.send({ success: false, error: "Invalid urls" })
      return
    }

    res.send({
      success: true,
      dataUrls: await fetchImages(urls, signal)
    })
  } catch (error) {
    res.send({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    })
  } finally {
    unregisterRequest(requestId)
  }
}

export default handler
