import './card.css'
import type { CardState, CardBody } from './api'

const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const root = document.getElementById('card')!

// 手写 SVG 水滴(主题蓝 + 白高光),替代 emoji💧,与胶囊/水球同一套视觉语言,深浅两色都跟主题
const DROP_SVG = `<svg class="drop-ico" viewBox="0 0 24 24"><path d="M12 2.5C12 2.5 5.5 10 5.5 15a6.5 6.5 0 1 0 13 0C18.5 10 12 2.5 12 2.5Z"/><ellipse cx="9.6" cy="15.2" rx="1.5" ry="2.1" fill="#fff" opacity="0.4"/></svg>`

root.innerHTML = `
  <div class="card" id="cardInner">
    <div class="card-top">
      <div class="drop">${DROP_SVG}</div>
      <div class="texts">
        <div class="title" id="cardTitle">喝口水吧</div>
        <div class="sub" id="cardSub">今天 0 / 2000 ml</div>
      </div>
    </div>
    <button class="btn-primary" id="btnDrink">喝了 <span id="cupTag">+250ml</span></button>
    <div class="card-amts" id="cardAmts"></div>
    <div class="btn-row">
      <button class="btn-ghost" id="btnSnooze">稍后5分钟</button>
      <button class="btn-ghost muted" id="btnSkip">跳过</button>
    </div>
    <div class="pause-line">
      <span class="pause-line-label">忙?停一会</span>
      <div class="pause-actions">
        <button class="pause-link" id="btnPause1h">暂停1小时</button>
        <button class="pause-link" id="btnPauseToday">今天不再提醒</button>
      </div>
    </div>
  </div>
`

const inner = document.getElementById('cardInner')!
const titleEl = document.getElementById('cardTitle')!
const subEl = document.getElementById('cardSub')!
const cupTag = document.getElementById('cupTag')!

// 声音提醒(默认关,设置里开):柔和的一声 ding,不依赖音频文件
function playDing(): void {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g)
    g.connect(ctx.destination)
    o.type = 'sine'
    o.frequency.value = 880
    g.gain.setValueAtTime(0.0001, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.14, ctx.currentTime + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4)
    o.start()
    o.stop(ctx.currentTime + 0.42)
    o.onended = (): void => void ctx.close()
  } catch {
    // 忽略
  }
}

function enter(): void {
  inner.classList.remove('leaving')
  if (prefersReduced) {
    inner.classList.add('shown')
    return
  }
  inner.classList.remove('shown')
  // 强制回流,保证每次显示都重新播放入场动画
  void inner.offsetWidth
  inner.classList.add('shown')
}

async function leave(action: () => Promise<unknown>): Promise<void> {
  if (!prefersReduced) {
    inner.classList.remove('shown')
    inner.classList.add('leaving')
    await new Promise((r) => setTimeout(r, 200))
  }
  await action()
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
// 卡片上点暂停时,先把「停到几点」写到标题上停留一下再淡出,和主面板暂停的 toast 反馈对齐,
// 不让用户点完卡片直接消失、不知道停到什么时候
async function pauseWithFeedback(msg: string, action: () => Promise<unknown>): Promise<void> {
  titleEl.textContent = msg
  await new Promise((r) => setTimeout(r, 1100))
  await leave(action)
}

// 只刷新身体(今天/目标/百分比/快捷量),不动标题、不重播入场、不响声 —— 数据变了同步用
function renderBody(st: CardBody): void {
  subEl.textContent = `今天 ${st.todayMl}/${st.goalMl}ml · 已完成 ${Math.round((st.todayMl / st.goalMl) * 100)}%`
  cupTag.textContent = `+${st.cupMl}ml`
  const amtsEl = document.getElementById('cardAmts')!
  amtsEl.innerHTML = st.amounts
    .map((ml) => `<button class="camt" data-ml="${ml}">${ml}<small>ml</small></button>`)
    .join('')
  amtsEl.querySelectorAll<HTMLButtonElement>('.camt').forEach((b) => {
    const ml = b.getAttribute('data-ml')
    if (ml) b.addEventListener('click', () => void leave(() => window.api.drinkNow(Number(ml))))
  })
}
const btnToday = document.getElementById('btnPauseToday')!
let todayArmed = false
let todayTimer = 0
// 每次弹新卡都把「今天不再提醒」的确认态复位,避免上次的预备态残留
function resetTodayArm(): void {
  todayArmed = false
  window.clearTimeout(todayTimer)
  btnToday.textContent = '今天不再提醒'
  btnToday.classList.remove('armed')
}

function apply(st: CardState): void {
  titleEl.textContent = st.line
  renderBody(st)
  resetTodayArm()
  enter()
  if (st.sound) playDing()
}

document
  .getElementById('btnDrink')!
  .addEventListener('click', () => void leave(() => window.api.drinkNow()))
document
  .getElementById('btnSnooze')!
  .addEventListener('click', () => void leave(() => window.api.snooze()))
document
  .getElementById('btnSkip')!
  .addEventListener('click', () => void leave(() => window.api.skip()))
// 卡片上直接长暂停,不必回面板:开会/专注时一键停久点
document.getElementById('btnPause1h')!.addEventListener('click', () => {
  const resume = new Date(Date.now() + 60 * 60000)
  void pauseWithFeedback(`已暂停到 ${hhmm(resume)}`, () => window.api.cardPause('1h'))
})
// 「今天不再提醒」是当天全静音的重操作,和「跳过」挨得近容易误点,改成二次确认:先点预备、再点才生效
btnToday.addEventListener('click', () => {
  if (!todayArmed) {
    todayArmed = true
    btnToday.textContent = '确认?不再提醒'
    btnToday.classList.add('armed')
    todayTimer = window.setTimeout(resetTodayArm, 3000)
    return
  }
  window.clearTimeout(todayTimer)
  void pauseWithFeedback('今天不再提醒,明天恢复', () => window.api.cardPause('today'))
})

window.api.onCardShow(apply)
window.api.onCardUpdate(renderBody)
