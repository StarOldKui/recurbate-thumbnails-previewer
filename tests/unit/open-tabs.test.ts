import { beforeEach, describe, expect, it, vi } from "vitest"

import openTabsHandler from "~background/messages/open-tabs"

async function sendOpenTabs(body: unknown, senderUrl: string) {
  let response: unknown
  const res = {
    send: vi.fn((nextResponse: unknown) => {
      response = nextResponse
    })
  }

  await openTabsHandler(
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

  return response as { success: boolean; openedCount?: number; error?: string }
}

describe("open-tabs handler", () => {
  beforeEach(() => {
    vi.stubGlobal("chrome", {
      tabs: {
        create: vi.fn().mockResolvedValue({ id: 123 })
      }
    })
  })

  it("opens same-host urls", async () => {
    const response = await sendOpenTabs(
      {
        urls: ["https://recu.me/demo/video/123/play"]
      },
      "https://recu.me/performer/demo"
    )

    expect(response).toEqual({ success: true, openedCount: 1 })
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      active: false,
      url: "https://recu.me/demo/video/123/play"
    })
  })

  it("rejects urls for another host", async () => {
    const response = await sendOpenTabs(
      {
        urls: ["https://example.com/video/abc"]
      },
      "https://recu.me/performer/demo"
    )

    expect(response).toEqual({
      success: false,
      error: "Open tabs denied"
    })
    expect(chrome.tabs.create).not.toHaveBeenCalled()
  })
})
