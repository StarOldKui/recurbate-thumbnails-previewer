import { missAvProvider } from "~missav"
import { matchesPattern } from "~providers/match-pattern"
import { recurbateProvider } from "~recurbate"
import type { VideoProvider } from "~runtime/types"

export const providers: VideoProvider[] = [recurbateProvider, missAvProvider]

export function findProvider(url: URL): VideoProvider | null {
  return (
    findHostProviders(url).find((provider) => provider.getPageKey(url) !== null) ||
    null
  )
}

export function findHostProvider(url: URL): VideoProvider | null {
  return findHostProviders(url)[0] || null
}

export function findHostProviders(url: URL): VideoProvider[] {
  return providers.filter((provider) =>
    provider.matches.some((pattern) => matchesPattern(url.href, pattern))
  )
}
