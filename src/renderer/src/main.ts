import './style.css'
import type {} from './api'
import { mountHome } from './home'
import { renderRecords } from './records'
import { renderSettings } from './settings'

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <div id="view-home" class="view"></div>
  <div id="view-records" class="view hidden"></div>
  <div id="view-settings" class="view hidden"></div>
`

const homeEl = document.querySelector<HTMLDivElement>('#view-home')!
const recordsEl = document.querySelector<HTMLDivElement>('#view-records')!
const settingsEl = document.querySelector<HTMLDivElement>('#view-settings')!

let currentView: 'home' | 'records' | 'settings' = 'home'
function showView(v: 'home' | 'records' | 'settings'): void {
  currentView = v
  homeEl.classList.toggle('hidden', v !== 'home')
  recordsEl.classList.toggle('hidden', v !== 'records')
  settingsEl.classList.toggle('hidden', v !== 'settings')
  home.setViewActive(v === 'home') // 切走主面板时清掉残留 toast,避免回来闪一下
  if (v === 'records')
    void renderRecords(recordsEl, () => showView('home'), () => void home.refresh())
  if (v === 'settings')
    void renderSettings(settingsEl, () => showView('home'), () => void home.refresh())
}

const home = mountHome(homeEl, { onNav: (v) => showView(v) })

// 记录页开着时,他处喝水/清零/跨午夜都会广播 state-changed,这里重渲染让明细和趋势保持最新
// (home 自身已订阅刷新水球,这里只补记录页)
window.api.onStateChanged(() => {
  if (currentView === 'records')
    void renderRecords(recordsEl, () => showView('home'), () => void home.refresh())
})

// 每次打开面板都回到主界面(主进程在 showPanel 时通知)
window.api.onGoHome(() => showView('home'))

// ---------- 新手引导(首启展示一次,设置里可随时再调出) ----------
async function showGuide(): Promise<void> {
  document.querySelector('.guide-overlay')?.remove() // 清掉可能残留的旧引导,保证每次都能再弹
  // 开机自启说明按实际状态给:新用户首启已被开启显示「已为你开启」,老用户/关过的显示「可在设置打开」
  const s = await window.api.getSettings()
  const launchNote = s.launchAtLogin
    ? '已为你<b>开启开机自启</b>,重启电脑也会继续提醒;不需要可在设置里关闭'
    : '想让它重启电脑后也继续提醒,可在<b>设置</b>里打开<b>开机自启</b>'
  const steps = [
    { icon: '⏱', text: '角落的<b>倒计时小窗</b>点一下就打开/收起面板;它常浮在最上层(全屏也在),可拖到顺手的角落' },
    { icon: '💧', text: '点<b>「加一杯」</b>或快捷水量记账,水球会涨、喝够就达标;不确定喝多少,设置里能<b>按体重估算</b>' },
    { icon: '🔔', text: '到点从角落弹<b>提醒卡</b>:「喝了」记一杯,也能稍后/跳过,或直接<b>暂停1小时 / 今天不再提醒</b>' },
    { icon: '⚙️', text: '<b>齿轮</b>进设置:目标、提醒时段、达标后是否停、<b>数据导出备份</b>;提醒间隔在面板上直接选' },
    { icon: '⏸', text: '需要清静点面板<b>「临时暂停」</b>,30 分钟到一整天可选、到点自动恢复;退出在顶部菜单栏水滴图标里' }
  ]
  const overlay = document.createElement('div')
  overlay.className = 'guide-overlay'
  overlay.innerHTML = `
    <div class="guide-card">
      <div class="guide-drop">💧</div>
      <div class="guide-title">欢迎使用喝水小助手</div>
      <div class="guide-desc">轻提醒,不打扰,陪你每天喝够水</div>
      <ul class="guide-list">
        ${steps
          .map((s) => `<li><span class="gi">${s.icon}</span><span class="gt">${s.text}</span></li>`)
          .join('')}
      </ul>
      <div class="guide-note">${launchNote}</div>
      <button class="guide-cta" id="guideCta">开始喝水</button>
    </div>
  `
  app.appendChild(overlay)
  void overlay.offsetWidth // 强制回流:保证进场动画从初始态(透明+缩小)开始播,不被合帧吃掉
  overlay.classList.add('shown')
  const cta = overlay.querySelector<HTMLButtonElement>('#guideCta')!
  function closeGuide(): void {
    document.removeEventListener('keydown', onKey, true)
    void window.api.markGuideSeen()
    overlay.classList.remove('shown')
    overlay.classList.add('leaving')
    window.setTimeout(() => overlay.remove(), 220) // 和出场动画时长对齐,不截断
  }
  function onKey(e: KeyboardEvent): void {
    // 引导打开时接管 Enter/Esc 关闭 —— 否则 Enter 会落到触发它的「使用引导」按钮上、把引导反复弹起
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      closeGuide()
    }
  }
  document.addEventListener('keydown', onKey, true)
  cta.addEventListener('click', closeGuide)
  cta.focus() // 焦点移进引导,Enter 落在这里而不是背后的按钮
}
// 设置页「使用引导」触发:不切视图,直接在当前页上淡入引导层(避免切到主页的白闪),关掉回原处
window.addEventListener('show-guide', () => void showGuide())
void window.api.getGuideSeen().then((seen) => {
  if (!seen) void showGuide()
})
