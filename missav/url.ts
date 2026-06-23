export const MISSAV_MATCHES = ["*://*.missav.ws/*", "*://*.missav.com/*"]

export function getMissAvPageKey(url: URL): string | null {
  const lastPart = url.pathname.split("/").filter(Boolean).pop()
  if (!lastPart) return null
  return /(?:^|[-_])\d{2,}(?:[-_]|$)/.test(lastPart) ? lastPart : null
}
