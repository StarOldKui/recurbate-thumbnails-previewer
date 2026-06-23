import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { MISSAV_MATCHES } from "~missav/url"
import { RECURBATE_MATCHES } from "~recurbate/url"

const contentPath = fileURLToPath(new URL("../../content.tsx", import.meta.url))

function readContent(): string {
  return readFileSync(contentPath, "utf8")
}

describe("content script config", () => {
  it("injects only on supported hosts", () => {
    expect(RECURBATE_MATCHES).toEqual([
      "*://*.recu.me/*",
      "*://*.recu.club/*"
    ])
    expect(MISSAV_MATCHES).toEqual([
      "*://*.missav.ws/*",
      "*://*.missav.com/*"
    ])

    const source = readContent()
    expect(source).toContain('"*://*.recu.me/*"')
    expect(source).toContain('"*://*.recu.club/*"')
    expect(source).toContain('"*://*.missav.ws/*"')
    expect(source).toContain('"*://*.missav.com/*"')
    expect(source).not.toContain("REACT_APP")
  })

  it("uses a stable Plasmo shadow host id and message type", () => {
    const source = readContent()

    expect(source).toContain('getShadowHostId: PlasmoGetShadowHostId')
    expect(source).toContain('"rtp-root"')
    expect(source).toContain('"rtp:open-preview"')
  })

  it("tracks URL changes through history events and polling", () => {
    const source = readContent()

    expect(source).toContain("history.pushState")
    expect(source).toContain("history.replaceState")
    expect(source).toContain('window.addEventListener("popstate", updateHref)')
    expect(source).toContain("window.setInterval(updateHref, 500)")
  })

  it("auto opens from settings without page lifecycle caches", () => {
    const source = readContent()

    expect(source).toContain("settings?.autoOpen")
    expect(source).not.toContain("autoOpenedProviders")
    expect(source).not.toContain("autoOpenScope")
  })

  it("handles preview button clicks through page-level delegated events", () => {
    const source = readContent()
    const stopHandler = source.match(
      /const stopPreviewButtonEvent = \(event: Event\) => \{([\s\S]*?)\n    \}/
    )?.[1]

    expect(source).toContain('event.target.closest(".rtp-button")')
    expect(source).toContain(
      'document.addEventListener("click", onPreviewButtonClick, true)'
    )
    expect(stopHandler).not.toContain("event.preventDefault()")
    expect(source).not.toContain("onClick={() => togglePreviewRef.current()}")
  })

  it("reuses portal hosts and removes stale mounts", () => {
    const source = readContent()

    expect(source).toContain(
      "anchor.insertAdjacentElement(insertPosition, currentHost)"
    )
    expect(source).toContain("removeDuplicateHosts")
    expect(source).toContain('`[data-rtp-mount="${variant}"]`')
    expect(source).toContain("[data-rtp-mount], #rtp-popup-container")
    expect(source).toContain("removeStaleMounts()")
  })

  it("allows an aborted preview load to retry", () => {
    const source = readContent()

    expect(source).toContain(
      'if (loadedToken.current === token) loadedToken.current = ""'
    )
  })

  it("renders popup previews through a document body portal", () => {
    const source = readContent()

    expect(source).toContain("function BodyPortal")
    expect(source).toContain("<BodyPortal>{panel}</BodyPortal>")
  })
})
