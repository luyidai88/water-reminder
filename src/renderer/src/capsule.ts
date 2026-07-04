import './capsule.css'
import type { CountdownState } from './api'

const root = document.getElementById('capsule')!
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const R = 19
const C = 2 * Math.PI * R

// 手写 SVG 水滴(主题蓝填充 + 一点白色高光),替代 emoji💧,深浅两色都跟主题、与进度环同一套视觉语言
const DROP_SVG = `<svg class="drop-ico" viewBox="0 0 24 24"><path d="M12 2.5C12 2.5 5.5 10 5.5 15a6.5 6.5 0 1 0 13 0C18.5 10 12 2.5 12 2.5Z"/><ellipse cx="9.6" cy="15.2" rx="1.5" ry="2.1" fill="#fff" opacity="0.4"/></svg>`

root.innerHTML = `
  <div class="cap" id="cap">
    <div class="ring-wrap">
      <svg viewBox="0 0 44 44" class="ring">
        <circle class="ring-track" cx="22" cy="22" r="${R}"></circle>
        <circle class="ring-prog" cx="22" cy="22" r="${R}"
          stroke-dasharray="${C.toFixed(2)}"
          stroke-dashoffset="${C.toFixed(2)}"
          transform="rotate(-90 22 22)"></circle>
      </svg>
      <div class="drop">${DROP_SVG}</div>
    </div>
    <div class="info">
      <div class="label" id="capLabel">下次喝水</div>
      <div class="count" id="capCount">--:--</div>
    </div>
  </div>
`

const cap = document.getElementById('cap')!
const prog = root.querySelector<SVGCircleElement>('.ring-prog')!
const labelEl = document.getElementById('capLabel')!
const countEl = document.getElementById('capCount')!

let targetP = 0
let curP = 0

function fmt(ms: number): string {
  const t = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(t / 60)
  const s = t % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
// 暂停剩余时长:超过 1 小时(如「今天不再提醒」)显示 Xh 小时,免得出现 623:45 这种巨大分钟数
function fmtPause(ms: number): string {
  const t = Math.max(0, Math.round(ms / 1000))
  if (t >= 3600) {
    const h = Math.floor(t / 3600)
    const m = Math.floor((t % 3600) / 60)
    return `${h}h${String(m).padStart(2, '0')}`
  }
  return fmt(ms)
}

function applyState(st: CountdownState): void {
  cap.classList.toggle('paused', st.paused)
  cap.classList.toggle('active', st.active)
  cap.classList.toggle('reached', st.reached && !st.active)

  const progress = st.totalMs ? 1 - st.remainingMs / st.totalMs : 0
  if (st.active) {
    labelEl.textContent = '该喝水啦'
    countEl.innerHTML = DROP_SVG
    targetP = 1
  } else if (st.paused) {
    // 暂停是限时的,显示距自动恢复还剩多久
    labelEl.textContent = '已暂停'
    countEl.textContent = fmtPause(st.pauseRemainingMs)
    targetP = progress
  } else if (st.doneForDay) {
    // 已达标且设置了达标后停止提醒:今天到此为止,不再倒数
    labelEl.textContent = '今日喝够'
    countEl.textContent = '✓'
    targetP = 1
  } else if (st.resting) {
    // 休息时段倒计时是冻结的,显示一个不动的残值没意义;改显示下次恢复提醒的时刻
    labelEl.textContent = st.restUntilLabel ? '休息·恢复于' : '休息中'
    countEl.textContent = st.restUntilLabel || '已停'
    targetP = progress
  } else if (st.reached) {
    // 达标但选择了继续提醒,显示保持的倒计时,不再是停止的对勾
    labelEl.textContent = '已达标·保持'
    countEl.textContent = fmt(st.remainingMs)
    targetP = progress
  } else {
    labelEl.textContent = '下次喝水'
    countEl.textContent = fmt(st.remainingMs)
    targetP = progress
  }
  targetP = Math.max(0, Math.min(1, targetP))
  if (prefersReduced) {
    curP = targetP
    draw()
  }
}

function draw(): void {
  prog.setAttribute('stroke-dashoffset', (C * (1 - curP)).toFixed(2))
}

function loop(): void {
  curP += (targetP - curP) * 0.12
  if (Math.abs(targetP - curP) < 0.001) curP = targetP
  draw()
  requestAnimationFrame(loop)
}
if (!prefersReduced) requestAnimationFrame(loop)

void window.api.getCountdown().then(applyState)
window.api.onCountdown(applyState)

// 拖拽移动 / 点击开面板:按位移量区分点击与拖动
let dragging = false
let moved = 0
let lastX = 0
let lastY = 0

cap.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return
  dragging = true
  moved = 0
  lastX = e.screenX
  lastY = e.screenY
  e.preventDefault()
})
window.addEventListener('mousemove', (e) => {
  if (!dragging) return
  const dx = e.screenX - lastX
  const dy = e.screenY - lastY
  lastX = e.screenX
  lastY = e.screenY
  moved += Math.abs(dx) + Math.abs(dy)
  // 只移动倒计时窗自己,面板/卡片不跟随
  window.api.capsuleMove(dx, dy)
})
window.addEventListener('mouseup', () => {
  if (!dragging) return
  dragging = false
  if (moved < 4) void window.api.togglePanel()
  else window.api.capsuleDragEnd()
})
