import { describe, expect, it } from "vitest"

import {
  abortRequest,
  registerRequest,
  throwIfAborted,
  unregisterRequest
} from "~background/request-registry"

describe("request registry", () => {
  it("aborts an already registered request", () => {
    const signal = registerRequest("registered-request")
    expect(signal?.aborted).toBe(false)

    abortRequest("registered-request")

    expect(signal?.aborted).toBe(true)
    expect(() => throwIfAborted(signal)).toThrow("Request aborted")
  })

  it("remembers cancellation that arrives before registration", () => {
    abortRequest("early-cancel-request")
    const signal = registerRequest("early-cancel-request")

    expect(signal?.aborted).toBe(true)
  })

  it("clears cancellation when a request is unregistered", () => {
    abortRequest("cleared-request")
    unregisterRequest("cleared-request")

    const signal = registerRequest("cleared-request")
    expect(signal?.aborted).toBe(false)
    unregisterRequest("cleared-request")
  })
})
