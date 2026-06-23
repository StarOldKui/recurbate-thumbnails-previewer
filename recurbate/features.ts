import { Zip, ZipPassThrough } from "fflate"
import type { RecurbateFeature } from "~runtime/types"

interface VideoLink {
  href: string
  title: string
  videoId: string
}

const VIDEO_CONCURRENCY = 6
const BETWEEN_ITEM_SLEEP_MS = 250
const ACTION_BUTTON_CLASS = "btn btn-secondary btn-base-outline btn-xs"

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function extractVideoId(href: string): string {
  return href.match(/\/video\/(\d+)/)?.[1] || ""
}

function collectVideoLinks(doc: Document): VideoLink[] {
  return Array.from(
    doc.querySelectorAll<HTMLAnchorElement>(
      '.video-thumb a.g-event[data-gevent="video"]'
    )
  ).map((anchor) => ({
    href: anchor.href,
    title: (anchor.getAttribute("title") || anchor.textContent || "").trim(),
    videoId: extractVideoId(anchor.href)
  }))
}

function dedupeVideoLinks(links: VideoLink[]): VideoLink[] {
  const seen = new Set<string>()
  const result: VideoLink[] = []

  for (const link of links) {
    if (!link.videoId || seen.has(link.videoId)) continue
    seen.add(link.videoId)
    result.push(link)
  }

  return result
}

