import { showCodeOnClick } from './chat-code-show'
import { forgetUiPage, getUiPageMark } from './ui-page-marks'

let listening = false

/** Starts once, on the first page mark: clicks on a mark's code show it, navigation drops the page's marks. */
export function listenForUiPageEvents(): void {
  const subscribe = window.api.browser.onAgentShowPageEvent
  if (listening || !subscribe) {
    return
  }
  listening = true
  subscribe((event) => {
    if (event.kind === 'reset') {
      forgetUiPage(event.browserPageId)
      return
    }
    const mark = getUiPageMark(event.browserPageId, event.key)
    if (mark?.code) {
      void showCodeOnClick(mark.code, mark.context)
    }
  })
}
