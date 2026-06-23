import { beforeEach, describe, expect, it, vi } from "vitest"

import findTabResourceHandler from "~background/messages/find-tab-resource"

async function sendFindTabResource(
  body: unknown,
  senderUrl = "https://recu.me/performer/demo"
) {
  let response: unknown
  const res = {
    send: vi.fn((nextResponse: unknown) => {
      response = nextResponse
    })
  }

  await findTabResourceHandler(
    {
      body,
      sender: {
        tab: {
          url: senderUrl
        }
      }
    } as any,
    res as any
  )

  return response as { success: boolean; url?: string | null; error?: string }
}

describe("find-tab-resource handler", () => {
  beforeEach(() => {
    vi.stubGlobal("chrome", {
      tabs: {
        create: vi.fn().mockResolvedValue({ id: 123 }),
        get: vi.fn().mockResolvedValue({ id: 123, status: "complete" }),
        remove: vi.fn().mockResolvedValue(undefined),
        onUpdated: {
          addListener: vi.fn(),
          removeListener: vi.fn()
        }
      },
      scripting: {
        executeScript: vi.fn().mockResolvedValue([{ result: "https://example.com/stripe.jpg" }])
      }
    })
  })

  it("caps resource scan timeout below the MV3 long-task limit", async () => {
    const response = await sendFindTabResource({
      videoUrl: "https://recu.me/video/123",
      pattern: "-stripe",
      timeoutMs: 300000
    })

    expect(response).toEqual({
      success: true,
      url: "https://example.com/stripe.jpg"
    })
    expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
      expect.objectContaining({
        args: ["-stripe", 180000]
      })
    )
  })

  it("uses the default resource scan timeout when none is provided", async () => {
    await sendFindTabResource({
      videoUrl: "https://recu.me/video/123"
    })

    expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
      expect.objectContaining({
        args: ["-stripe", 180000]
      })
    )
  })

  it("rejects resource scans for another host", async () => {
    const response = await sendFindTabResource({
      videoUrl: "https://example.com/video/abc"
    })

    expect(response).toEqual({
      success: false,
      error: "Find resource denied"
    })
    expect(chrome.tabs.create).not.toHaveBeenCalled()
  })
})
