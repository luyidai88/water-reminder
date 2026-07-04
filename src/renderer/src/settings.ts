import type { Settings } from './api'
import { confirmDialog, alertDialog } from './ui-dialog'

function readNum(root: HTMLElement, sel: string, min: number, max: number, fallback: number): number {
  const el = root.querySelector<HTMLInputElement>(sel)
  const v = Number(el?.value)
  if (!Number.isFinite(v)) return fallback
  return Math.min(Math.max(Math.round(v), min), max)
}

export async function renderSettings(
  root: HTMLElement,
  onBack: () => void,
  onSaved: () => void
): Promise<void> {
  const s: Settings = await window.api.getSettings()

  root.innerHTML = `
    <div class="panel sub-panel">
      <header class="sub-head">
        <button class="back-btn" id="setBack" title="返回">‹</button>
        <span class="sub-title">设置</span>
        <span class="set-saved" id="setSaved">已自动保存</span>
      </header>
      <div class="form">
        <div class="set-section">饮水目标</div>
        <div class="set-group">
        <label>每日目标(ml)
          <input type="number" id="goal" value="${s.dailyGoalMl}" step="100" min="500" max="6000" />
          <div class="goal-chips" id="goalChips">
            <button class="chip" data-g="1500">1500</button>
            <button class="chip" data-g="2000">2000</button>
            <button class="chip" data-g="2500">2500</button>
            <button class="chip" data-g="3000">3000</button>
          </div>
          <button type="button" class="link-btn" id="goalEstToggle">不确定喝多少?按体重估算</button>
          <div class="goal-est hidden" id="goalEst">
            <div class="sex-row">
              <button type="button" class="chip sex-chip active" data-sex="male">男</button>
              <button type="button" class="chip sex-chip" data-sex="female">女</button>
            </div>
            <div class="est-input-row">
              <input type="number" id="weightKg" min="20" max="200" step="1" placeholder="体重 kg" />
              <button type="button" class="chip chip-apply" id="estApply">估算</button>
            </div>
            <div class="field-hint">按 男 35 / 女 31 ml/kg 粗略估算,只是起点,可再手动调</div>
          </div>
        </label>
        <label>单杯容量(ml,「加一杯」用)
          <input type="number" id="cup" value="${s.cupMl}" step="50" min="50" max="1000" />
        </label>
        <label>常用水量(ml,主页快捷按钮)
          <div class="amts-row">
            <input type="number" id="a0" value="${s.amounts[0]}" min="10" max="2000" step="10" />
            <input type="number" id="a1" value="${s.amounts[1]}" min="10" max="2000" step="10" />
            <input type="number" id="a2" value="${s.amounts[2]}" min="10" max="2000" step="10" />
            <input type="number" id="a3" value="${s.amounts[3]}" min="10" max="2000" step="10" />
          </div>
        </label>
        </div>
        <div class="set-section">提醒规则</div>
        <div class="set-group">
        <label>
          <span class="field-row">
            <span>提醒时段(其余时间不打扰)</span>
            <button class="chip ${s.remindAllDay ? 'active' : ''}" id="remindAllDay">全天提醒</button>
          </span>
          <div class="time-pair">
            <div class="time-line">
              <span class="tl-label">开始</span>
              <input type="time" id="remindStart" value="${s.remindStart}" ${s.remindAllDay ? 'disabled' : ''} />
            </div>
            <div class="time-line">
              <span class="tl-label">结束</span>
              <input type="time" id="remindEnd" value="${s.remindEnd}" ${s.remindAllDay ? 'disabled' : ''} />
            </div>
          </div>
          <div class="field-hint" id="windowHint"></div>
          <div class="field-warn" id="windowWarn"></div>
        </label>
        <label class="switch-row">午休不提醒
          <span class="switch">
            <input type="checkbox" id="breakEnabled" ${s.breakEnabled ? 'checked' : ''} />
            <span class="slider"></span>
          </span>
        </label>
        <div class="field-hint">在提醒时段里再留一段安静时间,比如午睡时不打扰(这段要落在提醒时段内才生效)</div>
        <div class="time-pair" id="breakTimes" ${s.breakEnabled ? '' : 'style="display:none"'}>
          <div class="time-line">
            <span class="tl-label">开始</span>
            <input type="time" id="breakStart" value="${s.breakStart}" />
          </div>
          <div class="time-line">
            <span class="tl-label">结束</span>
            <input type="time" id="breakEnd" value="${s.breakEnd}" />
          </div>
        </div>
        <label class="switch-row">声音提醒（默认静音）
          <span class="switch">
            <input type="checkbox" id="sound" ${s.sound ? 'checked' : ''} />
            <span class="slider"></span>
          </span>
        </label>
        <label class="switch-row">达标后停止提醒
          <span class="switch">
            <input type="checkbox" id="stopReached" ${s.stopWhenReached ? 'checked' : ''} />
            <span class="slider"></span>
          </span>
        </label>
        <div class="field-hint">喝够当天目标后不再弹提醒卡,倒计时窗显示「今日喝够」;关掉则达标后仍按间隔提醒</div>
        <label class="switch-row">系统通知（锁屏也能看到）
          <span class="switch">
            <input type="checkbox" id="sysNotify" ${s.systemNotify ? 'checked' : ''} />
            <span class="slider"></span>
          </span>
        </label>
        <div class="field-hint">锁屏和通知中心也能看到提醒。部分电脑上可能不生效(尤其自用未签名版本),这时以桌面上的提醒卡为准就行。</div>
        </div>
        <div class="set-section">外观与启动</div>
        <div class="set-group">
        <label>外观
          <div class="seg" id="themeSeg">
            <button class="seg-btn" data-theme="system">跟随系统</button>
            <button class="seg-btn" data-theme="light">浅色</button>
            <button class="seg-btn" data-theme="dark">深色</button>
          </div>
        </label>
        <label class="switch-row">开机自启
          <span class="switch">
            <input type="checkbox" id="launch" ${s.launchAtLogin ? 'checked' : ''} />
            <span class="slider"></span>
          </span>
        </label>
        <div class="field-hint" id="launchHint"></div>
        </div>
        <div class="set-section">数据与其他</div>
        <button class="quit-btn help-btn" id="showGuide">使用引导</button>
        <div class="data-row">
          <button class="quit-btn data-btn" id="exportData">导出数据备份</button>
          <button class="quit-btn data-btn" id="importData">导入数据</button>
        </div>
        <button class="quit-btn" id="resetCapsule">倒计时窗回到右下角</button>
        <button class="quit-btn danger" id="resetSettings">恢复默认设置</button>
        <button class="quit-btn danger" id="quitApp">退出 Water Reminder</button>
      </div>
    </div>
  `

  const q = <T extends Element>(sel: string): T => root.querySelector<T>(sel)!
  const savedEl = q<HTMLSpanElement>('#setSaved')
  let savedTimer = 0
  // msg 用于超范围被截断等场景的即时反馈;默认就是「已自动保存」
  async function save(partial: Partial<Settings>, msg?: string): Promise<void> {
    await window.api.setSettings(partial)
    onSaved()
    savedEl.textContent = msg || '已自动保存'
    savedEl.classList.add('show')
    window.clearTimeout(savedTimer)
    savedTimer = window.setTimeout(() => {
      savedEl.classList.remove('show')
      savedEl.textContent = '已自动保存'
    }, 1800)
  }
  // 数字输入超出范围时:把框里的值回写成实际生效值,并返回是否被截断,供提示用
  function commitNum(sel: string, min: number, max: number, fallback: number): { v: number; clamped: boolean } {
    const el = q<HTMLInputElement>(sel)
    const raw = Math.round(Number(el.value))
    const v = readNum(root, sel, min, max, fallback)
    el.value = String(v)
    return { v, clamped: Number.isFinite(raw) && raw !== v }
  }

  // 顶栏磨砂与主页一致:停顶部透明,下滑才淡入
  const setPanel = q<HTMLDivElement>('.panel')
  const setHead = q<HTMLElement>('.sub-head')
  setPanel.addEventListener('scroll', () => {
    setHead.classList.toggle('scrolled', setPanel.scrollTop > 2)
  })

  q<HTMLButtonElement>('#setBack').addEventListener('click', onBack)

  // 外观三选:跟随系统/浅色/深色。手动选深浅会即时切,压过系统外观
  const themeSeg = q<HTMLDivElement>('#themeSeg')
  themeSeg.querySelectorAll<HTMLButtonElement>('.seg-btn').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-theme') === s.theme)
    b.addEventListener('click', () => {
      const t = (b.getAttribute('data-theme') as 'system' | 'light' | 'dark') || 'system'
      themeSeg
        .querySelectorAll<HTMLButtonElement>('.seg-btn')
        .forEach((x) => x.classList.toggle('active', x === b))
      void save({ theme: t })
    })
  })

  // 改完即存,不需要保存按钮
  const goalInput = q<HTMLInputElement>('#goal')
  goalInput.addEventListener('change', () => {
    const { v, clamped } = commitNum('#goal', 500, 6000, s.dailyGoalMl)
    void save({ dailyGoalMl: v }, clamped ? `目标 500~6000ml,已设为 ${v}` : undefined)
  })
  q<HTMLDivElement>('#goalChips')
    .querySelectorAll<HTMLButtonElement>('.chip')
    .forEach((b) => {
      b.addEventListener('click', () => {
        const g = Number(b.getAttribute('data-g'))
        goalInput.value = String(g)
        void save({ dailyGoalMl: g })
      })
    })

  // 按体重估算目标:男约 35 / 女约 31 ml/kg 的常用经验值,取整到 50ml,给不知道喝多少的人一个起点
  const goalEst = q<HTMLDivElement>('#goalEst')
  const weightKg = q<HTMLInputElement>('#weightKg')
  const sexChips = goalEst.querySelectorAll<HTMLButtonElement>('.sex-chip')
  let sex: 'male' | 'female' = 'male'
  sexChips.forEach((c) => {
    c.addEventListener('click', () => {
      sex = c.getAttribute('data-sex') === 'female' ? 'female' : 'male'
      sexChips.forEach((x) => x.classList.toggle('active', x === c))
    })
  })
  q<HTMLButtonElement>('#goalEstToggle').addEventListener('click', () => {
    goalEst.classList.toggle('hidden')
    if (!goalEst.classList.contains('hidden')) weightKg.focus()
  })
  function estimateGoal(): void {
    const kg = Math.round(Number(weightKg.value))
    if (!Number.isFinite(kg) || kg <= 0) return
    const clampedKg = Math.min(Math.max(kg, 20), 200)
    const perKg = sex === 'female' ? 31 : 35
    const g = Math.min(Math.max(Math.round((clampedKg * perKg) / 50) * 50, 500), 6000)
    goalInput.value = String(g)
    goalEst.classList.add('hidden')
    weightKg.value = ''
    void save({ dailyGoalMl: g }, `按 ${sex === 'female' ? '女' : '男'} ${clampedKg}kg 估算,目标 ${g}ml`)
  }
  q<HTMLButtonElement>('#estApply').addEventListener('click', estimateGoal)
  weightKg.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') estimateGoal()
  })

  q<HTMLInputElement>('#cup').addEventListener('change', () => {
    const { v, clamped } = commitNum('#cup', 50, 1000, s.cupMl)
    void save({ cupMl: v }, clamped ? `单杯 50~1000ml,已设为 ${v}` : undefined)
  })

  ;['#a0', '#a1', '#a2', '#a3'].forEach((sel) => {
    q<HTMLInputElement>(sel).addEventListener('change', () => {
      const results = ['#a0', '#a1', '#a2', '#a3'].map((s2, j) =>
        commitNum(s2, 10, 2000, s.amounts[j])
      )
      const amounts = results.map((r) => r.v)
      const clamped = results.some((r) => r.clamped)
      void save({ amounts }, clamped ? '常用水量 10~2000ml,已调整到有效范围' : undefined)
    })
  })

  q<HTMLInputElement>('#sound').addEventListener('change', () => {
    void save({ sound: q<HTMLInputElement>('#sound').checked })
  })

  q<HTMLInputElement>('#stopReached').addEventListener('change', () => {
    void save({ stopWhenReached: q<HTMLInputElement>('#stopReached').checked })
  })

  q<HTMLInputElement>('#sysNotify').addEventListener('change', () => {
    void save({ systemNotify: q<HTMLInputElement>('#sysNotify').checked })
  })

  const allDayBtn = q<HTMLButtonElement>('#remindAllDay')
  const startEl = q<HTMLInputElement>('#remindStart')
  const endEl = q<HTMLInputElement>('#remindEnd')
  const windowHint = q<HTMLDivElement>('#windowHint')
  const windowWarn = q<HTMLDivElement>('#windowWarn')
  let allDay = s.remindAllDay
  // 把当前时段翻译成人话,讲清「相同=全天」「跨夜」这些静默行为,不让用户猜
  function toMinLocal(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number)
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)
  }
  // 午休信息拆两路:普通说明(生效的午休段)走 field-hint;告警(设了却不生效/有意外后果)走 field-warn 警示色
  function breakInfo(): { text: string; warn: boolean } {
    const be = q<HTMLInputElement>('#breakEnabled')
    if (!be.checked) return { text: '', warn: false }
    const bs = q<HTMLInputElement>('#breakStart').value
    const bn = q<HTMLInputElement>('#breakEnd').value
    if (!bs || !bn) return { text: '', warn: false }
    if (bs === bn) return { text: '午休起止相同,当前未生效', warn: true }
    const bsm = toMinLocal(bs)
    const bem = toMinLocal(bn)
    if (bem < bsm) return { text: '午休结束早于开始,会一直静音到次日,确认是否要这样', warn: true }
    // 午休必须落在提醒时段内才生效(时段外本就休息);非全天时检查有没有交集
    if (!allDay) {
      const ms = toMinLocal(startEl.value)
      const me = toMinLocal(endEl.value)
      const inMain = (t: number): boolean =>
        ms === me ? true : ms < me ? t >= ms && t < me : t >= ms || t < me
      let overlap = false
      for (let t = bsm; t < bem; t += 5) {
        if (inMain(t)) {
          overlap = true
          break
        }
      }
      if (!overlap) return { text: '午休不在提醒时段内,当前不生效', warn: true }
    }
    return { text: `其中 ${bs} ~ ${bn} 午休不提醒`, warn: false }
  }
  function windowText(): string {
    if (allDay) return '全天提醒:任何时间都按间隔提醒'
    const st = startEl.value
    const en = endEl.value
    if (!st || !en) return ''
    if (st === en) return `开始和结束相同(${st}),等于全天提醒`
    const [sh, sm] = st.split(':').map(Number)
    const [eh, em] = en.split(':').map(Number)
    const a = sh * 60 + sm
    const b = eh * 60 + em
    if (a < b) return `每天 ${st} ~ ${en} 提醒,其余时间安静`
    return `跨夜:${st} 到次日 ${en} 提醒(适合夜班/熬夜)`
  }
  function updateWindowHint(): void {
    const main = windowText()
    const bi = breakInfo()
    // 普通说明:主时段 + 正常生效的午休段;告警单独一行走警示色,不和普通说明混
    windowHint.textContent = main + (bi.text && !bi.warn ? `;${bi.text}` : '')
    windowWarn.textContent = bi.warn ? bi.text : ''
  }
  // 全天=无视起止时间(像勿扰模式不删闹钟):开了禁用时间框但原值保留,关了原封不动恢复
  function syncAllDay(): void {
    allDayBtn.classList.toggle('active', allDay)
    startEl.disabled = allDay
    endEl.disabled = allDay
    updateWindowHint()
  }
  syncAllDay()
  startEl.addEventListener('change', () => {
    void save({ remindStart: startEl.value || s.remindStart })
    updateWindowHint()
  })
  endEl.addEventListener('change', () => {
    void save({ remindEnd: endEl.value || s.remindEnd })
    updateWindowHint()
  })
  allDayBtn.addEventListener('click', () => {
    allDay = !allDay
    syncAllDay()
    void save({ remindAllDay: allDay })
  })
  // 午休不提醒:开关切换时显隐时间行,时间改了即存,并让上方时段说明同步反映午休段
  const breakEnabled = q<HTMLInputElement>('#breakEnabled')
  const breakTimes = q<HTMLDivElement>('#breakTimes')
  const breakStart = q<HTMLInputElement>('#breakStart')
  const breakEnd = q<HTMLInputElement>('#breakEnd')
  breakEnabled.addEventListener('change', () => {
    breakTimes.style.display = breakEnabled.checked ? '' : 'none'
    void save({ breakEnabled: breakEnabled.checked })
    updateWindowHint()
  })
  breakStart.addEventListener('change', () => {
    void save({ breakStart: breakStart.value || s.breakStart })
    updateWindowHint()
  })
  breakEnd.addEventListener('change', () => {
    void save({ breakEnd: breakEnd.value || s.breakEnd })
    updateWindowHint()
  })

  // 开机自启的说明如实反映开关当前状态(不写死「默认已开启」,避免和老用户/关过的实际状态打架)
  const launchEl = q<HTMLInputElement>('#launch')
  const launchHint = q<HTMLDivElement>('#launchHint')
  function updateLaunchHint(): void {
    launchHint.textContent = launchEl.checked
      ? '已开启:重启电脑后自动运行、继续提醒;不需要可在这里关掉'
      : '已关闭:重启电脑后不会自动运行;想让它重启后也一直提醒,打开这个开关'
  }
  updateLaunchHint()
  launchEl.addEventListener('change', () => {
    void save({ launchAtLogin: launchEl.checked })
    updateLaunchHint()
  })

  q<HTMLButtonElement>('#resetSettings').addEventListener('click', () => {
    void (async (): Promise<void> => {
      const ok = await confirmDialog({
        title: '恢复默认设置',
        message:
          '目标、单杯、常用水量、提醒时段、午休、声音、达标后停止提醒、系统通知会回到默认;开机自启和饮水记录保持不变。',
        confirmText: '恢复默认',
        danger: true
      })
      if (!ok) return
      await window.api.resetSettings()
      onSaved()
      await renderSettings(root, onBack, onSaved)
    })()
  })
  q<HTMLButtonElement>('#exportData').addEventListener('click', () => {
    void (async (): Promise<void> => {
      const r = await window.api.exportData()
      if (r.ok) await alertDialog(`已导出到:\n${r.path}`, '导出成功')
      else if (r.error) await alertDialog(`导出失败:${r.error}`)
    })()
  })
  q<HTMLButtonElement>('#importData').addEventListener('click', () => {
    void (async (): Promise<void> => {
      const ok = await confirmDialog({
        title: '导入数据',
        message:
          '相同日期的饮水记录会被备份覆盖(其余日期保留);目标、提醒时段等各项设置也会一并恢复成备份里的。',
        confirmText: '选择文件导入'
      })
      if (!ok) return
      const r = await window.api.importData()
      if (r.ok) {
        await alertDialog(`共 ${r.days} 天记录已合并。`, '导入成功')
        onSaved()
        await renderSettings(root, onBack, onSaved)
      } else if (r.error) {
        await alertDialog(`导入失败:${r.error}`)
      }
    })()
  })
  q<HTMLButtonElement>('#resetCapsule').addEventListener('click', () => {
    void window.api.resetCapsulePos()
  })
  q<HTMLButtonElement>('#showGuide').addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('show-guide'))
  })
  // 退出加确认:和「恢复默认」同级别防误触,手滑点到不会直接把常驻提醒关掉
  q<HTMLButtonElement>('#quitApp').addEventListener('click', () => {
    void (async (): Promise<void> => {
      const ok = await confirmDialog({
        title: '退出 Water Reminder',
        message: '退出后就不再提醒喝水了(数据都在,下次打开还在)。确定退出?',
        confirmText: '退出',
        danger: true
      })
      if (ok) void window.api.quitApp()
    })()
  })
}
