import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  sendToBackground: vi.fn()
}))

vi.mock("@plasmohq/messaging", () => ({
  sendToBackground: mocks.sendToBackground
}))

import {
  fetchImages,
  findResource,
  openTabs,
  runProviderAction
} from "~runtime/background-client"

describe("background client", () => {
  beforeEach(() => {
    mocks.sendToBackground.mockReset()
  })

  it("sends provider actions with provider metadata", async () => {
    mocks.sendToBackground.mockResolvedValue({
      success: true,
      data: null
    })

    await expect(
      runProviderAction("recurbate", "seek", { timestamp: 120 })
    ).resolves.toBeNull()

    expect(mocks.sendToBackground).toHaveBeenCalledWith({
      name: "provider-action",
      body: {
        action: "seek",
        providerId: "recurbate",
        payload: { timestamp: 120 }
      }
    })
  })

  it("wraps image fetch, resource lookup, and tab opening responses", async () => {
    mocks.sendToBackground
      .mockResolvedValueOnce({
        success: true,
        dataUrls: ["data:image/png;base64,a"]
      })
      .mockResolvedValueOnce({
        success: true,
        url: "https://mediafront.club/a-stripe.jpg"
      })
      .mockResolvedValueOnce({ success: true, openedCount: 2 })

    await expect(
      fetchImages(["https://mediafront.club/a-stripe.jpg"])
    ).resolves.toEqual(["data:image/png;base64,a"])
    await expect(
      findResource("https://recu.me/demo/video/123/play", "-stripe", 1000)
    ).resolves.toBe("https://mediafront.club/a-stripe.jpg")
    await expect(
      openTabs([
        "https://recu.me/demo/video/123/play",
        "https://recu.me/demo/video/456/play"
      ])
    ).resolves.toBe(2)
  })

  it("throws response errors", async () => {
    mocks.sendToBackground.mockResolvedValue({
      success: false,
      error: "Nope"
    })

    await expect(fetchImages(["https://mediafront.club/a.jpg"])).rejects.toThrow(
      "Nope"
    )
  })

  it("sends a cancel request when an abortable message is aborted", async () => {
    mocks.sendToBackground.mockImplementation((message) => {
      if (message.name === "cancel-request") {
        return Promise.resolve({ success: true })
      }
      return new Promise(() => {})
    })

    const controller = new AbortController()
    const request = fetchImages(
      ["https://mediafront.club/a.jpg"],
      controller.signal
    )
    controller.abort()

    await expect(request).rejects.toThrow("Request aborted")
    expect(mocks.sendToBackground).toHaveBeenCalledWith({
      name: "cancel-request",
      body: {
        requestId: expect.stringMatching(/^fetch-images:/)
      }
    })
  })
})
