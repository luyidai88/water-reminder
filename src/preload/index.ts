import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

interface SettingsPartial {
  dailyGoalMl?: number
  cupMl?: number
  intervalMin?: number
  launchAtLogin?: boolean
  paused?: boolean
  sound?: boolean
  amounts?: number[]
  remindStart?: string
  remindEnd?: string
  remindAllDay?: boolean
  stopWhenReached?: boolean
  systemNotify?: boolean
  breakEnabled?: boolean
  breakStart?: string
  breakEnd?: string
  theme?: 'system' | 'light' | 'dark'
}

const api = {
  getState: () => ipcRenderer.invoke('get-state'),
  addWater: (ml: number) => ipcRenderer.invoke('add-water', ml),
  undoLast: () => ipcRenderer.invoke('undo-last'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (partial: SettingsPartial) => ipcRenderer.invoke('set-settings', partial),
  resetSettings: () => ipcRenderer.invoke('reset-settings'),
  resetCapsulePos: () => ipcRenderer.invoke('reset-capsule-pos'),
  getStats: (days: number) => ipcRenderer.invoke('get-stats', days),
  getMonth: (ym: string) => ipcRenderer.invoke('get-month', ym),
  exportData: () => ipcRenderer.invoke('export-data'),
  importData: () => ipcRenderer.invoke('import-data'),
  testNotify: () => ipcRenderer.invoke('test-notify'),

  // 胶囊:开面板 / 拖拽
  togglePanel: () => ipcRenderer.invoke('toggle-panel'),
  hidePanel: () => ipcRenderer.invoke('hide-panel'),
  capsuleMove: (dx: number, dy: number) => ipcRenderer.send('capsule-move', dx, dy),
  winMove: (dx: number, dy: number) => ipcRenderer.send('win-move', dx, dy),
  capsuleDragEnd: () => ipcRenderer.send('capsule-drag-end'),

  // 倒计时 / 提醒卡
  getCountdown: () => ipcRenderer.invoke('get-countdown'),
  drinkNow: (ml?: number) => ipcRenderer.invoke('card-drink', ml),
  snooze: () => ipcRenderer.invoke('card-snooze'),
  skip: () => ipcRenderer.invoke('card-skip'),
  cardPause: (kind: 'today' | '1h') => ipcRenderer.invoke('card-pause', kind),
  setPaused: (p: boolean, ms?: number) => ipcRenderer.invoke('set-paused', p, ms),

  // 新手引导(首启展示一次,设置里可再调出)
  getGuideSeen: () => ipcRenderer.invoke('get-guide-seen'),
  markGuideSeen: () => ipcRenderer.invoke('mark-guide-seen'),

  // 主进程推送
  onCountdown: (cb: (s: unknown) => void) => {
    const h = (_e: IpcRendererEvent, s: unknown): void => cb(s)
    ipcRenderer.on('countdown', h)
    return () => ipcRenderer.removeListener('countdown', h)
  },
  onCardShow: (cb: (s: unknown) => void) => {
    const h = (_e: IpcRendererEvent, s: unknown): void => cb(s)
    ipcRenderer.on('card-show', h)
    return () => ipcRenderer.removeListener('card-show', h)
  },
  onCardUpdate: (cb: (s: unknown) => void) => {
    const h = (_e: IpcRendererEvent, s: unknown): void => cb(s)
    ipcRenderer.on('card-update', h)
    return () => ipcRenderer.removeListener('card-update', h)
  },
  onStateChanged: (cb: () => void) => {
    const h = (): void => cb()
    ipcRenderer.on('state-changed', h)
    return () => ipcRenderer.removeListener('state-changed', h)
  },
  onGoHome: (cb: () => void) => {
    const h = (): void => cb()
    ipcRenderer.on('go-home', h)
    return () => ipcRenderer.removeListener('go-home', h)
  },
  onPanelVisible: (cb: (v: boolean) => void) => {
    const h = (_e: IpcRendererEvent, v: boolean): void => cb(v)
    ipcRenderer.on('panel-visible', h)
    return () => ipcRenderer.removeListener('panel-visible', h)
  },
  getTodayEntries: () => ipcRenderer.invoke('get-today-entries'),
  getDayEntries: (dateKey: string) => ipcRenderer.invoke('get-day-entries', dateKey),
  deleteEntry: (ts: number) => ipcRenderer.invoke('delete-entry', ts),
  restoreEntry: (entry: { ts: number; ml: number }) => ipcRenderer.invoke('restore-entry', entry),
  clearToday: () => ipcRenderer.invoke('clear-today'),
  quitApp: () => ipcRenderer.invoke('quit-app')
}

contextBridge.exposeInMainWorld('api', api)
