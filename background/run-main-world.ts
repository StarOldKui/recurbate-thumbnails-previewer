export async function runMainWorld<T>(
  tabId: number,
  func: (...args: any[]) => T | Promise<T>,
  args: unknown[] = []
): Promise<T> {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func,
    args
  })

  return result.result as T
}
