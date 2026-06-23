import type {
  PlasmoCSConfig,
  PlasmoGetOverlayAnchor,
  PlasmoGetShadowHostId,
  PlasmoGetStyle
} from "plasmo"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react"
import { createPortal } from "react-dom"

import cssText from "data-text:~style.css"
import { PreviewPanel } from "~components/PreviewPanel"
import { findHostProviders, findProvider } from "~providers/registry"
import {
  fetchImages,
  findResource,
  openTabs,
  runProviderAction
} from "~runtime/background-client"
import { getSettings, getSettingsKey } from "~runtime/storage"
import type {
  DisplayMode,
  PreviewData,
  PreviewState,
  Settings,
  VideoProvider
} from "~runtime/types"

export const config: PlasmoCSConfig = {
  matches: [
    "*://*.recu.me/*",
    "*://*.recu.club/*",
    "*://*.missav.ws/*",
    "*://*.missav.com/*"
  ],
  all_frames: false
}

export const getOverlayAnchor: PlasmoGetOverlayAnchor = async () =>
  document.body

export const getShadowHostId: PlasmoGetShadowHostId = () => "rtp-root"

export const getStyle: PlasmoGetStyle = () => {
  const style = document.createElement("style")
  style.textContent = cssText
  return style
}

interface OpenPreviewMessage {
  type: "rtp:open-preview"
  providerId: string
  pageKey: string
  mode: DisplayMode
}

interface PortalMountProps {
  children: ReactNode
  hostTag?: "div" | "span"
  insertPosition?: InsertPosition
  selector: string
  variant: "button" | "embedded"
}

function useCurrentUrl(): URL {
  const [href, setHref] = useState(location.href)

  useEffect(() => {
    const updateHref = () => {
      setHref((currentHref) =>
        currentHref === location.href ? currentHref : location.href
      )
    }

    const originalPushState = history.pushState
    const originalReplaceState = history.replaceState

    history.pushState = function (...args: Parameters<History["pushState"]>) {
      const result = originalPushState.apply(this, args)
      updateHref()
      return result
    }

    history.replaceState = function (
      ...args: Parameters<History["replaceState"]>
    ) {
      const result = originalReplaceState.apply(this, args)
      updateHref()
      return result
    }

    window.addEventListener("popstate", updateHref)
    const timer = window.setInterval(updateHref, 500)

    return () => {
      history.pushState = originalPushState
      history.replaceState = originalReplaceState
      window.removeEventListener("popstate", updateHref)
      window.clearInterval(timer)
    }
  }, [])

  return useMemo(() => new URL(href), [href])
}

function usePageStyles(): void {
  useEffect(() => {
    const id = "rtp-page-styles"
    if (document.getElementById(id)) return

    const style = document.createElement("style")
    style.id = id
    style.textContent = cssText
    document.documentElement.appendChild(style)
  }, [])
}

function removeStaleMounts(): void {
  document
    .querySelectorAll("[data-rtp-mount], #rtp-popup-container")
    .forEach((element) => element.remove())
}

removeStaleMounts()

function useSettings(
  provider: VideoProvider | null,
  pageKey: string | null
): Settings | null {
  const [settings, setSettings] = useState<Settings | null>(null)
  const settingsKey = provider ? getSettingsKey(provider.id) : null

  useEffect(() => {
    let cancelled = false

    const reload = async () => {
      const nextSettings = provider && pageKey ? await getSettings(provider) : null
      if (!cancelled) setSettings(nextSettings)
    }

    reload()

    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName === "local" && settingsKey && changes[settingsKey]) reload()
    }

    chrome.storage.onChanged.addListener(onChanged)
    return () => {
      cancelled = true
      chrome.storage.onChanged.removeListener(onChanged)
    }
  }, [provider?.id, pageKey, settingsKey])

  return settings
}

function PortalMount({
  children,
  hostTag = "div",
  insertPosition = "afterend",
  selector,
  variant
}: PortalMountProps) {
  const [host, setHost] = useState<HTMLElement | null>(null)

  useEffect(() => {
    let currentAnchor: Element | null = null
    let currentHost: HTMLElement | null = null

    const removeHost = () => {
      currentHost?.remove()
      currentAnchor = null
      currentHost = null
      setHost(null)
    }

    const removeDuplicateHosts = () => {
      document
        .querySelectorAll<HTMLElement>(`[data-rtp-mount="${variant}"]`)
        .forEach((element) => {
          if (element !== currentHost) element.remove()
        })
    }

    const mountIfNeeded = () => {
      const anchor = document.querySelector(selector)
      if (!anchor) {
        if (!currentHost?.isConnected) removeHost()
        return
      }

      if (!currentHost) {
        currentHost = document.createElement(hostTag)
        currentHost.dataset.rtpMount = variant

        if (variant === "button") {
          currentHost.style.display = "inline-flex"
          currentHost.style.margin = "0 6px"
        }

        setHost(currentHost)
      }

      if (currentHost.isConnected && currentAnchor === anchor) {
        removeDuplicateHosts()
        return
      }

      anchor.insertAdjacentElement(insertPosition, currentHost)
      currentAnchor = anchor
      removeDuplicateHosts()
    }

    mountIfNeeded()
    const timer = window.setInterval(mountIfNeeded, 500)

    return () => {
      window.clearInterval(timer)
      removeHost()
    }
  }, [hostTag, insertPosition, selector, variant])

  return host ? createPortal(children, host) : null
}

