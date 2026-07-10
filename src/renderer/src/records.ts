import type { Stats } from './api'
import { confirmDialog, undoToast } from './ui-dialog'

// 合并页:上半「明细」(今天可删、过去只读),下半「近7/30天趋势」,点柱子看当天每一条
function fmtTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function pad(n: number): string {
  return String(n).padStart(2, '0')
}
function todayKeyStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function dayLabel(key: string): string {
  const [y, m, dd] = key.split('-').map(Number)
  const dt = new Date(y, m - 1, dd)
  const wk = ['日', '一', '二', '三', '四', '五', '六'][dt.getDay()]
  return `${m}/${dd} 周${wk}`
}

// 7天/30天/月历选择、当前查看日期、月历所在月都提到模块级:他处喝水/跨午夜整页重渲染时不被重置
let recordsRange: number | 'cal' = 7
let selectedDate: string | null = null // null=今天;否则是某个过去日期的 key
let calMonth = '' // 月历当前所在月 'YYYY-MM',空=当前月(主进程兜底)
// 月份加减,返回 'YYYY-MM'
function shiftMonth(ym: string, delta: number): string {
  const now = new Date()
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y || now.getFullYear(), (m || now.getMonth() + 1) - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export async function renderRecords(
  root: HTMLElement,
  onBack: () => void,
  onChanged: () => void
): Promise<void> {
  let range = recordsRange

  async function draw(): Promise<void> {
    const today = todayKeyStr()
    const viewingToday = !selectedDate || selectedDate === today
    const viewKey = viewingToday ? today : (selectedDate as string)
    const entries = viewingToday
      ? await window.api.getTodayEntries()
      : await window.api.getDayEntries(viewKey)
    const isCal = range === 'cal'
    const month = isCal ? await window.api.getMonth(calMonth) : null
    if (month) calMonth = month.ym // 记住规范的月值,翻页从它算
    const stats: Stats | null = isCal ? null : await window.api.getStats(range as number)
    const dayTotal = entries.reduce((a, b) => a + b.ml, 0)

    // 今天的明细每条可删;过去的明细只读(改历史风险大,只给看)
    const entriesHtml = entries.length
      ? entries
          .map(
            (e) => `
        <span class="log-pill">
          <span class="lp-time">${fmtTime(e.ts)}</span>
          <span class="lp-ml">${e.ml}ml</span>
          ${
            viewingToday
              ? `<button class="lp-del" data-ts="${e.ts}" data-ml="${e.ml}" title="删除">×</button>`
              : ''
          }
        </span>`
          )
          .join('')
      : `<div class="log-empty">${viewingToday ? '今天还没喝水,加一杯吧' : '这天暂无记录'}</div>`

    // 下半卡:7天/30天=柱状趋势;月历=按日期铺开的月历热力(点某天看明细)
    const rangeToggle = `
      <div class="range-toggle">
        <button data-d="7" class="${range === 7 ? 'active' : ''}">7天</button>
        <button data-d="30" class="${range === 30 ? 'active' : ''}">30天</button>
        <button data-d="cal" class="${isCal ? 'active' : ''}">月历</button>
      </div>`
    let streakLine = ''
    let bottomBody = ''
    let bottomTip = ''
    if (isCal && month) {
      streakLine = `🔥 本月达标 <b>${month.reachedCount}</b> 天 · 日均 <b>${month.avgMl}</b> ml`
      const cells: string[] = []
      for (let i = 0; i < month.firstWeekday; i++) cells.push('<div class="cal-cell cal-empty"></div>')
      for (const d of month.days) {
        const cls = ['cal-cell']
        if (d.isFuture) cls.push('cal-future')
        else if (d.reached) cls.push('cal-reached')
        else if (d.totalMl > 0) cls.push('cal-partial')
        if (d.isToday) cls.push('cal-today')
        if (d.date === viewKey) cls.push('cal-sel')
        cells.push(
          `<div class="${cls.join(' ')}" ${
            d.isFuture ? '' : `data-date="${d.date}" title="点看当天明细"`
          }>${d.day}</div>`
        )
      }
      // 补齐到 6 行(42 格):不同月份(4/5/6 行)高度统一,切月份不再高度跳动、也不出滚动条
      while (cells.length < 42) cells.push('<div class="cal-cell cal-empty"></div>')
      bottomBody = `
        <div class="cal">
          <div class="cal-head">
            <button class="cal-nav" data-nav="-1" title="上个月">‹</button>
            <button class="cal-title" id="calTitle" title="点这里选年月">${month.label}</button>
            <button class="cal-nav ${month.canNext ? '' : 'cal-nav-off'}" data-nav="1" title="下个月">›</button>
            <button class="cal-today-btn" id="calToday" title="回到本月今天">今天</button>
          </div>
          <div class="cal-week"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div>
          <div class="cal-grid">${cells.join('')}</div>
        </div>`
      bottomTip = '点某天看明细 · 深蓝达标 · 浅蓝没达标 · 圈今天'
    } else if (stats) {
      streakLine = `🔥 近 ${range} 天达标 <b>${stats.reachedDays}</b> 天 · 日均 <b>${stats.avgMl}</b> ml`
      const rawMax = Math.max(...stats.days.map((d) => d.totalMl), stats.goalMl, 1)
      const maxVal = rawMax * 1.12
      const goalPct = Math.round((stats.goalMl / maxVal) * 100)
      const barsHtml = stats.days
        .map((d) => {
          const h = Math.round((d.totalMl / maxVal) * 100)
          const val =
            range === 7 ? `<span class="bar-val">${d.totalMl > 0 ? d.totalMl : ''}</span>` : ''
          const sel = d.date === viewKey ? 'selected' : ''
          return `<div class="bar-col" data-date="${d.date}" title="点看当天明细">
          ${val}
          <div class="bar ${d.reached ? 'reached' : ''} ${sel}" data-h="${h}" style="height:0%"></div>
        </div>`
        })
        .join('')
      const xHtml = stats.days
        .map((d, i) => {
          // 7 天标星期;30 天太密,只稀疏标日期(每 5 天 + 最后一天),不然认不出哪根柱子是哪天
          if (range === 7) return `<span>${d.weekday}</span>`
          const show = i % 5 === 0 || i === stats.days.length - 1
          return `<span>${show ? d.label : ''}</span>`
        })
        .join('')
      bottomBody = `
        <div class="chart">
          <div class="chart-grid">
            <div class="goal-line" style="bottom:${goalPct}%"><span>目标 ${stats.goalMl}ml</span></div>
            ${barsHtml}
          </div>
          <div class="chart-x">${xHtml}</div>
        </div>`
      bottomTip = '点柱子看当天明细;蓝柱＝当天达标,灰柱＝未达标;虚线是目标'
    }

    // 明细卡头部:左侧日期+汇总分层显示,右侧动作(今天=清零,过去=返回今天)
    const dayName = viewingToday ? '今天' : dayLabel(viewKey)
    const actionHtml = viewingToday
      ? `<button class="rec-clear" id="clearToday">清零今天</button>`
      : `<button class="rec-day-back" id="backToday">返回今天</button>`

    root.innerHTML = `
      <div class="panel sub-panel">
        <header class="sub-head">
          <button class="back-btn" id="recBack" title="返回">‹</button>
          <span class="sub-title">记录与统计</span>
        </header>
        <div class="rec-card rec-viz">
          <div class="rec-title rec-trend">
            <span>${isCal ? '月历' : '近期趋势'}</span>
            ${rangeToggle}
          </div>
          <div class="streak">${streakLine}</div>
          ${bottomBody}
          <div class="chart-tip">${bottomTip}</div>
        </div>
        <div class="rec-card rec-detail ${viewingToday ? '' : 'viewing-past'}">
          <div class="rec-title">
            <div class="rec-day-head">
              <span class="rec-day">${dayName}</span>
              <span class="rec-day-sum">${dayTotal}ml · ${entries.length} 次</span>
            </div>
            ${actionHtml}
          </div>
          <div class="rec-log">${entriesHtml}</div>
        </div>
      </div>
    `

    // 顶栏磨砂与主页一致:停顶部透明,下滑才淡入
    const recPanel = root.querySelector<HTMLDivElement>('.panel')!
    const recHead = root.querySelector<HTMLElement>('.sub-head')!
    recPanel.addEventListener('scroll', () => {
      recHead.classList.toggle('scrolled', recPanel.scrollTop > 2)
    })

    root.querySelector<HTMLButtonElement>('#recBack')!.addEventListener('click', onBack)

    if (viewingToday) {
      const clearBtn = root.querySelector<HTMLButtonElement>('#clearToday')!
      // 清零今天是更大的破坏(抹掉今天全部记录),和「删单条」统一走应用内确认弹窗,不再用双击态
      clearBtn.addEventListener('click', () => {
        void (async (): Promise<void> => {
          const ok = await confirmDialog({
            title: '清零今天',
            message: '今天的饮水记录会全部清空,不可恢复。确定清零?',
            confirmText: '清零',
            danger: true
          })
          if (!ok) return
          await window.api.clearToday()
          onChanged()
          await draw()
        })()
      })
      root.querySelectorAll<HTMLButtonElement>('.lp-del').forEach((btn) => {
        btn.addEventListener('click', () => {
          // 删单条是低风险、可挽回(还能重记):按行业主流(iOS 邮件/Gmail)立即删 + 底部「撤销」,
          // 不用弹窗拦。高破坏的「清零今天」才走确认弹窗。
          const ml = Number(btn.getAttribute('data-ml'))
          const ts = Number(btn.getAttribute('data-ts'))
          void (async (): Promise<void> => {
            await window.api.deleteEntry(ts)
            onChanged()
            await draw()
            undoToast(`已删除 ${ml}ml`, () => {
              void (async (): Promise<void> => {
                await window.api.restoreEntry({ ts, ml })
                onChanged()
                await draw()
              })()
            })
          })()
        })
      })
    } else {
      root.querySelector<HTMLButtonElement>('#backToday')!.addEventListener('click', () => {
        selectedDate = null
        // 明细回今天的同时,把日历也跳回当前月并选中今天(否则日历还停在过去的月/日)
        const n = new Date()
        calMonth = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
        void draw()
      })
    }

    root.querySelectorAll<HTMLButtonElement>('.range-toggle button').forEach((b) => {
      b.addEventListener('click', () => {
        range = b.dataset.d === 'cal' ? 'cal' : Number(b.dataset.d)
        recordsRange = range
        void draw()
      })
    })

    // 月历:上/下月翻页(不给翻到未来月)+ 点某天看当天明细
    root.querySelectorAll<HTMLButtonElement>('.cal-nav').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('cal-nav-off')) return
        calMonth = shiftMonth(calMonth, Number(btn.dataset.nav))
        void draw()
      })
    })
    // 点标题(2026年7月任意处)开自定义中文年月选择器;「今天」回到本月今天
    root.querySelector<HTMLButtonElement>('#calTitle')?.addEventListener('click', openMonthPicker)
    root.querySelector<HTMLButtonElement>('#calToday')?.addEventListener('click', () => {
      const n = new Date()
      calMonth = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}` // 明确当前月,不走空串
      selectedDate = null
      void draw()
    })
    root.querySelectorAll<HTMLDivElement>('.cal-cell[data-date]').forEach((cell) => {
      cell.addEventListener('click', () => {
        const date = cell.dataset.date
        if (!date) return
        selectedDate = date === today ? null : date
        void draw()
      })
    })

    // 点柱子:切到当天明细(点今天的柱子=回到今天)
    root.querySelectorAll<HTMLDivElement>('.bar-col').forEach((col) => {
      col.addEventListener('click', () => {
        const date = col.dataset.date
        if (!date) return
        selectedDate = date === today ? null : date
        void draw()
      })
    })

    const barEls = root.querySelectorAll<HTMLDivElement>('.bar')
    requestAnimationFrame(() => {
      barEls.forEach((bar, i) => {
        bar.style.transitionDelay = `${i * (range === 7 ? 35 : 10)}ms`
        bar.style.height = `${bar.dataset.h}%`
      })
    })
  }

  // 自定义中文年月选择器:点日历标题弹出。年份可往回翻(2025、2024…),月份 1-12 中文,未来月禁选
  function openMonthPicker(): void {
    const head = root.querySelector<HTMLElement>('.cal-head')
    if (!head || head.querySelector('.month-picker')) return
    const now = new Date()
    const curY = now.getFullYear()
    const curM = now.getMonth() + 1
    const [cy, cm] = calMonth.split('-').map(Number)
    let pickYear = cy || curY
    const pop = document.createElement('div')
    pop.className = 'month-picker'
    const close = (): void => {
      document.removeEventListener('click', onOutside, true)
      pop.remove()
    }
    const onOutside = (e: MouseEvent): void => {
      const t = e.target as HTMLElement
      if (!pop.contains(t) && t.id !== 'calTitle') close()
    }
    function renderPop(): void {
      const cells = Array.from({ length: 12 }, (_, i) => i + 1)
        .map((mo) => {
          const disabled = pickYear > curY || (pickYear === curY && mo > curM)
          const sel = pickYear === cy && mo === cm
          return `<button class="mp-cell ${sel ? 'mp-sel' : ''}" data-m="${mo}" ${
            disabled ? 'disabled' : ''
          }>${mo}月</button>`
        })
        .join('')
      pop.innerHTML = `
        <div class="mp-year">
          <button class="mp-nav" data-y="-1" title="上一年">‹</button>
          <span class="mp-year-label">${pickYear}年</span>
          <button class="mp-nav ${pickYear >= curY ? 'mp-nav-off' : ''}" data-y="1" title="下一年">›</button>
        </div>
        <div class="mp-grid">${cells}</div>`
      pop.querySelectorAll<HTMLButtonElement>('.mp-nav').forEach((b) =>
        b.addEventListener('click', () => {
          if (b.classList.contains('mp-nav-off')) return
          pickYear += Number(b.dataset.y)
          renderPop()
        })
      )
      pop.querySelectorAll<HTMLButtonElement>('.mp-cell').forEach((b) =>
        b.addEventListener('click', () => {
          calMonth = `${pickYear}-${String(Number(b.dataset.m)).padStart(2, '0')}`
          close()
          void draw()
        })
      )
    }
    renderPop()
    head.appendChild(pop)
    // 延后一帧再挂 outside 监听,避开当前这次点击(否则立刻被判定为外部点击而关闭)
    setTimeout(() => document.addEventListener('click', onOutside, true), 0)
  }

  await draw()
}