function getPageUrl(pageNumber: number): string | null {
  const anchor = document.querySelector<HTMLAnchorElement>(
    `.pager ul.pagination a.page-link[data-page="${pageNumber}"]`
  )
  if (anchor?.href) return anchor.href

  const match = location.pathname.match(/^(\/performer\/[^/?#]+)/)
  if (!match) return null

  return new URL(`${match[1]}/page/${pageNumber}`, location.origin).href
}

async function withIframe<T>(
  url: string,
  runner: (win: Window) => Promise<T>,
  timeoutMs = 18000
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const iframe = document.createElement("iframe")
    iframe.src = url
    iframe.referrerPolicy = "same-origin"
    iframe.style.height = "900px"
    iframe.style.left = "-99999px"
    iframe.style.opacity = "0.01"
    iframe.style.position = "fixed"
    iframe.style.top = "0"
    iframe.style.width = "1280px"
    document.body.appendChild(iframe)

    const timer = setTimeout(() => {
      iframe.remove()
      reject(new Error("Frame timeout"))
    }, timeoutMs)

    iframe.onload = async () => {
      clearTimeout(timer)
      try {
        if (!iframe.contentWindow?.document?.body) {
          throw new Error("Frame inaccessible")
        }
        const result = await runner(iframe.contentWindow)
        iframe.remove()
        resolve(result)
      } catch (error) {
        iframe.remove()
        reject(error)
      }
    }
  })
}

async function runWithConcurrency<TItem>(
  items: TItem[],
  limit: number,
  worker: (item: TItem, index: number) => Promise<void>
): Promise<void> {
  let index = 0

  const lanes = Array.from({ length: Math.max(1, limit) }, async () => {
    while (index < items.length) {
      const ownIndex = index++
      await worker(items[ownIndex], ownIndex)
      await sleep(BETWEEN_ITEM_SLEEP_MS + Math.round(Math.random() * 200))
    }
  })

  await Promise.all(lanes)
}

function dataUrlToUint8(dataUrl: string): Uint8Array {
  const commaIndex = dataUrl.indexOf(",")
  if (commaIndex < 0) return new Uint8Array()

  const header = dataUrl.slice(0, commaIndex)
  const payload = dataUrl.slice(commaIndex + 1)
  if (/;base64/i.test(header)) {
    const binary = atob(payload)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  }

  return new TextEncoder().encode(decodeURIComponent(payload))
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

function filenameFromUrl(url: string, ext: string): string {
  const safe = url.replace(/^https?:\/\//, "https__").replace(/[\\/:*?"<>|]/g, "_")
  return `${safe}.${ext}`
}

async function collectLinksForPages(pageNumbers: number[]): Promise<VideoLink[]> {
  const seen = new Set<string>()
  const links: VideoLink[] = []

  for (const pageNumber of pageNumbers) {
    const pageUrl = pageNumber === 1 ? location.href : getPageUrl(pageNumber)
    if (!pageUrl) continue

    const pageLinks =
      pageNumber === 1
        ? collectVideoLinks(document)
        : await withIframe(pageUrl, (win) =>
            Promise.resolve(collectVideoLinks(win.document))
          ).catch(() => [])

    for (const link of dedupeVideoLinks(pageLinks)) {
      if (!link.videoId || seen.has(link.videoId)) continue
      seen.add(link.videoId)
      links.push(link)
    }
  }

  return links
}

function getPerformerZipName(): string {
  const domName =
    document.querySelector<HTMLElement>(".page-h1 .performer-link b")
      ?.textContent || ""
  const pathName = location.pathname.match(/\/performer\/([^/]+)/)?.[1] || ""
  const rawName = (domName || pathName || "performer").trim()
  const safeName = rawName.replace(/[\\/:*?"<>|\s]+/g, "_")
  return `recurbate_${safeName}.zip`
}

function createPageNumbers(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

function createActionButton(
  buttonGroup: HTMLElement,
  text: string,
  dataAttribute: string,
  before: Node | null
): HTMLButtonElement {
  const button = document.createElement("button")
  button.type = "button"
  button.setAttribute(dataAttribute, "1")
  button.textContent = text
  button.className = ACTION_BUTTON_CLASS
  buttonGroup.insertBefore(button, before)
  return button
}

async function savePages(
  pageNumbers: number[],
  button: HTMLButtonElement,
  buttonText: string,
  context: Parameters<RecurbateFeature["mount"]>[0]
): Promise<void> {
  if (button.textContent?.includes("Saving")) return

  button.textContent = "Saving..."
  const links = await collectLinksForPages(pageNumbers)
  const failed: string[] = []
  const chunks: Uint8Array[] = []

  let zipDoneResolve: (() => void) | null = null
  const zipDone = new Promise<void>((resolve) => {
    zipDoneResolve = resolve
  })

  const zip = new Zip((error, chunk, final) => {
    if (error) {
      failed.push(error.message)
      zipDoneResolve?.()
      return
    }

    if (chunk?.length) chunks.push(chunk)
    if (final) {
      const blob = new Blob(
        chunks.map((part) => part.slice()),
        { type: "application/zip" }
      )
      downloadBlob(blob, getPerformerZipName())
      zipDoneResolve?.()
    }
  })

  try {
    await runWithConcurrency(links, VIDEO_CONCURRENCY, async (link) => {
      try {
        const stripeUrl = await context.findResource(link.href, "-stripe", 180000)
        if (!stripeUrl) {
          failed.push(link.href)
          return
        }

        const [dataUrl] = await context.fetchImages([stripeUrl])
        if (!dataUrl) {
          failed.push(link.href)
          return
        }

        const suffix = stripeUrl.split(".").pop()?.split("?")[0] || "jpg"
        const entry = new ZipPassThrough(filenameFromUrl(link.href, suffix))
        zip.add(entry)
        entry.push(dataUrlToUint8(dataUrl), true)
      } catch {
        failed.push(link.href)
      }
    })

    if (failed.length) {
      const entry = new ZipPassThrough("errors.txt")
      zip.add(entry)
      entry.push(new TextEncoder().encode(failed.join("\n")), true)
    }
    zip.end()
    await zipDone
  } finally {
    button.textContent = buttonText
  }
}

function mountOpenAllButton(
  buttonGroup: HTMLElement,
  context: Parameters<RecurbateFeature["mount"]>[0]
): void {
  if (buttonGroup.querySelector("[data-rtp-open-all]")) return

  const button = createActionButton(
    buttonGroup,
    "Open All",
    "data-rtp-open-all",
    buttonGroup.firstChild
  )

  button.addEventListener("click", async () => {
    if (button.textContent === "Open All Clicked") return
    button.textContent = "Open All Clicked"

    const links = collectVideoLinks(document).map((link) => link.href)
    await context.openTabs(links)
  })
}

function mountSaveButtons(
  buttonGroup: HTMLElement,
  context: Parameters<RecurbateFeature["mount"]>[0]
): void {
  const pagination = document.querySelector(".pager ul.pagination")
  const totalPages = pagination
    ? Number.parseInt(pagination.getAttribute("data-pg-count") || "1", 10)
    : 1

  if (!buttonGroup.querySelector("[data-rtp-save-range]")) {
    const button = createActionButton(
      buttonGroup,
      "Save Range",
      "data-rtp-save-range",
      buttonGroup.firstChild
    )

    button.addEventListener("click", async () => {
      const input = window.prompt(
        `Enter page range (format: 1-${totalPages})`,
        `1-${totalPages}`
      )
      if (!input) return

      const match = input.trim().match(/^(\d+)-(\d+)$/)
      if (!match) {
        alert(`Invalid format. Use: 1-${totalPages}`)
        return
      }

      const start = Number.parseInt(match[1], 10)
      const end = Number.parseInt(match[2], 10)
      if (start < 1 || end > totalPages || start > end) {
        alert(`Invalid range. Must be between 1-${totalPages}`)
        return
      }

      await savePages(
        createPageNumbers(start, end),
        button,
        "Save Range",
        context
      )
    })
  }

  if (!buttonGroup.querySelector("[data-rtp-save-all]")) {
    const button = createActionButton(
      buttonGroup,
      "Save All",
      "data-rtp-save-all",
      buttonGroup.querySelector("[data-rtp-open-all]")
    )

    button.addEventListener("click", async () => {
      await savePages(
        createPageNumbers(1, totalPages),
        button,
        "Save All",
        context
      )
    })
  }
}

export const recurbateFeatures: RecurbateFeature[] = [
  {
    id: "recurbate-performer-actions",
    matches(url) {
      return url.pathname.includes("/performer/")
    },
    mount(context) {
      const init = () => {
        const buttonGroup = document.querySelector(
          ".btn-group.filter-type"
        ) as HTMLElement | null
        if (!buttonGroup) return false

        mountOpenAllButton(buttonGroup, context)
        mountSaveButtons(buttonGroup, context)
        return true
      }

      if (init()) return

      const timer = window.setTimeout(init, 1200)
      return () => window.clearTimeout(timer)
    }
  }
]
