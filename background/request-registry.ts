const controllers = new Map<string, AbortController>()
const cancelledRequests = new Set<string>()

export function registerRequest(requestId?: string): AbortSignal | undefined {
  if (!requestId) return undefined

  const controller = new AbortController()
  controllers.set(requestId, controller)
  if (cancelledRequests.delete(requestId)) controller.abort()
  return controller.signal
}

export function unregisterRequest(requestId?: string): void {
  if (!requestId) return

  controllers.delete(requestId)
  cancelledRequests.delete(requestId)
}

export function abortRequest(requestId: string): void {
  const controller = controllers.get(requestId)
  if (!controller) {
    cancelledRequests.add(requestId)
    return
  }

  controller.abort()
  controllers.delete(requestId)
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error("Request aborted")
}
