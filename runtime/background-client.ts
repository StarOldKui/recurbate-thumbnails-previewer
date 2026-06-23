import { sendToBackground } from "@plasmohq/messaging"

const sendMessage = sendToBackground as (message: {
  name: string
  body?: unknown
}) => Promise<any>

function createRequestId(name: string): string {
  return `${name}:${Date.now()}:${Math.random().toString(36).slice(2)}`
}

async function sendAbortable(
  name: string,
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<any> {
  if (!signal) {
    return sendMessage({ name, body })
  }

  if (signal.aborted) throw new Error("Request aborted")

  const requestId = createRequestId(name)
  let onAbort: (() => void) | null = null
  const abortPromise = new Promise((_resolve, reject) => {
    onAbort = () => {
      sendMessage({
        name: "cancel-request",
        body: { requestId }
      }).catch(() => {})
      reject(new Error("Request aborted"))
    }
    signal.addEventListener("abort", onAbort, { once: true })
  })

  try {
    return await Promise.race([
      sendMessage({
        name,
        body: {
          ...body,
          requestId
        }
      }),
      abortPromise
    ])
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort)
  }
}

export async function fetchImages(
  urls: string[],
  signal?: AbortSignal
): Promise<string[]> {
  const response = await sendAbortable("fetch-images", { urls }, signal)

  if (!response?.success || !response.dataUrls) {
    throw new Error(response?.error || "Failed to fetch images")
  }

  return response.dataUrls
}

export async function runProviderAction<TResponse = unknown>(
  providerId: string,
  action: string,
  payload?: unknown,
  signal?: AbortSignal
): Promise<TResponse> {
  const response = await sendAbortable(
    "provider-action",
    { action, payload, providerId },
    signal
  )

  if (!response?.success) {
    throw new Error(response?.error || "Provider action failed")
  }

  return response.data as TResponse
}

export async function openTabs(urls: string[]): Promise<number> {
  const response = await sendToBackground({
    name: "open-tabs",
    body: { urls }
  })

  if (!response?.success) {
    throw new Error(response?.error || "Failed to open tabs")
  }

  return response.openedCount || 0
}

export async function findResource(
  videoUrl: string,
  pattern: string,
  timeoutMs?: number,
  signal?: AbortSignal
): Promise<string | null> {
  const response = await sendAbortable(
    "find-tab-resource",
    {
      videoUrl,
      pattern,
      timeoutMs
    },
    signal
  )

  if (!response?.success) {
    throw new Error(response?.error || "Failed to find resource")
  }

  return response.url || null
}
