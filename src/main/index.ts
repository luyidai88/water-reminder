import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  screen,
  Notification,
  dialog,
  nativeTheme
} from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import Store from 'electron-store'
import { trayIconDataUrl } from './tray-icon'

interface Settings {
  dailyGoalMl: number
  cupMl: number
  intervalMin: number
  launchAtLogin: boolean
  paused: boolean
  sound: boolean
  amounts: number[]
  remindStart: string // 提醒时段开始(这段时间内才按间隔提醒)
  remindEnd: string // 提醒时段结束;之外休息不提醒
  remindAllDay: boolean // 全天提醒:开了就无视起止时间、全天提醒(起止仍原样保留,关掉即恢复)
  stopWhenReached: boolean // 达标后停止提醒:喝够目标当天不再弹卡(默认开,不想被达标后继续唠叨)
  systemNotify: boolean // 同时发系统通知:锁屏/通知中心也能看到(默认关,桌面已有自绘卡,开了会多一条系统横幅)
  breakEnabled: boolean // 午休不提醒:在提醒时段里挖掉一段(如 12:00~14:00)不弹卡(默认关)
  breakStart: string // 午休开始
  breakEnd: string // 午休结束
  theme: 'system' | 'light' | 'dark' // 外观:跟随系统 / 强制浅色 / 强制深色(手动选优先于系统)
}
interface Entry {
  ts: number
  ml: number
}
interface DayLog {
  totalMl: number
  entries: Entry[]
  goalMl?: number
}
interface StoreSchema {
  settings: Settings
  logs: Record<string, DayLog>
  capsulePos: { x: number; y: number } | null
  onboarded: boolean
  guideSeen: boolean
  nextDueTs: number // 下次提醒的墙钟时刻,持久化用于重启/重装后扣掉关闭时长、不从头重数
}

const DEFAULT_SETTINGS: Settings = {
  dailyGoalMl: 2000,
  cupMl: 250,
  intervalMin: 60,
  launchAtLogin: false,
  paused: false,
  sound: false,
  amounts: [100, 250, 350, 500],
  remindStart: '08:00',
  remindEnd: '22:00',
  remindAllDay: false,
  stopWhenReached: true,
  systemNotify: false,
  breakEnabled: false,
  breakStart: '12:00',
  breakEnd: '14:00',
  theme: 'system'
}

// 把任意(可能残缺/脏)的 settings 规整成完整合法的 Settings:缺失/非法字段回落默认值。
// 启动迁移和数据导入都过这一道 —— 否则老备份缺字段(如 amounts 不足4个、theme 非法)会让渲染层读到 undefined。
function normalizeSettings(raw: Partial<Settings> | undefined): Settings {
  const s = raw ?? {}
  // 夹取到有效范围(和 UI 的 min/max 对齐):挡住手改备份把 goal 改成 0/负数导致百分比、柱高算出 NaN/Infinity
  const clampOr = (v: unknown, min: number, max: number, d: number): number => {
    const n = typeof v === 'number' && Number.isFinite(v) ? v : d
    return Math.min(Math.max(n, min), max)
  }
  const strOr = (v: unknown, d: string): string => (typeof v === 'string' && v ? v : d)
  const boolOr = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d)
  const amounts =
    Array.isArray(s.amounts) &&
    s.amounts.length >= 4 &&
    s.amounts.slice(0, 4).every((n) => typeof n === 'number' && Number.isFinite(n))
      ? s.amounts.slice(0, 4).map((n) => Math.min(Math.max(Math.round(n), 1), 2000))
      : [...DEFAULT_SETTINGS.amounts]
  return {
    dailyGoalMl: clampOr(s.dailyGoalMl, 500, 6000, DEFAULT_SETTINGS.dailyGoalMl),
    cupMl: clampOr(s.cupMl, 50, 1000, DEFAULT_SETTINGS.cupMl),
    intervalMin: clampOr(s.intervalMin, 5, 240, DEFAULT_SETTINGS.intervalMin),
    launchAtLogin: boolOr(s.launchAtLogin, DEFAULT_SETTINGS.launchAtLogin),
    paused: boolOr(s.paused, DEFAULT_SETTINGS.paused),
    sound: boolOr(s.sound, DEFAULT_SETTINGS.sound),
    amounts,
    remindStart: strOr(s.remindStart, DEFAULT_SETTINGS.remindStart),
    remindEnd: strOr(s.remindEnd, DEFAULT_SETTINGS.remindEnd),
    remindAllDay: boolOr(s.remindAllDay, DEFAULT_SETTINGS.remindAllDay),
    stopWhenReached: boolOr(s.stopWhenReached, DEFAULT_SETTINGS.stopWhenReached),
    systemNotify: boolOr(s.systemNotify, DEFAULT_SETTINGS.systemNotify),
    breakEnabled: boolOr(s.breakEnabled, DEFAULT_SETTINGS.breakEnabled),
    breakStart: strOr(s.breakStart, DEFAULT_SETTINGS.breakStart),
    breakEnd: strOr(s.breakEnd, DEFAULT_SETTINGS.breakEnd),
    theme:
      s.theme === 'light' || s.theme === 'dark' || s.theme === 'system'
        ? s.theme
        : DEFAULT_SETTINGS.theme
  }
}

const store = new Store<StoreSchema>({
  defaults: {
    settings: DEFAULT_SETTINGS,
    logs: {},
    capsulePos: null,
    onboarded: false,
    guideSeen: false,
    nextDueTs: 0
  }
})

// 启动迁移:把 store 里的 settings 规整成完整合法值,补齐历史版本缺的字段
store.set('settings', normalizeSettings(store.get('settings')))

// 每次启动自动恢复提醒:暂停只在本次运行内有效,重启即恢复(免得忘了暂停一直收不到提醒)
store.set('settings', { ...store.get('settings'), paused: false })

