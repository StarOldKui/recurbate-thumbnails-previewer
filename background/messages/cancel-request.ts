import type { PlasmoMessaging } from "@plasmohq/messaging"

import { abortRequest } from "~background/request-registry"

interface CancelRequest {
  requestId?: string
}

const handler: PlasmoMessaging.MessageHandler<CancelRequest> = async (req, res) => {
  const requestId = req.body?.requestId
  if (requestId) abortRequest(requestId)
  res.send({ success: true })
}

export default handler
