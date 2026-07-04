// 应用内确认/提示弹窗:替代原生 window.confirm / window.alert,和 app 的柔和视觉语言一致、跟随深浅色。
// 文件选择器仍走系统原生(主进程 dialog),这里只管确认与结果提示。

interface ConfirmOpts {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean // 危险操作(退出/恢复默认/删除):确认按钮走红色
}

function mount(): { overlay: HTMLDivElement; card: HTMLDivElement; close: (cb: () => void) => void } {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  const card = document.createElement('div')
  card.className = 'modal-card'
  overlay.appendChild(card)
  document.body.appendChild(overlay)
  void overlay.offsetWidth // 强制回流,保证进场动画从初始态播放
  overlay.classList.add('shown')
  const close = (cb: () => void): void => {
    overlay.classList.remove('shown')
    overlay.classList.add('leaving')
    window.setTimeout(() => {
      overlay.remove()
      cb()
    }, 200)
  }
  return { overlay, card, close }
}

// 二选一确认:返回 true=确认 / false=取消。点遮罩空白或取消都算取消。
export function confirmDialog(opts: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => {
    const { overlay, card, close } = mount()
    card.innerHTML = `
      ${opts.title ? '<div class="modal-title"></div>' : ''}
      <div class="modal-msg"></div>
      <div class="modal-actions">
        <button class="modal-btn modal-cancel"></button>
        <button class="modal-btn modal-confirm${opts.danger ? ' danger' : ''}"></button>
      </div>`
    if (opts.title) card.querySelector<HTMLDivElement>('.modal-title')!.textContent = opts.title
    card.querySelector<HTMLDivElement>('.modal-msg')!.textContent = opts.message
    card.querySelector<HTMLButtonElement>('.modal-cancel')!.textContent = opts.cancelText ?? '取消'
    const confirmBtn = card.querySelector<HTMLButtonElement>('.modal-confirm')!
    confirmBtn.textContent = opts.confirmText ?? '确定'
    const finish = (val: boolean): void => {
      document.removeEventListener('keydown', onKey, true)
      close(() => resolve(val))
    }
    // Enter=确认 / Esc=取消(标准)。焦点在弹窗里,Enter 不会落到背后的按钮(如外观切换)导致误触
    function onKey(e: KeyboardEvent): void {
      // stopPropagation 防御:多层模态叠加时只让最上层这一个响应,Enter/Esc 不被下层监听重复处理
      if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        finish(true)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        finish(false)
      }
    }
    document.addEventListener('keydown', onKey, true)
    card.querySelector('.modal-cancel')!.addEventListener('click', () => finish(false))
    confirmBtn.addEventListener('click', () => finish(true))
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) finish(false)
    })
    confirmBtn.focus()
  })
}

// 撤销 toast(底部弹一条带「撤销」的提示):低风险删除的现代做法 —— 立即删、几秒内可撤,不用弹窗拦。
export function undoToast(message: string, onUndo: () => void, ms = 4500): void {
  document.querySelector('.undo-toast')?.remove() // 同时只留一条
  const el = document.createElement('div')
  el.className = 'undo-toast'
  el.innerHTML = '<span class="ut-msg"></span><button class="ut-undo">撤销</button>'
  el.querySelector<HTMLSpanElement>('.ut-msg')!.textContent = message
  document.body.appendChild(el)
  void el.offsetWidth
  el.classList.add('shown')
  let done = false
  const dismiss = (): void => {
    if (done) return
    done = true
    el.classList.remove('shown')
    window.setTimeout(() => el.remove(), 200)
  }
  const timer = window.setTimeout(dismiss, ms)
  el.querySelector('.ut-undo')!.addEventListener('click', () => {
    window.clearTimeout(timer)
    onUndo()
    dismiss()
  })
}

// 单按钮提示(替代 window.alert):点「知道了」或遮罩关闭。
export function alertDialog(message: string, title?: string): Promise<void> {
  return new Promise((resolve) => {
    const { overlay, card, close } = mount()
    card.innerHTML = `
      ${title ? '<div class="modal-title"></div>' : ''}
      <div class="modal-msg"></div>
      <div class="modal-actions">
        <button class="modal-btn modal-confirm">知道了</button>
      </div>`
    if (title) card.querySelector<HTMLDivElement>('.modal-title')!.textContent = title
    card.querySelector<HTMLDivElement>('.modal-msg')!.textContent = message
    const okBtn = card.querySelector<HTMLButtonElement>('.modal-confirm')!
    const finish = (): void => {
      document.removeEventListener('keydown', onKey, true)
      close(() => resolve())
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        finish()
      }
    }
    document.addEventListener('keydown', onKey, true)
    okBtn.addEventListener('click', finish)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) finish()
    })
    okBtn.focus()
  })
}