// ---------- 数据读写 ----------
function pad(n: number): string {
  return String(n).padStart(2, '0')
}
function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function getDay(key: string): DayLog {
  const logs = store.get('logs')
  return logs[key] ?? { totalMl: 0, entries: [] }
}
function setDay(key: string, day: DayLog): void {
  const logs = store.get('logs')
  logs[key] = day
  store.set('logs', logs)
}
function addWater(ml: number): void {
  const k = todayKey()
  const d = getDay(k)
  d.totalMl += ml
  d.entries.push({ ts: Date.now(), ml })
  d.goalMl = store.get('settings').dailyGoalMl // 记下当天目标,以后改目标不影响历史达标判定
  setDay(k, d)
}
function undoLast(): void {
  const k = todayKey()
  const d = getDay(k)
  const last = d.entries.pop()
  if (last) {
    d.totalMl = Math.max(0, d.totalMl - last.ml)
    setDay(k, d)
  }
}
function renderState(): { settings: Settings; todayMl: number; date: string } {
  return { settings: store.get('settings'), todayMl: getDay(todayKey()).totalMl, date: todayKey() }
}

// 某天的目标:优先用当天记下的,没有则用当前设置(老数据兼容)
function goalForDay(key: string): number {
  return store.get('logs')[key]?.goalMl ?? store.get('settings').dailyGoalMl
}
// 今天的目标始终用当前设置:当天改目标即时生效,主面板和达标判定不打架;只有过去的天才冻结各自记下的目标
function goalForToday(): number {
  return store.get('settings').dailyGoalMl
}
// 是否达标:必须真喝过水(total>0)且达到目标。全 app 唯一口径,主面板/柱状/月历/倒计时都调它,避免走出两套判定
function isReached(total: number, goal: number): boolean {
  return total > 0 && total >= goal
}

// 某个月的每日数据(月历视图用):每天的总量/目标/是否达标/是否今天/是否未来 + 首日星期 + 月汇总
function getMonth(ym: string): {
  label: string
  ym: string
  firstWeekday: number
  days: {
    date: string
    day: number
    totalMl: number
    goalMl: number
    reached: boolean
    isToday: boolean
    isFuture: boolean
  }[]
  avgMl: number
  goalMl: number
  reachedCount: number
  canNext: boolean
} {
  const now = new Date()
  const [yy, mm] = (ym || '').split('-').map(Number)
  // 空字符串 Number('')=0 也是有限值,必须夹到合理年份区间,否则 calMonth='' 时年份会变 0(出现「0年7月」)
  const year = Number.isFinite(yy) && yy >= 1970 && yy <= 3000 ? yy : now.getFullYear()
  const month = Number.isFinite(mm) && mm >= 1 && mm <= 12 ? mm : now.getMonth() + 1
  const daysInMonth = new Date(year, month, 0).getDate()
  const firstWeekday = new Date(year, month - 1, 1).getDay()
  const logs = store.get('logs')
  const s = store.get('settings')
  const todayK = todayKey()
  const days = []
  let sum = 0
  let recorded = 0
  let reachedCount = 0
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${pad(month)}-${pad(d)}`
    const total = logs[key]?.totalMl ?? 0
    const goal = key === todayK ? s.dailyGoalMl : logs[key]?.goalMl ?? s.dailyGoalMl
    const isFuture = key > todayK
    if (!isFuture) {
      sum += total
      if (total > 0) recorded++
      if (isReached(total, goal)) reachedCount++
    }
    days.push({
      date: key,
      day: d,
      totalMl: total,
      goalMl: goal,
      reached: isReached(total, goal),
      isToday: key === todayK,
      isFuture
    })
  }
  const curYm = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`
  return {
    label: `${year}年${month}月`,
    ym: `${year}-${pad(month)}`,
    firstWeekday,
    days,
    avgMl: recorded ? Math.round(sum / recorded) : 0,
    goalMl: s.dailyGoalMl,
    reachedCount,
    canNext: `${year}-${pad(month)}` < curYm // 不给翻到未来月
  }
}

function getStats(days: number): {
  days: {
    date: string
    label: string
    weekday: string
    totalMl: number
    goalMl: number
    reached: boolean
  }[]
  reachedDays: number
  goalMl: number
  avgMl: number
} {
  const s = store.get('settings')
  const logs = store.get('logs')
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  const arr = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const total = logs[key]?.totalMl ?? 0
    // 今天用当前设置(改目标即时生效),过去的天用各自记下的目标
    const dayGoal = key === todayKey() ? s.dailyGoalMl : logs[key]?.goalMl ?? s.dailyGoalMl
    arr.push({
      date: key,
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      weekday: weekdays[d.getDay()],
      totalMl: total,
      goalMl: dayGoal,
      reached: isReached(total, dayGoal)
    })
  }
  const sum = arr.reduce((a, b) => a + b.totalMl, 0)
  const recordedDays = arr.filter((d) => d.totalMl > 0).length // 有喝水记录的天数(排除空天)
  const avg = recordedDays ? Math.round(sum / recordedDays) : 0 // 日均按有记录的天数平均(同 Apple 健康对手动记录类数据),不被空天拉低
  const reachedDays = arr.filter((d) => d.reached).length // 区间内达标天数,和月历「本月达标」同口径
  return { days: arr, reachedDays, goalMl: s.dailyGoalMl, avgMl: avg }
}

let win: BrowserWindow | null = null
let capsuleWin: BrowserWindow | null = null
let cardWin: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

