import type { PlasmoMessaging } from "@plasmohq/messaging"

import {
  registerRequest,
  unregisterRequest
} from "~background/request-registry"
import type { ActionGroup } from "~background/action-types"
import { missAvActions } from "~missav/background"
import { MISSAV_MATCHES } from "~missav/url"
import { matchesPattern } from "~providers/match-pattern"
import { recurbateActions } from "~recurbate/background"
import { RECURBATE_MATCHES } from "~recurbate/url"

interface ProviderActionRequest {
  action: string
  payload?: unknown
  providerId: string
  requestId?: string
}

interface ProviderActionResponse {
  success: boolean
  data?: unknown
  error?: string
}

const providerActionGroups: ActionGroup[] = [
  {
    providerId: "recurbate",
    matches: RECURBATE_MATCHES,
    actions: recurbateActions
  },
  {
    providerId: "missav",
    matches: MISSAV_MATCHES,
    actions: missAvActions
  }
]

const providerActions = new Map(
  providerActionGroups.map((group) => [group.providerId, group])
)

async function getSenderUrl(sender?: chrome.runtime.MessageSender) {
  const tab = sender?.tab
  if (tab?.url) return tab.url
  if (!tab?.id) return null

  return (await chrome.tabs.get(tab.id).catch(() => null))?.url || null
}

function canRunAction(
  group: ActionGroup,
  senderUrl: string | null
): boolean {
  return Boolean(
    senderUrl &&
      group.matches.some((pattern) => matchesPattern(senderUrl, pattern))
  )
}

const handler: PlasmoMessaging.MessageHandler<
  ProviderActionRequest,
  ProviderActionResponse
> = async (req, res) => {
  const requestId = req.body?.requestId
  const signal = registerRequest(requestId)

  try {
    const { action, payload, providerId } = req.body || {}
    const group = providerId ? providerActions.get(providerId) : null
    const runAction = action ? group?.actions[action] : null

    if (!group || !runAction) {
      res.send({
        success: false,
        error:
          providerId && action
            ? `Unknown action: ${providerId}/${action}`
            : "Missing provider action"
      })
      return
    }

    const senderUrl = await getSenderUrl(req.sender)
    if (!canRunAction(group, senderUrl)) {
      res.send({ success: false, error: "Provider action denied" })
      return
    }

    res.send({
      success: true,
      data: await runAction(payload, {
        senderTabId: req.sender.tab?.id,
        senderUrl,
        signal
      })
    })
  } catch (error) {
    res.send({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    })
  } finally {
    unregisterRequest(requestId)
  }
}

export default handler
