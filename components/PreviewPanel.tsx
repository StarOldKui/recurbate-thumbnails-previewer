import { useEffect } from "react"

import type { DisplayMode, PreviewData, PreviewThumbnail } from "~runtime/types"
import { formatDuration } from "~runtime/processing"

interface PreviewPanelProps {
  data: PreviewData | null
  error: string | null
  loading: boolean
  mode: DisplayMode
  title: string
  onClose: () => void
}

function ThumbnailImage({ thumbnail }: { thumbnail: PreviewThumbnail }) {
  if (!thumbnail.sprite) {
    return <img alt={`Thumbnail ${thumbnail.index}`} src={thumbnail.dataUrl} />
  }

  const {
    imageHeight,
    imageWidth,
    sourceHeight,
    sourceWidth,
    sourceX,
    sourceY
  } = thumbnail.sprite

  return (
    <span
      className="rtp-sprite-frame"
      style={{ aspectRatio: `${sourceWidth} / ${sourceHeight}` }}>
      <img
        alt={`Thumbnail ${thumbnail.index}`}
        src={thumbnail.dataUrl}
        style={{
          height: `${(imageHeight / sourceHeight) * 100}%`,
          left: `${-(sourceX / sourceWidth) * 100}%`,
          top: `${-(sourceY / sourceHeight) * 100}%`,
          width: `${(imageWidth / sourceWidth) * 100}%`
        }}
      />
    </span>
  )
}

export function PreviewPanel({
  data,
  error,
  loading,
  mode,
  title,
  onClose
}: PreviewPanelProps) {
  useEffect(() => {
    if (mode !== "popup") return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [mode])

  return (
    <div
      className={mode === "popup" ? "rtp-popup-overlay" : undefined}
      id={mode === "popup" ? "rtp-popup-container" : undefined}
      onClick={mode === "popup" ? onClose : undefined}>
      <section
        className={
          mode === "embedded"
            ? "rtp-panel rtp-panel-embedded"
            : "rtp-panel rtp-panel-popup"
        }
        id={mode === "embedded" ? "rtp-embedded-container" : undefined}
        onClick={(event) => event.stopPropagation()}>
        <header className="rtp-header">
          <h2 className="rtp-title">{title}</h2>
          <button
            aria-label="Close preview"
            className="rtp-icon-button"
            onClick={onClose}
            type="button">
            <svg
              aria-hidden="true"
              className="rtp-close-icon"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24">
              <path
                d="M6 18L18 6M6 6l12 12"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
              />
            </svg>
          </button>
        </header>

        <div className="rtp-body rtp-auto-hide-scrollbar">
          {loading ? (
            <div className="rtp-state">
              <div className="rtp-spinner" />
              <p>Loading thumbnails...</p>
            </div>
          ) : null}
          {error ? (
            <div className="rtp-state rtp-error">
              <div className="rtp-error-icon" />
              <p>{error}</p>
            </div>
          ) : null}
          {!loading && !error && data && data.thumbnails.length === 0 ? (
            <div className="rtp-state">
              <p>No thumbnails found.</p>
            </div>
          ) : null}
          {!loading && !error && data?.thumbnails.length ? (
            <div
              className={
                data.thumbnails.some((thumbnail) => thumbnail.raw)
                  ? "rtp-grid rtp-grid-raw"
                  : "rtp-grid"
              }>
              {data.thumbnails.map((thumbnail) => (
                <button
                  className="rtp-card"
                  data-raw={thumbnail.raw ? "true" : "false"}
                  key={`${thumbnail.index}-${thumbnail.timestamp ?? "raw"}`}
                  onClick={() => {
                    if (typeof thumbnail.timestamp === "number") {
                      data.seekToTime?.(thumbnail.timestamp)
                    }
                  }}
                  type="button">
                  <ThumbnailImage thumbnail={thumbnail} />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <footer className="rtp-footer">
          <div>
            Total thumbnails: {data?.metadata.totalThumbnails || 0}
            {data?.metadata.videoDuration ? (
              <span>
                Duration: {formatDuration(data.metadata.videoDuration)}
              </span>
            ) : null}
          </div>
        </footer>
      </section>
    </div>
  )
}