// ---------- 倒计时(墙钟模型:记下次到点的真实时刻 deadlineTs,剩余=deadline-now) ----------
// 用墙钟而非每秒累减:系统睡眠/挂起后 setInterval 会停,累减模型醒来后计时偏慢;
// 墙钟模型醒来即反映真实流逝(过点就补提醒一次),也不受 tick 漂移影响,和暂停的时间基准统一。
let deadlineTs = 0 // 下次提醒的墙钟时刻(ms)
let segmentTotalMs = 0 // 本段总时长,算进度环用
let lastTickTs = Date.now() // 上一次 tick 的墙钟,用于冻结态把 deadline 顺延实际流逝
let wasResting = false // 上一拍是否在休息时段,用于检测「休息→提醒」边沿,进时段立即首杯提醒
let cardVisible = false
// 提醒卡弹出后没人点会一直挂着,而 tick 在卡片展示时不计时 → 整个提醒循环被卡死。
// 超过这个时间没人理会就自动收起并重新计时,等下个间隔再提醒。
const CARD_AUTO_DISMISS_MS = 60_000
let cardTimer: ReturnType<typeof setTimeout> | null = null
// 稍后5分钟:用户显式要求「5分钟后再提醒」,这一次即使落在休息时段也要如约弹出(否则被冻结=永不来,等于骗人)。
// 只影响这一次,任何其他重置/弹卡都会清掉它。
let snoozePending = false
let dueLine = '' // 本次提醒的文案(面板开着走面板内提示、关着走浮卡,共用这句)
let lastDayKey = todayKey() // 跨天检测:午夜后把面板/卡片刷到新一天
// 当前剩余时间(派生自墙钟):非负
function remainingMsNow(): number {
  return Math.max(0, deadlineTs - Date.now())
}

function intervalMs(): number {
  return store.get('settings').intervalMin * 60000
}
// 提醒间隔始终是用户设的值,不因是否达标而变化
function reminderIntervalMs(): number {
  return intervalMs()
}
function resetCountdown(totalMs: number): void {
  snoozePending = false // 任何常规重置都清掉一次性的 snooze 标记
  segmentTotalMs = totalMs
  deadlineTs = Date.now() + totalMs
  store.set('nextDueTs', deadlineTs) // 持久化到点时刻,重启后据此扣掉关闭时长
}
function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)
}
// cur 是否落在 [start,end) 内,支持跨午夜(start>end 视为跨夜两段);start==end 视为整天
function inSpan(cur: number, start: number, end: number): boolean {
  if (start === end) return true
  return start < end ? cur >= start && cur < end : cur >= start || cur < end
}
// 提醒时段:当前在 remindStart~remindEnd 内才提醒(支持跨午夜,如 22:00-07:00;起止相同=全天提醒)。
// 时段里可再挖掉一段「午休不提醒」。时段/午休之外自动安静——倒计时冻结、不弹卡。
function inRemindWindow(s: Settings): boolean {
  const now = new Date()
  const cur = now.getHours() * 60 + now.getMinutes()
  const inMain = s.remindAllDay ? true : inSpan(cur, toMin(s.remindStart), toMin(s.remindEnd))
  if (!inMain) return false
  // 午休段:在提醒时段里挖掉一段不提醒(起止相同视为没设,跳过)
  if (s.breakEnabled && s.breakStart && s.breakEnd) {
    const bs = toMin(s.breakStart)
    const be = toMin(s.breakEnd)
    if (bs !== be && inSpan(cur, bs, be)) return false
  }
  return true
}
interface CountdownState {
  remainingMs: number
  totalMs: number
  paused: boolean
  pauseRemainingMs: number // 暂停剩余时间(到点自动恢复),给胶囊倒数显示
  active: boolean
  reached: boolean
  resting: boolean // 在提醒时段之外(自动安静)
  doneForDay: boolean // 已达标且设置了「达标后停止提醒」,今天不再弹卡
  restUntilLabel: string // 休息中时距下次恢复提醒的时刻(如 08:00),给胶囊显示用
  todayMl: number
  goalMl: number
}
// 当前在休息时段时,返回下次恢复提醒的时刻文案(HH:MM):在午休段内=午休结束,时段外=提醒时段开始
function nextRemindLabel(s: Settings): string {
  const now = new Date()
  const cur = now.getHours() * 60 + now.getMinutes()
  const inMain = s.remindAllDay ? true : inSpan(cur, toMin(s.remindStart), toMin(s.remindEnd))
  if (s.breakEnabled && s.breakStart && s.breakEnd) {
    const bs = toMin(s.breakStart)
    const be = toMin(s.breakEnd)
    if (bs !== be && inMain && inSpan(cur, bs, be)) return s.breakEnd
  }
  if (s.remindAllDay) return ''
  return s.remindStart
}
function buildCountdown(): CountdownState {
  const s = store.get('settings')
  const todayMl = getDay(todayKey()).totalMl
  const reached = isReached(todayMl, goalForToday())
  const resting = !inRemindWindow(s)
  return {
    remainingMs: remainingMsNow(),
    totalMs: segmentTotalMs,
    paused: s.paused,
    pauseRemainingMs: s.paused ? Math.max(0, pauseUntil - Date.now()) : 0,
    active: cardVisible,
    reached,
    resting,
    doneForDay: reached && s.stopWhenReached,
    restUntilLabel: resting ? nextRemindLabel(s) : '',
    todayMl,
    goalMl: goalForToday()
  }
}
function pushState(): void {
  if (capsuleWin && !capsuleWin.isDestroyed())
    capsuleWin.webContents.send('countdown', buildCountdown())
}
function refreshAll(): void {
  pushState()
  syncCard()
  if (win && !win.isDestroyed()) win.webContents.send('state-changed')
}
// 卡片开着时,数据变了就刷新卡片身体(今天/目标/百分比/快捷量),不重播入场动画、不响声
function syncCard(): void {
  if (cardVisible && cardWin && !cardWin.isDestroyed()) {
    const s = store.get('settings')
    cardWin.webContents.send('card-update', {
      todayMl: getDay(todayKey()).totalMl,
      goalMl: goalForToday(),
      cupMl: s.cupMl,
      amounts: s.amounts
    })
  }
}

