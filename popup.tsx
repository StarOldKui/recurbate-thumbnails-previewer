import { useEffect, useState, type ReactNode } from "react"

import logoUrl from "url:assets/icon.rounded.png"
import "~style.css"
import { findHostProvider } from "~providers/registry"
import { getSettings, setSettings } from "~runtime/storage"
import type { Settings, VideoProvider } from "~runtime/types"

interface ActiveTab {
  id: number
  url: URL
}

interface ActiveSite {
  provider: VideoProvider
  pageKey: string | null
}

async function getActiveTab(): Promise<ActiveTab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id || !tab.url) return null

  try {
    return {
      id: tab.id,
      url: new URL(tab.url)
    }
  } catch {
    return null
  }
}

function getDomain(url: URL | null): string {
  if (!url) return "Unknown site"
  return url.hostname.replace(/^www\./, "")
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function sendOpenPreview(tabId: number, message: unknown): Promise<boolean> {
  for (const delay of [0, 100, 300, 700]) {
    if (delay) await sleep(delay)

    try {
      const response = await chrome.tabs.sendMessage(tabId, message)
      if (response?.success) return true
    } catch {}
  }

  return false
}

function PopupFrame({ children }: { children: ReactNode }) {
  return (
    <main className="rtp-popup-shell">
      <div className="rtp-popup-background" />
      <div className="rtp-popup-glow rtp-popup-glow-top" />
      <div className="rtp-popup-glow rtp-popup-glow-bottom" />
      <div className="rtp-popup-content">
        <div className="rtp-popup-header">
          <img
            alt="Video Thumbnails Previewer Logo"
            className="rtp-popup-logo"
            src={logoUrl}
          />
          <div className="rtp-popup-brand">Video Thumbnails Previewer</div>
        </div>
        {children}
      </div>
    </main>
  )
}

export default function Popup() {
  const [activeSite, setActiveSite] = useState<ActiveSite | null>(null)
  const [activeUrl, setActiveUrl] = useState<URL | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [settings, setSettingsState] = useState<Settings | null>(null)

  useEffect(() => {
    const previousMargin = document.body.style.margin
    const previousBackground = document.body.style.background
    document.body.style.margin = "0"
    document.body.style.background = "#111827"

    return () => {
      document.body.style.margin = previousMargin
      document.body.style.background = previousBackground
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const tab = await getActiveTab()
        if (cancelled) return

        setActiveUrl(tab?.url || null)
        const provider = tab?.url ? findHostProvider(tab.url) : null
        if (!provider || !tab?.url) return

        setActiveSite({
          provider,
          pageKey: provider.getPageKey(tab.url)
        })
        setSettingsState(await getSettings(provider))
      } finally {
        if (!cancelled) setLoaded(true)
      }
    }

    init()

    return () => {
      cancelled = true
    }
  }, [])

  const updateSettings = async (next: Settings) => {
    if (!activeSite) return
    setSettingsState(next)
    await setSettings(activeSite.provider, next)
  }

  const openPreview = async () => {
    if (!settings) return

    setPreviewError(null)
    const tab = await getActiveTab()
    const provider = tab?.url ? findHostProvider(tab.url) : null
    const nextPageKey = tab && provider ? provider.getPageKey(tab.url) : null
    if (!tab || !provider || !nextPageKey) return

    const opened = await sendOpenPreview(tab.id, {
      type: "rtp:open-preview",
      providerId: provider.id,
      pageKey: nextPageKey,
      mode: settings.displayMode
    })
    if (opened) {
      window.close()
      return
    }
    setPreviewError("Preview could not be opened. Please try again.")
  }

  if (!activeSite || !settings) {
    return (
      <PopupFrame>
        {!loaded ? (
          <div className="rtp-popup-loader" aria-label="Loading">
            <span />
            <span />
            <span />
          </div>
        ) : (
          <section className="rtp-popup-card">
            <div className="rtp-popup-card-row">
              <div className="rtp-popup-site-name">{getDomain(activeUrl)}</div>
              <span className="rtp-popup-status rtp-popup-status-muted">
                Not Supported
              </span>
            </div>
            <p className="rtp-popup-muted">This page is not supported yet.</p>
          </section>
        )}
      </PopupFrame>
    )
  }

  return (
    <PopupFrame>
      <section className="rtp-popup-card">
        <div className="rtp-popup-card-row">
          <div className="rtp-popup-site-name">
            {activeSite.provider.label}
          </div>
          <span className="rtp-popup-status rtp-popup-status-active">
            Activated
          </span>
        </div>
      </section>

      <section className="rtp-popup-card">
        <div className="rtp-popup-section-title">
          <span className="rtp-popup-section-icon" />
          Display Settings
        </div>

        <div className="rtp-display-toggle">
          <button
            className={
              settings.displayMode === "popup"
                ? "rtp-display-option rtp-display-option-active"
                : "rtp-display-option"
            }
            onClick={() =>
              updateSettings({
                ...settings,
                displayMode: "popup"
              })
            }
            type="button">
            Popup
          </button>
          <button
            className={
              settings.displayMode === "embedded"
                ? "rtp-display-option rtp-display-option-active"
                : "rtp-display-option"
            }
            onClick={() =>
              updateSettings({
                ...settings,
                displayMode: "embedded"
              })
            }
            type="button">
            Embedded
          </button>
        </div>

        <div className="rtp-popup-toggle-row">
          <span>Auto Trigger</span>
          <button
            aria-pressed={settings.autoOpen}
            className={
              settings.autoOpen
                ? "rtp-switch rtp-switch-active"
                : "rtp-switch"
            }
            onClick={() =>
              updateSettings({
                ...settings,
                autoOpen: !settings.autoOpen
              })
            }
            type="button">
            <span />
          </button>
        </div>

        <div className="rtp-popup-divider" />

        <button
          className="rtp-generate-button"
          disabled={!activeSite.pageKey}
          onClick={openPreview}
          type="button">
          <span className="rtp-generate-icon" />
          Generate Preview
        </button>
        {!activeSite.pageKey ? (
          <p className="rtp-popup-muted">
            Open a supported video page to generate previews.
          </p>
        ) : null}
        {previewError ? <p className="rtp-popup-muted">{previewError}</p> : null}
      </section>
    </PopupFrame>
  )
}
