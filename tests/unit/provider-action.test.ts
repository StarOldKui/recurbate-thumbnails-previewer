import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  runMainWorld: vi.fn()
}))

vi.mock("~background/run-main-world", () => ({
  runMainWorld: mocks.runMainWorld
}))

import providerActionHandler from "~background/messages/provider-action"

async function sendProviderAction(body: unknown, senderUrl: string) {
  let response: unknown
  const res = {
    send: vi.fn((nextResponse: unknown) => {
      response = nextResponse
    })
  }

  await providerActionHandler(
    {
      body,
      sender: {
        tab: {
          id: 1,
          url: senderUrl
        }
      }
    } as any,
    res as any
  )

  return response as { success: boolean; data?: unknown; error?: string }
}

describe("provider-action handler", () => {
  beforeEach(() => {
    mocks.runMainWorld.mockReset()
  })

  it("rejects unknown provider actions", async () => {
    await expect(
      sendProviderAction(
        {
          providerId: "missav",
          action: "missing-action"
        },
        "https://missav.ws/cn/mbrbn-061"
      )
    ).resolves.toMatchObject({
      success: false,
      error: "Unknown action: missav/missing-action"
    })
  })

  it("denies actions from a mismatched sender URL", async () => {
    const response = await sendProviderAction(
      {
        providerId: "missav",
        action: "thumbnail-config"
      },
      "https://recu.me/demo/video/123/play"
    )

    expect(response).toMatchObject({
      success: false,
      error: "Provider action denied"
    })
    expect(mocks.runMainWorld).not.toHaveBeenCalled()
  })

  it.each([
    "https://recu.me/demo/video/123/play",
    "https://recu.club/mon1_day/video/183056343/play"
  ])("dispatches Recurbate seek actions from %s", async (senderUrl) => {
    mocks.runMainWorld.mockResolvedValue({
      success: true
    })

    const response = await sendProviderAction(
      {
        providerId: "recurbate",
        action: "seek",
        payload: {
          timestamp: 120
        }
      },
      senderUrl
    )

    expect(response).toEqual({
      success: true,
      data: null
    })
    expect(mocks.runMainWorld).toHaveBeenCalledWith(
      1,
      expect.any(Function),
      [120]
    )
  })

  it("dispatches MissAV thumbnail actions from MissAV pages", async () => {
    mocks.runMainWorld.mockResolvedValue({
      success: true,
      config: {
        col: 6,
        height: 168,
        row: 6,
        urls: ["https://missav.ws/thumb.jpg"],
        width: 300
      }
    })

    const response = await sendProviderAction(
      {
        providerId: "missav",
        action: "thumbnail-config"
      },
      "https://missav.ws/cn/mbrbn-061"
    )

    expect(response).toEqual({
      success: true,
      data: {
        col: 6,
        height: 168,
        row: 6,
        urls: ["https://missav.ws/thumb.jpg"],
        width: 300
      }
    })
    expect(mocks.runMainWorld).toHaveBeenCalledWith(1, expect.any(Function))
  })
})
