export interface ActionContext {
  senderTabId?: number
  senderUrl?: string
  signal?: AbortSignal
}

export type ActionHandler = (
  payload: unknown,
  context: ActionContext
) => Promise<unknown>

export type ActionMap = Record<string, ActionHandler>

export interface ActionGroup {
  actions: ActionMap
  matches: string[]
  providerId: string
}