function tick(): void {
  const now = Date.now()
  const dt = Math.max(0, now - lastTickTs) // 实际流逝(睡眠后可能是几小时)
  lastTickTs = now
  // 跨天:午夜后今日饮水归零,把面板/卡片/胶囊都刷到新一天
  if (todayKey() !== lastDayKey) {
    lastDayKey = todayKey()
    refreshAll()
  }
  // 暂停到期兜底:睡眠会让自动恢复的 setTimeout 不触发,这里用墙钟补一刀,醒来即恢复
  if (store.get('settings').paused && pauseUntil > 0 && now >= pauseUntil) {
    setPaused(false)
  }
  const s = store.get('settings')
  const reached = isReached(getDay(todayKey()).totalMl, goalForToday())
  const doneForDay = reached && s.stopWhenReached
  const nowResting = !inRemindWindow(s)
  // 「休息→提醒」边沿:进入提醒时段那一刻立即给一次首杯提醒,不必白等满一个间隔
  if (wasResting && !nowResting && !s.paused && !doneForDay) {
    deadlineTs = now
  }
  wasResting = nowResting
  // 没暂停、没在弹卡、且未(达标后停提醒)是计时的硬门;休息时段一般冻结,
  // 但用户点过「稍后5分钟」(snoozePending)时,这一次即使在休息时段也照常倒数并如约弹出。
  const gateOpen = !s.paused && !cardVisible && !doneForDay
  if (gateOpen && (!nowResting || snoozePending)) {
    if (now >= deadlineTs) showCard()
  } else {
    // 冻结态(暂停/休息/弹卡/已喝够):把到点时刻顺延实际流逝,使剩余时间不前进
    deadlineTs += dt
  }
  pushState()
}

const LINES = ['喝口水吧', '该补点水了', '起来接杯水', '喝水时间到', '补点水分']
const LINES_REACHED = ['今天已达标,再喝点更好', '保持住,再来一杯', '喝够了,润润嗓子']
function pickLine(reached: boolean): string {
  const pool = reached ? LINES_REACHED : LINES
  return pool[Math.floor(Math.random() * pool.length)]
}

// ---------- 渲染层加载(dev 走 devServer 多入口,生产走文件) ----------
type Page = 'index' | 'capsule' | 'card'
function loadRenderer(w: BrowserWindow, page: Page): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) w.loadURL(`${devUrl}/${page}.html`)
  else w.loadFile(join(__dirname, `../renderer/${page}.html`))
}

// 外观:把用户选择映射到 Electron 的 themeSource。light/dark 强制,system 交还系统。
// themeSource 会驱动渲染层的 prefers-color-scheme,所以手动选深/浅永远压过系统外观,不打架。
function applyTheme(): void {
  const t = store.get('settings').theme
  nativeTheme.themeSource = t === 'light' || t === 'dark' ? t : 'system'
}

// ---------- 主面板(无边框) ----------
function createWindow(): void {
  win = new BrowserWindow({
    width: 300,
    height: 640,
    show: false,
    frame: false,
    resizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    acceptFirstMouse: true,
    // 跟随系统深色:面板底色跟着换,避免深色模式打开时先闪一下浅色
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#141d26' : '#eef6ff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  // 面板当悬浮层:浮在所有窗口之上,但不激活 app,避免 macOS Stage Manager 把其他窗口推到侧边
  win.setAlwaysOnTop(true, 'floating')
  // 常驻所有桌面 + skipTransformProcessType:面板在当前桌面就地展开,不跳到创建时的桌面,也不闪 dock 图标
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  loadRenderer(win, 'index')
  // 渲染层加载完就告知当前显隐(启动时面板是隐藏的),让水球动画一开始就停,不空转到首次打开
  win.webContents.on('did-finish-load', () => {
    if (win && !win.isDestroyed()) win.webContents.send('panel-visible', win.isVisible())
  })
  // 不再失焦自动隐藏:点面板外部、点提醒卡都不会收起面板。
  // 面板是主内容,只在点收起箭头、点倒计时窗时才收。
  win.on('hide', () => {
    // 面板收起时若提醒卡还显示,重新摆回倒计时窗旁(没有面板要躲了)
    if (cardVisible) positionCardNearCapsule()
    // 通知渲染层暂停水球动画:隐藏窗的 rAF 不会被浏览器自动停,不暂停就后台空转耗电
    if (win && !win.isDestroyed()) win.webContents.send('panel-visible', false)
  })
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      win?.hide()
    }
  })
}

