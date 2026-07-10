export interface Settings {
  dailyGoalMl: number
  cupMl: number
  intervalMin: number
  launchAtLogin: boolean
  paused: boolean
  sound: boolean
  amounts: number[]
  remindStart: string
  remindEnd: string
  remindAllDay: boolean
  stopWhenReached: boolean
  systemNotify: boolean
  breakEnabled: boolean
  breakStart: string
  breakEnd: string
  theme: 'system' | 'light' | 'dark'
}
export interface RenderState {
  settings: Settings
  todayMl: number
  date: string
}
export interface Entry {
  ts: number
  ml: number
}
export interface DayStat {
  date: string
  label: string
  weekday: string
  totalMl: number
  goalMl: number
  reached: boolean
}
export interface Stats {
  days: DayStat[]
  reachedDays: number
  goalMl: number
  avgMl: number
}
export interface MonthDay {
  date: string
  day: number
  totalMl: number
  goalMl: number
  reached: boolean
  isToday: boolean
  isFuture: boolean
}
export interface MonthData {
  label: string
  ym: string
  firstWeekday: number
  days: MonthDay[]
  avgMl: number
  goalMl: number
  reachedCount: number
  canNext: boolean
}
export interface CountdownState {
  remainingMs: number
  totalMs: number
  paused: boolean
  pauseRemainingMs: number
  active: boolean
  reached: boolean
  resting: boolean
  doneForDay: boolean
  restUntilLabel: string
  todayMl: number
  goalMl: number
}
export interface CardState {
  todayMl: number
  goalMl: number
  cupMl: number
  line: string
  sound: boolean
  amounts: number[]
}
export interface CardBody {
  todayMl: number
  goalMl: number
  cupMl: number
  amounts: number[]
}

declare global {
  interface Window {
    api: {
      getState(): Promise<RenderState>
      addWater(ml: number): Promise<RenderState>
      undoLast(): Promise<RenderState>
      getSettings(): Promise<Settings>
      setSettings(p: Partial<Settings>): Promise<Settings>
      resetSettings(): Promise<Settings>
      resetCapsulePos(): Promise<void>
      getStats(days: number): Promise<Stats>
      getMonth(ym: string): Promise<MonthData>
      exportData(): Promise<{ ok: boolean; path?: string; error?: string }>
      importData(): Promise<{ ok: boolean; days?: number; error?: string }>
      testNotify(): Promise<boolean>
      togglePanel(): Promise<void>
      hidePanel(): Promise<void>
      capsuleMove(dx: number, dy: number): void
      winMove(dx: number, dy: number): void
      capsuleDragEnd(): void
      getCountdown(): Promise<CountdownState>
      drinkNow(ml?: number): Promise<void>
      snooze(): Promise<void>
      skip(): Promise<void>
      cardPause(kind: 'today' | '1h'): Promise<void>
      setPaused(p: boolean, ms?: number): Promise<void>
      getGuideSeen(): Promise<boolean>
      markGuideSeen(): Promise<void>
      onCountdown(cb: (s: CountdownState) => void): () => void
      onCardShow(cb: (s: CardState) => void): () => void
      onCardUpdate(cb: (s: CardBody) => void): () => void
      onStateChanged(cb: () => void): () => void
      onGoHome(cb: () => void): () => void
      onPanelVisible(cb: (v: boolean) => void): () => void
      getTodayEntries(): Promise<Entry[]>
      getDayEntries(dateKey: string): Promise<Entry[]>
      deleteEntry(ts: number): Promise<Entry[]>
      restoreEntry(entry: { ts: number; ml: number }): Promise<void>
      clearToday(): Promise<void>
      quitApp(): Promise<void>
    }
  }
}
