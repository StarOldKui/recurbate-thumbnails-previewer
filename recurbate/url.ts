export const RECURBATE_MATCHES = ["*://*.recu.me/*", "*://*.recu.club/*"]

export function isRecurbateHost(hostname: string): boolean {
  return ["recu.me", "recu.club"].some(
    (host) => hostname === host || hostname.endsWith(`.${host}`)
  )
}

export function isRecurbateUrl(url: URL | null): boolean {
  return Boolean(url && isRecurbateHost(url.hostname))
}

export function getRecurbatePageKey(url: URL): string | null {
  const match = url.pathname.match(/\/video\/(\d+)/)
  return match?.[1] || null
}