type Rect = { x: number; y: number; width: number; height: number }
function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}
// 把 target 摆在 anchor 四周择优(下/上/右/左),留间隙不压住它,夹在工作区内。
// 给了 avoid(如已打开的面板)就优先选不压住 avoid 的那一侧 —— 卡片贴倒计时窗时用它避开面板。
// 返回 true 表示选到了一个不和 avoid 重叠的位置;没有 avoid 时恒为 true
function placeAround(target: BrowserWindow, anchor: Rect, avoid?: Rect): boolean {
  const wb = target.getBounds()
  const wa = screen.getDisplayNearestPoint({ x: anchor.x, y: anchor.y }).workArea
  const gap = 10
  const clampX = (x: number): number => Math.min(Math.max(x, wa.x + 8), wa.x + wa.width - wb.width - 8)
  const clampY = (y: number): number => Math.min(Math.max(y, wa.y + 8), wa.y + wa.height - wb.height - 8)
  const cX = clampX(Math.round(anchor.x + anchor.width / 2 - wb.width / 2))
  const cY = clampY(Math.round(anchor.y + anchor.height / 2 - wb.height / 2))
  const roomBelow = wa.y + wa.height - (anchor.y + anchor.height)
  const roomAbove = anchor.y - wa.y
  const roomRight = wa.x + wa.width - (anchor.x + anchor.width)
  const roomLeft = anchor.x - wa.x
  const options: Rect[] = []
  if (roomBelow >= wb.height + gap)
    options.push({ x: cX, y: anchor.y + anchor.height + gap, width: wb.width, height: wb.height })
  if (roomAbove >= wb.height + gap)
    options.push({ x: cX, y: anchor.y - wb.height - gap, width: wb.width, height: wb.height })
  if (roomRight >= wb.width + gap)
    options.push({ x: anchor.x + anchor.width + gap, y: cY, width: wb.width, height: wb.height })
  if (roomLeft >= wb.width + gap)
    options.push({ x: anchor.x - wb.width - gap, y: cY, width: wb.width, height: wb.height })
  const clear = options.find((o) => !avoid || !rectsOverlap(o, avoid))
  let pick = clear ?? options[0]
  if (!pick) {
    pick = {
      x: wa.x + wa.width - wb.width - 24,
      y: wa.y + wa.height - wb.height - 24,
      width: wb.width,
      height: wb.height
    }
  }
  target.setPosition(clampX(pick.x), clampY(pick.y), false)
  return !avoid || !!clear
}
// 贴着倒计时窗(没有则托盘,再没有则右下角)摆放;avoid 传入要避让的窗口(如面板)。返回是否避开成功
function placeNearCapsule(target: BrowserWindow, avoid?: Rect): boolean {
  const anchor =
    capsuleWin && !capsuleWin.isDestroyed() ? capsuleWin.getBounds() : tray?.getBounds() ?? null
  if (!anchor) {
    const wb = target.getBounds()
    const wa = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
    target.setPosition(wa.x + wa.width - wb.width - 24, wa.y + wa.height - wb.height - 24, false)
    return true
  }
  return placeAround(target, anchor, avoid)
}
function positionPanel(): void {
  if (win) placeNearCapsule(win)
}
function showPanel(): void {
  if (!win) return
  positionPanel()
  // 面板已常驻所有桌面,直接出现在当前桌面;showInactive 不激活 app,不扰动其他窗口
  win.showInactive()
  win.webContents.send('go-home') // 每次打开都回到主界面
  win.webContents.send('panel-visible', true) // 恢复水球动画
  // 提醒卡若正显示,面板一开就把卡片重新摆位躲开面板(卡片不消失,各司其职)
  if (cardVisible) positionCardNearCapsule()
}
function togglePanel(): void {
  if (!win) return
  if (win.isVisible()) win.hide()
  else showPanel()
}

// ---------- 常驻胶囊 ----------
function createCapsule(): void {
  capsuleWin = new BrowserWindow({
    width: 200,
    height: 116,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    acceptFirstMouse: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  // 倒计时窗用最高层 screen-saver:面板、提醒卡都盖不住它,拖到哪都始终完整可见
  capsuleWin.setAlwaysOnTop(true, 'screen-saver')
  // visibleOnFullScreen:全屏看视频/写作/投屏时倒计时窗也得在,否则全屏期间整个 app 形同消失
  capsuleWin.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true
  })
  loadRenderer(capsuleWin, 'capsule')
  capsuleWin.once('ready-to-show', () => placeCapsule())
  // did-finish-load 一定会在渲染加载完触发,再强制摆放显示一次(比只靠 ready-to-show 更可靠)
  capsuleWin.webContents.once('did-finish-load', () => placeCapsule())
  // 双兜底:个别启动竞争下上面两个都异常时,1 秒与 2 秒各再试一次强制摆放并显示
  setTimeout(() => placeCapsule(), 1000)
  setTimeout(() => placeCapsule(), 2000)
}

// 把胶囊放到保存的位置(校验仍在某块屏幕内),否则默认右下角,并确保它显示出来
function placeCapsule(): void {
  if (!capsuleWin || capsuleWin.isDestroyed()) return
  const b = capsuleWin.getBounds()
  const saved = store.get('capsulePos')
  const onScreen =
    !!saved &&
    screen.getAllDisplays().some((d) => {
      const a = d.workArea
      return (
        saved.x >= a.x - 40 &&
        saved.x <= a.x + a.width - 40 &&
        saved.y >= a.y - 10 &&
        saved.y <= a.y + a.height - 10
      )
    })
  if (saved && onScreen) {
    capsuleWin.setPosition(saved.x, saved.y, false)
  } else {
    const wa = screen.getPrimaryDisplay().workArea
    capsuleWin.setPosition(wa.x + wa.width - b.width - 24, wa.y + wa.height - b.height - 24, false)
  }
  if (!capsuleWin.isVisible()) capsuleWin.show()
}
function toggleCapsule(): void {
  if (!capsuleWin) return
  if (capsuleWin.isVisible()) capsuleWin.hide()
  else capsuleWin.show()
  tray?.setContextMenu(buildTrayMenu())
}

// ---------- 提醒浮卡 ----------
function createCard(): void {
  cardWin = new BrowserWindow({
    width: 300,
    height: 312,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    acceptFirstMouse: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  // 提醒卡用 pop-up-menu:压在面板之上,但低于倒计时窗(倒计时窗永远盖在卡片上面、可见可点)
  cardWin.setAlwaysOnTop(true, 'pop-up-menu')
  // visibleOnFullScreen:提醒卡的本职就是到点提醒,全屏专注场景反而最该提醒,不能在全屏空间里弹不出来
  cardWin.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true
  })
  loadRenderer(cardWin, 'card')
}

