export function matchesPattern(url: string, pattern: string): boolean {
  try {
    const parsedUrl = new URL(url)
    const [schemePattern, restPattern] = pattern.split("://")
    if (!schemePattern || !restPattern) return false

    const slashIndex = restPattern.indexOf("/")
    const hostPattern =
      slashIndex === -1 ? restPattern : restPattern.slice(0, slashIndex)
    const pathPattern = slashIndex === -1 ? "/*" : restPattern.slice(slashIndex)

    const scheme = parsedUrl.protocol.slice(0, -1)
    if (schemePattern !== "*" && schemePattern !== scheme) return false

    const host = parsedUrl.hostname
    const matchesHost = hostPattern.startsWith("*.")
      ? host === hostPattern.slice(2) || host.endsWith(`.${hostPattern.slice(2)}`)
      : hostPattern === "*" || host === hostPattern
    if (!matchesHost) return false

    const escapedPath = pathPattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    const pathRegex = new RegExp(`^${escapedPath.replace(/\*/g, ".*")}$`)
    return pathRegex.test(`${parsedUrl.pathname}${parsedUrl.search}`)
  } catch {
    return false
  }
}
