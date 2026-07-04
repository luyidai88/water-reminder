interface MountOpts {
  onNav: (v: 'records' | 'settings') => void
}

const barsIcon =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="6" y1="20" x2="6" y2="13"/><line x1="12" y1="20" x2="12" y2="8"/><line x1="18" y1="20" x2="18" y2="4"/></svg>'
const gearIcon =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'

const logIcon =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="7" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="5" cy="17" r="1"/><line x1="9" y1="7" x2="20" y2="7"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="17" x2="20" y2="17"/></svg>'
const closeIcon =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>'

export function mountHome(
  root: HTMLElement,
  opts: MountOpts
): { refresh: () => Promise<void>; setViewActive: (active: boolean) => void } {
  const state = {
    goalMl: 2000,
    cupMl: 250,
    todayMl: 0,
    intervalMin: 60,
    paused: false,
    amounts: [100, 250, 350, 500] as number[]
  }
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  function formatDate(): string {
    const d = new Date()
    const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
    return `${d.getMonth() + 1}月${d.getDate()}日 周${week}`
  }

  root.innerHTML = `
    <div class="panel">
      <header class="head">
        <div class="head-title">
          <div class="title">今天</div>
          <div class="date">${formatDate()}</div>
        </div>
        <div class="head-actions">
          <button class="icon-btn" id="navRecords" title="记录与统计">${logIcon}</button>
          <button class="icon-btn" id="navSettings" title="设置">${gearIcon}</button>
          <button class="icon-btn" id="closePanel" title="收起（app继续后台运行）">${closeIcon}</button>
        </div>
      </header>

      <div class="orb-wrap">
        <svg class="orb" viewBox="0 0 220 220">
          <defs>
            <clipPath id="orbClip"><circle cx="110" cy="110" r="100" /></clipPath>
            <linearGradient id="waterGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--water-light)" />
              <stop offset="100%" stop-color="var(--water-deep)" />
            </linearGradient>
          </defs>
          <circle class="orb-bg" cx="110" cy="110" r="100" />
          <g clip-path="url(#orbClip)">
            <path class="wave wave-back" id="waveBack"></path>
            <path class="wave wave-front" id="waveFront"></path>
            <g id="bubbles"></g>
          </g>
          <circle class="orb-ring" cx="110" cy="110" r="100" />
        </svg>
        <div class="orb-text">
          <div class="amount"><span id="amount">0</span><span class="unit">ml</span></div>
        </div>
      </div>

      <div class="orb-meta">
        <span class="meta-goal">目标 <span id="goal">${state.goalMl}</span> ml</span>
        <span class="meta-percent" id="percent">已完成 0%</span>
      </div>
      <div class="progress-hint" id="progressHint">还差 ${state.goalMl}ml 达标</div>

      <button class="add-btn" id="addBtn">
        <span class="add-plus">+</span> 加一杯 <span class="add-sub" id="cupAmount">${state.cupMl}ml</span>
      </button>
      <div class="quick-amts" id="quickAmts"></div>
      <div class="amt-custom hidden" id="amtCustomBox">
        <input type="number" id="amtCustomInput" min="10" max="2000" step="10" placeholder="输入ml" />
        <button class="chip chip-apply" id="amtCustomApply">加</button>
      </div>
      <button class="undo-btn" id="undoBtn">撤销上一杯</button>

      <div class="remind">
        <div class="remind-head">
          <span class="remind-label">提醒间隔(分钟)</span>
        </div>
        <div class="remind-chips" id="remindChips">
          <button class="chip" data-min="30">30</button>
          <button class="chip" data-min="45">45</button>
          <button class="chip" data-min="60">60</button>
          <button class="chip" data-min="90">90</button>
          <button class="chip" data-min="120">120</button>
          <button class="chip" id="chipCustom">自定义</button>
        </div>
        <div class="remind-custom hidden" id="remindCustom">
          <input type="number" id="customMin" min="5" max="240" step="5" placeholder="输入数字" />
          <span class="custom-unit">分钟</span>
          <button class="chip chip-apply" id="customApply">确定</button>
        </div>
        <div class="pause-bar">
          <span class="pause-bar-label">临时暂停</span>
          <button class="remind-pause" id="remindPause">暂停提醒</button>
        </div>
        <div class="pause-opts hidden" id="pauseOpts">
          <span class="pause-opts-label">⏸ 暂停多久（到点自动恢复）</span>
          <div class="pause-opts-row">
            <button class="chip pause-chip" data-pause="30">30 分钟</button>
            <button class="chip pause-chip" data-pause="60">1 小时</button>
            <button class="chip pause-chip" data-pause="120">2 小时</button>
            <button class="chip pause-chip" data-pause="today">今天</button>
          </div>
        </div>
        <button class="remind-now" id="remindNow">立即提醒一下</button>
      </div>
      <div class="toast hidden" id="toast"></div>
    </div>
  `

  const q = <T extends Element>(sel: string): T => root.querySelector<T>(sel)!
  const waveBack = q<SVGPathElement>('#waveBack')
  const waveFront = q<SVGPathElement>('#waveFront')
  const bubblesG = q<SVGGElement>('#bubbles')
  const amountEl = q<HTMLSpanElement>('#amount')
  const goalEl = q<HTMLSpanElement>('#goal')
  const cupAmountEl = q<HTMLSpanElement>('#cupAmount')
  const percentEl = q<HTMLDivElement>('#percent')
  const orbRing = q<SVGCircleElement>('.orb-ring')
  const panelEl = q<HTMLDivElement>('.panel')
  const addBtn = q<HTMLButtonElement>('#addBtn')
  const undoBtn = q<HTMLButtonElement>('#undoBtn')
  const hintEl = q<HTMLDivElement>('#progressHint')

  // 顶栏吸顶:只在真正往下滑时才浮出淡背景,停在顶部保持透明无缝(隔离感不重)
  const headEl = q<HTMLElement>('.head')
  panelEl.addEventListener('scroll', () => {
    headEl.classList.toggle('scrolled', panelEl.scrollTop > 2)
  })

  q<HTMLButtonElement>('#navRecords').addEventListener('click', () => opts.onNav('records'))
  q<HTMLButtonElement>('#navSettings').addEventListener('click', () => opts.onNav('settings'))

  function updateHint(): void {
    const remain = state.goalMl - state.todayMl
    hintEl.textContent = remain > 0 ? `还差 ${remain}ml 达标` : '已达标，继续保持 💧'
  }

  // 提醒间隔(主页直接调:预设 + 自定义,改完即时保存)
  const remindChips = q<HTMLDivElement>('#remindChips')
  const chipCustom = q<HTMLButtonElement>('#chipCustom')
  const remindCustom = q<HTMLDivElement>('#remindCustom')
  const customMin = q<HTMLInputElement>('#customMin')
  const toastEl = q<HTMLDivElement>('#toast')

  q<HTMLButtonElement>('#closePanel').addEventListener('click', () => void window.api.hidePanel())

  let toastTimer = 0
  // 主面板是否为当前可见视图:切到记录/设置时置 false,防止 toast 在切走后(含异步回调)弹出、回主面板时残留闪一下
  let viewActive = true
  function clearToast(): void {
    window.clearTimeout(toastTimer)
    toastEl.classList.add('hidden')
    toastEl.classList.remove('pop')
  }
  function setViewActive(active: boolean): void {
    viewActive = active
    if (!active) clearToast() // 离开主面板时把还没到点消失的 toast 立刻清掉
  }
  function showToast(msg: string): void {
    if (!viewActive) return // 已切到别的视图就不弹,否则回主面板会闪现
    toastEl.textContent = msg
    toastEl.classList.remove('hidden')
    // 重播一次入场动画:连着弹不同内容时(如刚暂停又点立即提醒),让用户一眼看出是新的一条,
    // 而不是以为还是上一条、在等它消失
    toastEl.classList.remove('pop')
    void toastEl.offsetWidth
    toastEl.classList.add('pop')
    window.clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => toastEl.classList.add('hidden'), 3200)
  }

  function updateRemind(): void {
    let matched = false
    remindChips.querySelectorAll<HTMLButtonElement>('.chip').forEach((c) => {
      const m = c.getAttribute('data-min')
      const on = !!m && Number(m) === state.intervalMin
      c.classList.toggle('active', on)
      if (on) matched = true
    })
    chipCustom.classList.toggle('active', !matched)
    chipCustom.textContent = matched ? '自定义' : `自定义（${state.intervalMin}分）`
  }
  async function applyInterval(min: number): Promise<void> {
    const raw = Math.round(min)
    const v = Math.min(Math.max(raw, 5), 240)
    await window.api.setSettings({ intervalMin: v })
    state.intervalMin = v
    customMin.value = String(v) // 超范围被截断时,把框里的值也回写成实际生效值
    remindCustom.classList.add('hidden')
    updateRemind()
    // 被截断时说明范围,不让用户以为输入被默默改掉
    showToast(v !== raw ? `提醒间隔范围 5~240 分钟,已设为 ${v}` : `提醒间隔已设为 ${v} 分钟`)
  }
  remindChips.querySelectorAll<HTMLButtonElement>('.chip').forEach((c) => {
    const m = c.getAttribute('data-min')
    if (m) c.addEventListener('click', () => void applyInterval(Number(m)))
  })
  chipCustom.addEventListener('click', () => {
    remindCustom.classList.toggle('hidden')
    if (!remindCustom.classList.contains('hidden')) {
      customMin.value = String(state.intervalMin)
      customMin.focus()
    }
  })
  function applyCustomInterval(): void {
    const v = Number(customMin.value)
    if (Number.isFinite(v) && v > 0) void applyInterval(v)
  }
  q<HTMLButtonElement>('#customApply').addEventListener('click', applyCustomInterval)
  // 自定义间隔输入框按回车直接确定,和「常用水量自定义」的回车行为对齐
  customMin.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') applyCustomInterval()
  })
  // 立即提醒一下(主动唤起提醒卡,不必等倒计时归零)。暂停时禁用:都暂停了还能手动弹卡自相矛盾
  const remindNow = q<HTMLButtonElement>('#remindNow')
  remindNow.addEventListener('click', () => {
    if (remindNow.classList.contains('is-off')) {
      showToast('暂停中不可用,先点上面「已暂停 · 继续」恢复提醒')
      return
    }
    void window.api.testNotify()
  })

  // 暂停/继续提醒(开会、午睡时静音;再点恢复)。点暂停先展开时长选项,选了才暂停,到点自动恢复
  const remindPause = q<HTMLButtonElement>('#remindPause')
  const pauseOpts = q<HTMLDivElement>('#pauseOpts')
  function updatePause(): void {
    remindPause.classList.toggle('paused', state.paused)
    remindPause.innerHTML = state.paused
      ? '<span class="rp-ico">▶</span>已暂停 · 继续'
      : '<span class="rp-ico">⏸</span>暂停提醒'
    if (state.paused) pauseOpts.classList.add('hidden')
    // 暂停时把「立即提醒一下」置灰。注意:本 app 窗口用 showInactive 从不激活,系统 title 悬停提示
    // 根本不渲染,所以不靠 title,改在点击时弹 toast 说明(见下方守卫)
    remindNow.classList.toggle('is-off', state.paused)
  }
  remindPause.addEventListener('click', () => {
    if (state.paused) {
      state.paused = false
      pauseOpts.classList.add('hidden')
      updatePause()
      void window.api.setPaused(false)
    } else {
      pauseOpts.classList.toggle('hidden')
    }
  })
  // 距今天结束(本地午夜)的毫秒数,给「今天不再提醒」用
  function msUntilMidnight(): number {
    const now = new Date()
    const mid = new Date(now)
    mid.setHours(24, 0, 0, 0)
    return Math.max(60000, mid.getTime() - now.getTime())
  }
  pauseOpts.querySelectorAll<HTMLButtonElement>('.chip').forEach((b) => {
    const tag = b.getAttribute('data-pause')
    b.addEventListener('click', () => {
      state.paused = true
      pauseOpts.classList.add('hidden')
      updatePause()
      if (tag === 'today') {
        void window.api.setPaused(true, msUntilMidnight())
        // 时段外点「今天不再提醒」几乎无额外作用(剩下的今天本就在休息),据实告知,不让用户以为多做了什么
        void window.api.getCountdown().then((cd) => {
          showToast(
            cd.resting
              ? '现在已是休息时段,今天剩下时间本就不提醒,明天时段开始前保持安静'
              : '今天不再提醒,明天自动恢复'
          )
        })
      } else {
        const min = Number(tag)
        void window.api.setPaused(true, min * 60000)
        showToast(min < 60 ? `已暂停提醒 ${min} 分钟` : `已暂停提醒 ${min / 60} 小时`)
      }
    })
  })
  // ---------- 动画状态 ----------
  let level = 0
  let levelV = 0
  let displayedMl = 0
  let phaseBack = 0
  let phaseFront = Math.PI / 2
  let lastReached = false
  let btnScale = 1
  let btnScaleV = 0

  const targetLevel = (): number => Math.min(state.todayMl / state.goalMl, 1)

  function buildWave(lvl: number, phase: number, amp: number, waveLen: number): string {
    const W = 220
    const H = 220
    const clamped = Math.max(0, Math.min(1, lvl))
    const baseY = H * (1 - clamped)
    let d = `M 0 ${baseY.toFixed(2)}`
    for (let x = 0; x <= W; x += 6) {
      const y = baseY + Math.sin((x / waveLen) * Math.PI * 2 + phase) * amp
      d += ` L ${x.toFixed(0)} ${y.toFixed(2)}`
    }
    d += ` L ${W} ${H} L 0 ${H} Z`
    return d
  }

  function spawnBubbles(count = 5): void {
    if (prefersReduced) return
    for (let i = 0; i < count; i++) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      c.setAttribute('cx', String(55 + Math.random() * 110))
      c.setAttribute('cy', '215')
      c.setAttribute('r', String(2 + Math.random() * 4))
      c.setAttribute('class', 'bubble')
      bubblesG.appendChild(c)
      const rise = 120 + Math.random() * 70
      const dur = 700 + Math.random() * 600
      const drift = (Math.random() - 0.5) * 22
      const anim = c.animate(
        [
          { transform: 'translate(0px, 0px)', opacity: 0.8 },
          { transform: `translate(${drift}px, -${rise}px)`, opacity: 0 }
        ],
        { duration: dur, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', delay: i * 55 }
      )
      anim.onfinish = (): void => c.remove()
    }
  }

  function celebrate(): void {
    panelEl.classList.add('reached')
    if (prefersReduced) return
    orbRing.animate(
      [
        { strokeWidth: 4, opacity: 1 },
        { strokeWidth: 14, opacity: 0.25 },
        { strokeWidth: 4, opacity: 1 }
      ],
      { duration: 900, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }
    )
    spawnBubbles(7)
    setTimeout(() => spawnBubbles(7), 220)
  }

  let last = performance.now()
  // 面板隐藏时暂停水球动画:Electron 隐藏窗的 rAF 不会被浏览器自动停,不暂停就后台每帧空拼路径耗电
  let frameOn = true
  function frame(now: number): void {
    if (!frameOn) return // 已暂停:不再排下一帧,彻底停住
    try {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const target = targetLevel()

      if (prefersReduced) {
        level = target
        displayedMl = state.todayMl
      } else {
        const accel = -90 * (level - target) - 13 * levelV
        levelV += accel * dt
        level += levelV * dt
        displayedMl += (state.todayMl - displayedMl) * Math.min(dt * 6, 1)
        phaseBack += dt * 1.1
        phaseFront += dt * 1.7
        const ba = -220 * (btnScale - 1) - 18 * btnScaleV
        btnScaleV += ba * dt
        btnScale += btnScaleV * dt
        addBtn.style.transform = `scale(${btnScale.toFixed(3)})`
      }

      const amp = prefersReduced ? 0 : 5
      waveBack.setAttribute('d', buildWave(level, phaseBack, amp * 0.7, 150))
      waveFront.setAttribute('d', buildWave(level, phaseFront, amp, 110))
      amountEl.textContent = String(Math.round(displayedMl))
      percentEl.textContent = `已完成 ${Math.round((state.todayMl / state.goalMl) * 100)}%`

      const reached = state.todayMl >= state.goalMl
      if (reached && !lastReached) celebrate()
      lastReached = reached
    } catch {
      // 单帧渲染异常不该让整个动画循环停摆、数字永久冻住;吞掉本帧,继续排下一帧
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)

  // 面板可见却停着帧时把循环救回来(只在确实可见时,重置 last 避免 dt 跳变)
  function resumeFrame(): void {
    if (frameOn || document.hidden) return
    frameOn = true
    last = performance.now()
    requestAnimationFrame(frame)
  }
  // 帧循环显隐用两路信号驱动,任一恢复可见都续上:
  //   1) 主进程 IPC(win.hide/show 时发)
  //   2) 浏览器原生 visibilitychange —— 永远和真实可见性一致,是自愈兜底
  // 只靠 IPC 布尔时,一旦漏发一次 true(如全屏切换后系统直接还原窗口、没走 showPanel),
  // 水球会永久冻住;原生信号 + addCup/undoCup 里的 resumeFrame 双保险,杜绝卡死。
  window.api.onPanelVisible((v) => {
    if (v) resumeFrame()
    else frameOn = false
  })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) frameOn = false
    else resumeFrame()
  })

  async function addCup(ml: number = state.cupMl): Promise<void> {
    try {
      const r = await window.api.addWater(ml)
      state.todayMl = r.todayMl
      updateHint()
      resumeFrame() // 面板可见却卡住时,点加一杯就把水球循环救回来,数字立刻跟上
      if (!prefersReduced) {
        btnScale = 0.9
        btnScaleV = 0
        spawnBubbles()
      }
    } catch {
      // 写盘/IPC 意外失败时给个提示,不让失败和成功一样安静,免得用户反复点
      showToast('记录失败,请重试')
    }
  }
  async function undoCup(): Promise<void> {
    if (state.todayMl <= 0) {
      showToast('今天还没有喝水记录,没有可撤销的')
      return
    }
    try {
      const r = await window.api.undoLast()
      state.todayMl = r.todayMl
      updateHint()
      resumeFrame()
      if (state.todayMl < state.goalMl) {
        panelEl.classList.remove('reached')
        lastReached = false
      }
    } catch {
      showToast('撤销失败,请重试')
    }
  }
  addBtn.addEventListener('click', () => void addCup())
  undoBtn.addEventListener('click', () => void undoCup())

  // 快捷喝水量(从设置的「常用水量」动态渲染) + 自定义精确填
  const amtCustomBox = q<HTMLDivElement>('#amtCustomBox')
  const amtCustomInput = q<HTMLInputElement>('#amtCustomInput')
  const quickAmts = q<HTMLDivElement>('#quickAmts')
  function renderAmts(): void {
    quickAmts.innerHTML =
      state.amounts
        .map((ml) => `<button class="amt" data-ml="${ml}">${ml}<small>ml</small></button>`)
        .join('') + `<button class="amt" id="amtCustom">自定义</button>`
    quickAmts.querySelectorAll<HTMLButtonElement>('.amt').forEach((b) => {
      const ml = b.getAttribute('data-ml')
      if (ml)
        b.addEventListener('click', () => {
          amtCustomBox.classList.add('hidden') // 点预设量时顺手收起自定义输入框,不留着占地方
          void addCup(Number(ml))
        })
    })
    q<HTMLButtonElement>('#amtCustom').addEventListener('click', () => {
      amtCustomBox.classList.toggle('hidden')
      if (!amtCustomBox.classList.contains('hidden')) amtCustomInput.focus()
    })
  }
  renderAmts()
  function applyCustomAmt(): void {
    const v = Number(amtCustomInput.value)
    if (Number.isFinite(v) && v > 0) {
      const raw = Math.round(v)
      const ml = Math.min(Math.max(raw, 1), 2000)
      void addCup(ml)
      if (ml !== raw) showToast(`单次最多 2000ml,已记 ${ml}`)
      amtCustomInput.value = ''
      amtCustomBox.classList.add('hidden')
    }
  }
  q<HTMLButtonElement>('#amtCustomApply').addEventListener('click', applyCustomAmt)
  amtCustomInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') applyCustomAmt()
  })

  async function refresh(): Promise<void> {
    const st = await window.api.getState()
    state.goalMl = st.settings.dailyGoalMl
    state.cupMl = st.settings.cupMl
    state.amounts = st.settings.amounts
    state.todayMl = st.todayMl
    goalEl.textContent = String(state.goalMl)
    cupAmountEl.textContent = `${state.cupMl}ml`
    renderAmts()
    state.intervalMin = st.settings.intervalMin
    state.paused = st.settings.paused
    updateRemind()
    updatePause()
    updateHint()
    lastReached = state.todayMl >= state.goalMl
    panelEl.classList.toggle('reached', lastReached)
    if (prefersReduced) {
      level = targetLevel()
      displayedMl = state.todayMl
    }
    resumeFrame() // 他处改数据广播来刷新时,若帧循环停着且面板可见,救回来让水球跟上
  }
  void refresh()

  // 浮卡/托盘改了数据时,主进程会广播,这里同步刷新水球
  window.api.onStateChanged(() => void refresh())

  return { refresh, setViewActive }
}