// 卡片优先贴倒计时窗(躲面板);倒计时窗四周都被面板占满时,退到面板旁边、但避开倒计时窗。
// 两条路都不会压住倒计时窗——倒计时窗永远完整可见。
function positionCardNearCapsule(): void {
  if (!cardWin || cardWin.isDestroyed()) return
  const capsule = capsuleWin && !capsuleWin.isDestroyed() ? capsuleWin.getBounds() : undefined
  if (win && win.isVisible()) {
    const panel = win.getBounds()
    if (!placeNearCapsule(cardWin, panel)) placeAround(cardWin, panel, capsule)
  } else {
    placeNearCapsule(cardWin)
  }
}
// 提醒卡始终弹出(各司其职:卡=提醒,面板=主视图,倒计时窗=计时);贴倒计时窗、面板开着则自动躲面板
function presentReminder(): void {
  if (!cardVisible) return
  if (!cardWin || cardWin.isDestroyed()) return
  positionCardNearCapsule()
  const s = store.get('settings')
  cardWin.webContents.send('card-show', {
    todayMl: getDay(todayKey()).totalMl,
    goalMl: goalForToday(),
    cupMl: s.cupMl,
    line: dueLine,
    sound: s.sound,
    amounts: s.amounts
  })
  cardWin.showInactive()
}
// 同时发一条系统通知(设置里开启才发):锁屏/息屏/通知中心也能收到提醒,点开拉起面板。
// 静音交给系统(自绘卡已负责声音),避免开声音时响两遍。
function fireSystemNotification(line: string): void {
  if (!store.get('settings').systemNotify) return
  if (!Notification.isSupported()) return
  const n = new Notification({
    title: line,
    body: `今天 ${getDay(todayKey()).totalMl} / ${goalForToday()} ml`,
    silent: true
  })
  n.on('click', () => showPanel())
  n.show()
}
function showCard(): void {
  snoozePending = false // 已经弹出,一次性 snooze 使命完成
  cardVisible = true
  dueLine = pickLine(isReached(getDay(todayKey()).totalMl, goalForToday()))
  presentReminder()
  fireSystemNotification(dueLine)
  pushState()
  // 没人理会就过一会儿自动收起 + 重新计时,避免提醒循环被一直挂着的提醒冻死
  if (cardTimer) clearTimeout(cardTimer)
  cardTimer = setTimeout(() => {
    if (!cardVisible) return
    resetCountdown(reminderIntervalMs())
    hideCard()
    refreshAll()
  }, CARD_AUTO_DISMISS_MS)
}
function hideCard(): void {
  if (cardTimer) {
    clearTimeout(cardTimer)
    cardTimer = null
  }
  cardVisible = false
  if (cardWin && !cardWin.isDestroyed()) cardWin.hide()
  pushState()
}

// 暂停做成限时自动恢复:避免无限期暂停导致忘了恢复一直不喝水,和喝水助手目的冲突
const PAUSE_MS = 60 * 60 * 1000 // 默认暂停 1 小时(不指定时长时用它)
let pauseTimer: ReturnType<typeof setTimeout> | null = null
let pauseUntil = 0
// 距今天结束(本地午夜)还有多少 ms,给「今天不再提醒」用
function msUntilMidnight(): number {
  const now = new Date()
  const mid = new Date(now)
  mid.setHours(24, 0, 0, 0)
  return Math.max(60000, mid.getTime() - now.getTime())
}
// durationMs 由调用方按选择的时长传入(30/60/120 分钟等);不传走默认 1 小时
function setPaused(p: boolean, durationMs: number = PAUSE_MS): void {
  if (pauseTimer) {
    clearTimeout(pauseTimer)
    pauseTimer = null
  }
  // 暂停时若还挂着一张提醒卡,顺手收掉——不然点了暂停,卡片还杵在屏幕上到自动消失,别扭
  if (p && cardVisible) hideCard()
  const s = store.get('settings')
  store.set('settings', { ...s, paused: p })
  if (p) {
    const ms = durationMs > 0 ? durationMs : PAUSE_MS
    pauseUntil = Date.now() + ms
    pauseTimer = setTimeout(() => setPaused(false), ms) // 到点自动恢复提醒
  } else {
    pauseUntil = 0
  }
  pushState()
  tray?.setContextMenu(buildTrayMenu())
  // 让已打开的面板上的暂停按钮跟着切换状态
  if (win && !win.isDestroyed()) win.webContents.send('state-changed')
}

// ---------- 托盘 ----------
function buildTrayMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: '打开面板', click: () => showPanel() },
    {
      label: '立即喝一杯',
      click: () => {
        addWater(store.get('settings').cupMl)
        resetCountdown(reminderIntervalMs())
        refreshAll()
      }
    },
    store.get('settings').paused
      ? { label: '继续提醒', click: () => setPaused(false) }
      : {
          label: '暂停提醒',
          submenu: [
            { label: '30 分钟', click: () => setPaused(true, 30 * 60000) },
            { label: '1 小时', click: () => setPaused(true, 60 * 60000) },
            { label: '2 小时', click: () => setPaused(true, 120 * 60000) },
            { type: 'separator' },
            { label: '今天不再提醒', click: () => setPaused(true, msUntilMidnight()) }
          ]
        },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])
}
function createTray(): void {
  const isMac = process.platform === 'darwin'
  const px = isMac ? 18 : 16
  const icon = nativeImage
    .createFromDataURL(trayIconDataUrl)
    .resize({ width: px, height: px, quality: 'best' })
  if (isMac) icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip('喝水小助手 · 点这里打开菜单')
  // 用 setContextMenu:左键单击菜单栏图标即弹菜单(含退出),比手动监听 right-click 可靠
  tray.setContextMenu(buildTrayMenu())
}