function BodyPortal({ children }: { children: ReactNode }) {
  return document.body ? createPortal(children, document.body) : null
}

export default function ContentApp() {
  usePageStyles()

  const url = useCurrentUrl()
  const provider = useMemo(() => findProvider(url), [url.href])
  const hostProviders = useMemo(() => findHostProviders(url), [url.href])
  const pageKey = useMemo(
    () => (provider ? provider.getPageKey(url) : null),
    [provider?.id, url.href]
  )
  const settings = useSettings(provider, pageKey)
  const [previewState, setPreviewState] = useState<PreviewState | null>(null)
  const [data, setData] = useState<PreviewData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const closePreviewRef = useRef<() => Promise<void>>(async () => {})
  const loadedToken = useRef<string>("")
  const modeRef = useRef<DisplayMode>("popup")
  const togglePreviewRef = useRef<() => void>(() => {})

  useEffect(() => {
    return () => data?.cleanup?.()
  }, [data])

  const setPreviewVisible = useCallback(
    (visible: boolean, mode: DisplayMode) => {
      if (!provider || !pageKey) return

      setPreviewState((currentState) => {
        if (
          currentState?.visible === visible &&
          currentState.mode === mode &&
          currentState.pageKey === pageKey
        ) {
          return currentState
        }

        return {
          visible,
          mode,
          pageKey,
          updatedAt: Date.now()
        }
      })
    },
    [provider?.id, pageKey]
  )

  const closePreview = useCallback(async () => {
    if (!provider || !pageKey || !settings) return
    setPreviewVisible(false, previewState?.mode || settings.displayMode)
    setData(null)
    setError(null)
    setLoading(false)
  }, [
    provider?.id,
    pageKey,
    previewState?.mode,
    settings?.displayMode,
    setPreviewVisible
  ])

  useEffect(() => {
    closePreviewRef.current = closePreview
  }, [closePreview])

  useEffect(() => {
    const isPreviewButtonEvent = (event: Event) =>
      event.target instanceof Element &&
      Boolean(event.target.closest(".rtp-button"))

    const stopPreviewButtonEvent = (event: Event) => {
      if (!isPreviewButtonEvent(event)) return
      event.stopPropagation()
    }

    const onPreviewButtonClick = (event: MouseEvent) => {
      if (!isPreviewButtonEvent(event)) return
      event.preventDefault()
      event.stopPropagation()
      togglePreviewRef.current()
    }

    document.addEventListener("pointerdown", stopPreviewButtonEvent, true)
    document.addEventListener("mousedown", stopPreviewButtonEvent, true)
    document.addEventListener("click", onPreviewButtonClick, true)

    return () => {
      document.removeEventListener("pointerdown", stopPreviewButtonEvent, true)
      document.removeEventListener("mousedown", stopPreviewButtonEvent, true)
      document.removeEventListener("click", onPreviewButtonClick, true)
    }
  }, [])

  const scrollToVideo = useCallback((selector = "video") => {
    document
      .querySelector(selector)
      ?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [])

  const visible = Boolean(
    pageKey && previewState?.visible && previewState.pageKey === pageKey
  )
  const canRenderEmbedded =
    visible && previewState?.mode === "embedded" && provider?.mount?.embedded
  const mode = canRenderEmbedded ? "embedded" : "popup"

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  const afterThumbnailSeek = useCallback(async (videoSelector = "video") => {
    if (modeRef.current === "embedded") {
      scrollToVideo(videoSelector)
      return
    }

    await closePreviewRef.current()
  }, [scrollToVideo])

  useEffect(() => {
    const cleanups: Array<() => void> = []

    for (const hostProvider of hostProviders) {
      if (!hostProvider.features?.length) continue

      for (const feature of hostProvider.features) {
        if (!feature.matches(url)) continue

        const cleanup = feature.mount({
          fetchImages,
          findResource,
          openTabs,
          runProviderAction: <TResponse = unknown,>(
            action: string,
            payload?: unknown
          ) => runProviderAction<TResponse>(hostProvider.id, action, payload)
        })

        if (typeof cleanup === "function") cleanups.push(cleanup)
      }
    }

    return () => cleanups.forEach((cleanup) => cleanup())
  }, [hostProviders, url.href])

  useEffect(() => {
    loadedToken.current = ""
    setData(null)
    setError(null)
    setLoading(false)

    if (!pageKey || !settings?.autoOpen) {
      setPreviewState(null)
      return
    }

    setPreviewVisible(true, settings.displayMode)
  }, [pageKey, settings?.autoOpen, setPreviewVisible])

  useEffect(() => {
    if (!pageKey || !settings) return

    setPreviewState((currentState) => {
      if (!currentState?.visible) return currentState
      if (currentState.pageKey !== pageKey) return currentState
      if (currentState.mode === settings.displayMode) return currentState

      return {
        ...currentState,
        mode: settings.displayMode
      }
    })
  }, [pageKey, settings?.displayMode])

  togglePreviewRef.current = () => {
    if (!provider || !pageKey || !settings) return

    setPreviewState((currentState) => {
      const isVisible =
        currentState?.visible === true && currentState.pageKey === pageKey

      return {
        visible: !isVisible,
        mode: isVisible ? currentState.mode : settings.displayMode,
        pageKey,
        updatedAt: Date.now()
      }
    })
  }

  useEffect(() => {
    const onMessage = (
      message: OpenPreviewMessage,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ) => {
      if (message?.type !== "rtp:open-preview") return

      const currentUrl = new URL(location.href)
      const currentProvider = findProvider(currentUrl)
      const currentPageKey = currentProvider?.getPageKey(currentUrl) || null
      if (
        !currentProvider ||
        !currentPageKey ||
        message.providerId !== currentProvider.id ||
        message.pageKey !== currentPageKey
      ) {
        sendResponse({ success: false })
        return
      }

      setPreviewState({
        visible: true,
        mode: message.mode,
        pageKey: currentPageKey,
        updatedAt: Date.now()
      })
      sendResponse({ success: true })
    }

    chrome.runtime.onMessage.addListener(onMessage)
    return () => chrome.runtime.onMessage.removeListener(onMessage)
  }, [])

  useEffect(() => {
    if (!provider || !pageKey || !settings || !visible || !previewState) return

    const token = `${provider.id}:${pageKey}:${previewState.updatedAt}`
    if (loadedToken.current === token) return
    loadedToken.current = token

    let cancelled = false
    const controller = new AbortController()

    setLoading(true)
    setError(null)
    setData(null)

    provider.loadPreview({
      pageKey,
      settings,
      afterThumbnailSeek,
      closePreview: () => closePreviewRef.current(),
      openTabs,
      scrollToVideo,
      signal: controller.signal,
      fetchImages: (urls: string[]) => fetchImages(urls, controller.signal),
      findResource: (videoUrl: string, pattern: string, timeoutMs?: number) =>
        findResource(videoUrl, pattern, timeoutMs, controller.signal),
      runProviderAction: <TResponse = unknown,>(
        action: string,
        payload?: unknown
      ) =>
        runProviderAction<TResponse>(
          provider.id,
          action,
          payload,
          controller.signal
        )
    })
      .then((result) => {
        if (cancelled) return
        setData(result)
      })
      .catch((loadError) => {
        if (cancelled || controller.signal.aborted) return
        setData(null)
        setError(
          loadError instanceof Error ? loadError.message : String(loadError)
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
      if (loadedToken.current === token) loadedToken.current = ""
    }
  }, [
    afterThumbnailSeek,
    provider?.id,
    pageKey,
    Boolean(settings),
    visible,
    previewState?.updatedAt,
    scrollToVideo
  ])

  if (!provider || !settings || !pageKey) return null

  const panel = (
    <PreviewPanel
      data={data}
      error={error}
      loading={loading}
      mode={mode}
      onClose={closePreview}
      title="Video Thumbnails Previewer"
    />
  )

  return (
    <div className="rtp-root">
      {provider.mount?.button ? (
        <PortalMount
          hostTag="span"
          selector={provider.mount.button}
          variant="button">
          <button
            className={`rtp-button rtp-button-${provider.id} plyr__control`}
            type="button">
            Thumbnails
          </button>
        </PortalMount>
      ) : null}

      {visible && mode === "embedded" && provider.mount?.embedded ? (
        <PortalMount
          insertPosition={provider.mount.embeddedPosition || "afterbegin"}
          selector={provider.mount.embedded}
          variant="embedded">
          {panel}
        </PortalMount>
      ) : null}

      {visible && mode === "popup" ? <BodyPortal>{panel}</BodyPortal> : null}
    </div>
  )
}