// ---------- 单实例 ----------
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showPanel())

  app.whenReady().then(() => {
    if (process.platform === 'darwin') app.dock?.hide()

    ipcMain.handle('get-state', () => renderState())
    ipcMain.handle('add-water', (_e, ml: number) => {
      addWater(ml)
      resetCountdown(reminderIntervalMs()) // 主动加水=刚喝了,重置倒计时重新计
      if (cardVisible) hideCard() // 在面板里喝了水=这次提醒已应答,收起卡片(面板留着实时涨水)
      pushState()
      syncCard()
      return renderState()
    })
    ipcMain.handle('undo-last', () => {
      undoLast()
      pushState()
      syncCard()
      return renderState()
    })
    ipcMain.handle('get-today-entries', () => getDay(todayKey()).entries.slice().reverse())
    // 看某一天(含过去)的明细:记录页点柱子展开当天每一条用
    ipcMain.handle('get-day-entries', (_e, dateKey: string) =>
      getDay(dateKey).entries.slice().reverse()
    )
    ipcMain.handle('delete-entry', (_e, ts: number) => {
      const k = todayKey()
      const d = getDay(k)
      const idx = d.entries.findIndex((e) => e.ts === ts)
      if (idx >= 0) {
        d.totalMl = Math.max(0, d.totalMl - d.entries[idx].ml)
        d.entries.splice(idx, 1)
        setDay(k, d)
      }
      pushState()
      syncCard()
      return getDay(k).entries.slice().reverse()
    })
    // 撤销删除:把刚删掉的那条按原时间戳加回今天(记录页删单条后的「撤销」用)
    ipcMain.handle('restore-entry', (_e, entry: { ts: number; ml: number }) => {
      if (!entry || typeof entry.ts !== 'number' || typeof entry.ml !== 'number') return
      // 撤销窗口(4.5s)内若跨了午夜:昨天那条不该加进「新的今天」,直接忽略(极端边界)
      const dd = new Date(entry.ts)
      const entryKey = `${dd.getFullYear()}-${pad(dd.getMonth() + 1)}-${pad(dd.getDate())}`
      if (entryKey !== todayKey()) return
      const k = todayKey()
      const d = getDay(k)
      if (d.entries.some((e) => e.ts === entry.ts)) return // 已存在就不重复加
      d.entries.push({ ts: entry.ts, ml: entry.ml })
      d.entries.sort((a, b) => a.ts - b.ts) // 保持按时间排序,和明细显示顺序一致
      d.totalMl += entry.ml
      setDay(k, d)
      pushState()
      syncCard()
    })
    ipcMain.handle('clear-today', () => {
      setDay(todayKey(), { totalMl: 0, entries: [], goalMl: store.get('settings').dailyGoalMl })
      refreshAll()
    })
    ipcMain.handle('get-settings', () => store.get('settings'))
    ipcMain.handle('set-settings', (_e, partial: Partial<Settings>) => {
      const prev = store.get('settings')
      const merged = { ...prev, ...partial }
      store.set('settings', merged)
      try {
        app.setLoginItemSettings({ openAtLogin: merged.launchAtLogin })
      } catch {
        // 某些环境无权限,忽略
      }
      if (partial.intervalMin !== undefined && partial.intervalMin !== prev.intervalMin) {
        // 改间隔不清零重数:保留已经过去的时间,新剩余=新间隔-已过时间。调长顺延、不从头数。
        // 调短到比已过时间还短时,不当场弹卡(用户刚在调设置,突然被催很突兀),改起一个新的完整间隔。
        const elapsed = Math.max(0, segmentTotalMs - remainingMsNow())
        const total = intervalMs()
        const rem = total - elapsed
        segmentTotalMs = total
        deadlineTs = Date.now() + (rem > 0 ? Math.min(total, rem) : total)
        store.set('nextDueTs', deadlineTs) // 持久化,重启后不丢新间隔的计时基准
      }
      // 刚打开系统通知时立刻弹一条确认:既让用户看到通知长什么样、在哪出现,也借此触发 macOS 的授权弹窗
      if (partial.theme !== undefined && partial.theme !== prev.theme) applyTheme()
      if (partial.systemNotify === true && !prev.systemNotify && Notification.isSupported()) {
        const n = new Notification({
          title: '系统通知已开启',
          body: '以后到点提醒会同时发这样一条,锁屏和通知中心也能看到',
          silent: true
        })
        n.on('click', () => showPanel())
        n.show()
      }
      pushState()
      return merged
    })
    ipcMain.handle('reset-settings', () => {
      // 开机自启是系统级偏好,不属于「饮水设置」;恢复默认保留用户当前选择,不擅自重新打开
      const keepLaunch = store.get('settings').launchAtLogin
      // 开机自启是系统级偏好,不属于「饮水设置」;恢复默认保留用户当前选择,不擅自重开
      const def: Settings = { ...DEFAULT_SETTINGS, launchAtLogin: keepLaunch }
      store.set('settings', def)
      resetCountdown(intervalMs())
      applyTheme()
      pushState()
      return def
    })
    ipcMain.handle('reset-capsule-pos', () => {
      store.set('capsulePos', null)
      placeCapsule()
    })
    ipcMain.handle('get-stats', (_e, days: number) => getStats(days || 7))
    ipcMain.handle('get-month', (_e, ym: string) => getMonth(ym))
    // 数据导出:设置+饮水记录写成一个 JSON,存到用户选的位置(换电脑/重装前备份用)
    ipcMain.handle('export-data', async () => {
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: '导出饮水数据',
        defaultPath: `water-reminder-backup-${todayKey()}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }]
      })
      if (canceled || !filePath) return { ok: false }
      try {
        const data = {
          version: 1,
          exportedAt: Date.now(),
          settings: store.get('settings'),
          logs: store.get('logs')
        }
        writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
        return { ok: true, path: filePath }
      } catch {
        return { ok: false, error: '写入失败' }
      }
    })
    // 数据导入:从备份 JSON 恢复。按天合并,同一天以导入的为准,其他天保留;设置一并恢复
    ipcMain.handle('import-data', async () => {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: '导入饮水数据',
        properties: ['openFile'],
        filters: [{ name: 'JSON', extensions: ['json'] }]
      })
      if (canceled || !filePaths[0]) return { ok: false }
      try {
        const parsed = JSON.parse(readFileSync(filePaths[0], 'utf-8'))
        if (!parsed || typeof parsed !== 'object' || typeof parsed.logs !== 'object') {
          return { ok: false, error: '不是有效的备份文件' }
        }
        // 只合并结构合法的每日记录(totalMl 是数、entries 是数组),挡掉手改坏的备份导致统计出 NaN
        const cleanLogs: Record<string, DayLog> = {}
        for (const [k, v] of Object.entries(parsed.logs as Record<string, unknown>)) {
          const d = v as Partial<DayLog>
          if (d && typeof d === 'object' && typeof d.totalMl === 'number' && Array.isArray(d.entries)) {
            cleanLogs[k] = { totalMl: d.totalMl, entries: d.entries, goalMl: d.goalMl }
          }
        }
        store.set('logs', { ...store.get('logs'), ...cleanLogs })
        if (parsed.settings && typeof parsed.settings === 'object') {
          // 过 normalizeSettings:老备份缺字段/字段非法也补齐成完整合法值,不再让渲染层读到 undefined
          store.set(
            'settings',
            normalizeSettings({ ...store.get('settings'), ...parsed.settings, paused: false })
          )
        }
        resetCountdown(intervalMs())
        applyTheme()
        refreshAll()
        return { ok: true, days: Object.keys(cleanLogs).length }
      } catch {
        return { ok: false, error: '文件无法解析' }
      }
    })
    // 预览提醒:主页「试一下提醒效果」用,立即弹一张提醒卡
    ipcMain.handle('test-notify', () => {
      showCard()
      return true
    })

    // 胶囊:开面板 / 拖拽
    ipcMain.handle('toggle-panel', () => togglePanel())
    ipcMain.handle('hide-panel', () => win?.hide())
    ipcMain.on('capsule-move', (_e, dx: number, dy: number) => {
      if (!capsuleWin || capsuleWin.isDestroyed()) return
      const b = capsuleWin.getBounds()
      capsuleWin.setPosition(Math.round(b.x + dx), Math.round(b.y + dy), false)
    })
    // 拖倒计时窗:只移动它自己,面板/卡片不跟随(它们只在各自出现时贴一次,之后稳定不晃)
    ipcMain.on('capsule-drag-end', () => {
      if (capsuleWin && !capsuleWin.isDestroyed()) {
        const b = capsuleWin.getBounds()
        store.set('capsulePos', { x: b.x, y: b.y })
      }
    })
    // 自定义拖拽:移动发消息的那个窗口(面板/卡片),比 app-region 在非激活窗口上更顺
    ipcMain.on('win-move', (e, dx: number, dy: number) => {
      const w = BrowserWindow.fromWebContents(e.sender)
      if (!w) return
      const b = w.getBounds()
      w.setPosition(Math.round(b.x + dx), Math.round(b.y + dy), false)
    })

    // 倒计时 / 浮卡动作
    ipcMain.handle('get-countdown', () => buildCountdown())
    ipcMain.handle('card-drink', (_e, ml?: number) => {
      addWater(typeof ml === 'number' && ml > 0 ? ml : store.get('settings').cupMl)
      resetCountdown(reminderIntervalMs())
      hideCard()
      refreshAll()
    })
    ipcMain.handle('card-snooze', () => {
      resetCountdown(5 * 60000)
      snoozePending = true // 显式「5分钟后再提醒」:即便落在休息时段也如约弹这一次,不被冻结吞掉
      hideCard()
    })
    ipcMain.handle('card-skip', () => {
      resetCountdown(reminderIntervalMs())
      hideCard()
    })
    // 提醒卡上直接长暂停:开会被弹卡打断时不必回面板。'1h'=暂停1小时,'today'=今天不再提醒(到午夜恢复)
    ipcMain.handle('card-pause', (_e, kind: string) => {
      setPaused(true, kind === 'today' ? msUntilMidnight() : 60 * 60000)
      hideCard()
    })
    ipcMain.handle('get-guide-seen', () => store.get('guideSeen'))
    ipcMain.handle('mark-guide-seen', () => store.set('guideSeen', true))
    ipcMain.handle('set-paused', (_e, p: boolean, ms?: number) =>
      setPaused(!!p, typeof ms === 'number' && ms > 0 ? ms : PAUSE_MS)
    )
    ipcMain.handle('quit-app', () => {
      isQuitting = true
      app.quit()
    })

    applyTheme() // 先按用户选择的外观设好 themeSource,再建窗口(窗口底色据此取深/浅)
    createWindow()
    createCapsule()
    createCard()
    createTray()
    // 重启/重装后不从头重数:用上次保存的到点时刻,扣掉关闭期间流逝的时间接着数;
    // 关得太久(已过期)或没有记录则起一个新周期,避免一打开就立刻弹提醒。
    {
      const total = reminderIntervalMs()
      const saved = store.get('nextDueTs')
      let rem = saved ? saved - Date.now() : total
      if (rem <= 0 || rem > total) rem = total
      segmentTotalMs = total
      deadlineTs = Date.now() + rem
      store.set('nextDueTs', deadlineTs)
    }
    // 首次启动默认打开开机自启(诉求:重启电脑也要继续提醒)。之后用户在设置里关掉就尊重,不再强开
    if (!store.get('onboarded')) {
      store.set('settings', { ...store.get('settings'), launchAtLogin: true })
      store.set('onboarded', true)
    }
    try {
      app.setLoginItemSettings({ openAtLogin: store.get('settings').launchAtLogin })
    } catch {
      // 开发沙箱无权限会报 Operation not permitted,忽略;打包安装后生效
    }
    // 首次启动:把面板弹出来展示新手引导(之后不再自动弹,只剩胶囊常驻)
    if (!store.get('guideSeen')) setTimeout(() => showPanel(), 700)
    // 初始化计时基准:wasResting 取当前真实状态,避免第一拍把启动当成「休息→提醒」边沿误触发提醒
    wasResting = !inRemindWindow(store.get('settings'))
    lastTickTs = Date.now()
    // 显示器插拔/分辨率变化时重新校验胶囊位置:防止拔掉外接屏后胶囊卡在屏外坐标回不来
    screen.on('display-removed', () => placeCapsule())
    screen.on('display-metrics-changed', () => placeCapsule())
    setInterval(tick, 1000)
  })
}

// 胶囊/托盘常驻,关掉面板不退出应用
app.on('window-all-closed', () => {})
