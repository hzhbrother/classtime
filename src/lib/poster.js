import { formatDateCN, subjectColor, subjectInitial, weekdayCN } from './format'

const WIDTH = 750
const SCALE = 2
const PAGE_PADDING = 40
const CARD_WIDTH = WIDTH - PAGE_PADDING * 2
const FONT_FAMILY = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif'

function canvasFont(size, weight = 400) {
  return `${weight} ${size}px ${FONT_FAMILY}`
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

function fillRounded(ctx, x, y, width, height, radius, color) {
  roundedRect(ctx, x, y, width, height, radius)
  ctx.fillStyle = color
  ctx.fill()
}

function wrapText(ctx, text, maxWidth) {
  const lines = []
  for (const paragraph of String(text || '').split('\n')) {
    if (!paragraph) {
      lines.push('')
      continue
    }
    let line = ''
    for (const char of Array.from(paragraph)) {
      const candidate = line + char
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line)
        line = char
      } else {
        line = candidate
      }
    }
    lines.push(line)
  }
  return lines.length ? lines : ['']
}

function drawLines(ctx, lines, x, y, lineHeight) {
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight))
}

function measurePill(ctx, text, size = 14) {
  ctx.font = canvasFont(size, 600)
  return ctx.measureText(text).width + 22
}

function drawPill(ctx, text, x, y, background, color) {
  const width = measurePill(ctx, text)
  fillRounded(ctx, x, y, width, 28, 14, background)
  ctx.fillStyle = color
  ctx.font = canvasFont(14, 600)
  ctx.fillText(text, x + 11, y + 19)
  return width
}

function measureItem(ctx, item) {
  const hasMeta = item.priority === 'urgent' || !!item.deadline
  const contentOffset = hasMeta ? 130 : 102
  ctx.font = canvasFont(22, 500)
  const contentLines = wrapText(ctx, item.content, CARD_WIDTH - 56)

  ctx.font = canvasFont(18, 400)
  const noteLines = item.note ? wrapText(ctx, `备注：${item.note}`, CARD_WIDTH - 92) : []
  const noteHeight = noteLines.length ? noteLines.length * 30 + 28 : 0

  ctx.font = canvasFont(16, 400)
  const attachments = (item.attachments || []).map((file, index) => ({
    lines: wrapText(ctx, `附件 ${index + 1} · ${file.filename}`, CARD_WIDTH - 92)
  }))
  const attachmentLineCount = attachments.reduce((sum, file) => sum + file.lines.length, 0)
  const attachmentHeight = attachments.length
    ? attachmentLineCount * 25 + (attachments.length - 1) * 8 + 28
    : 0

  let cursor = contentOffset + (contentLines.length - 1) * 36 + 12
  const noteOffset = noteLines.length ? cursor + 14 : null
  if (noteOffset !== null) cursor = noteOffset + noteHeight
  const attachmentOffset = attachments.length ? cursor + 14 : null
  if (attachmentOffset !== null) cursor = attachmentOffset + attachmentHeight

  return {
    contentLines,
    contentOffset,
    noteLines,
    noteHeight,
    noteOffset,
    attachments,
    attachmentHeight,
    attachmentOffset,
    height: cursor + 26
  }
}

function drawHeader(ctx, board, settings) {
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, 280)
  gradient.addColorStop(0, '#172554')
  gradient.addColorStop(0.55, '#25347c')
  gradient.addColorStop(1, '#4338ca')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, WIDTH, 280)

  ctx.fillStyle = 'rgba(255,255,255,0.055)'
  ctx.beginPath()
  ctx.arc(690, 18, 150, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(610, 250, 105, 0, Math.PI * 2)
  ctx.fill()

  fillRounded(ctx, 40, 32, 36, 36, 11, 'rgba(255,255,255,0.16)')
  ctx.fillStyle = '#ffffff'
  ctx.font = canvasFont(18, 700)
  ctx.textAlign = 'center'
  ctx.fillText('作', 58, 57)
  ctx.textAlign = 'left'
  ctx.font = canvasFont(16, 600)
  ctx.fillText(settings.siteName || '班级作业云', 88, 57)
  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = canvasFont(12, 600)
  ctx.fillText('DAILY HOMEWORK', 710, 55)
  ctx.textAlign = 'left'

  ctx.fillStyle = 'rgba(255,255,255,0.72)'
  ctx.font = canvasFont(20, 500)
  ctx.fillText(settings.className || '班级作业', 40, 111)

  const dateLabel = formatDateCN(board.date)
  ctx.fillStyle = '#ffffff'
  ctx.font = canvasFont(44, 750)
  ctx.fillText(dateLabel, 40, 169)
  const dateWidth = ctx.measureText(dateLabel).width
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.font = canvasFont(19, 500)
  ctx.fillText(weekdayCN(board.date), 56 + dateWidth, 166)

  ctx.fillStyle = '#ffffff'
  ctx.font = canvasFont(26, 700)
  ctx.fillText('今日作业清单', 40, 218)
  ctx.fillStyle = 'rgba(255,255,255,0.64)'
  ctx.font = canvasFont(15, 400)
  ctx.fillText(`共 ${board.items.length} 项作业 · 请合理安排时间，按时完成`, 40, 251)
}

function drawItem(ctx, item, layout, y, index) {
  const x = PAGE_PADDING
  const color = subjectColor(item.subject)
  ctx.save()
  ctx.shadowColor = 'rgba(30, 41, 59, 0.08)'
  ctx.shadowBlur = 20
  ctx.shadowOffsetY = 7
  fillRounded(ctx, x, y, CARD_WIDTH, layout.height, 20, '#ffffff')
  ctx.restore()

  ctx.save()
  roundedRect(ctx, x, y, CARD_WIDTH, layout.height, 20)
  ctx.clip()
  ctx.fillStyle = color
  ctx.fillRect(x, y, 6, layout.height)
  ctx.restore()

  fillRounded(ctx, x + 28, y + 27, 48, 48, 15, `${color}18`)
  ctx.fillStyle = color
  ctx.font = canvasFont(23, 700)
  ctx.textAlign = 'center'
  ctx.fillText(subjectInitial(item.subject), x + 52, y + 59)
  ctx.textAlign = 'left'

  ctx.fillStyle = '#172033'
  ctx.font = canvasFont(27, 700)
  ctx.fillText(item.subject, x + 92, y + 60)
  ctx.textAlign = 'right'
  ctx.fillStyle = '#e2e8f0'
  ctx.font = canvasFont(26, 750)
  ctx.fillText(String(index + 1).padStart(2, '0'), x + CARD_WIDTH - 26, y + 59)
  ctx.textAlign = 'left'

  if (layout.contentOffset === 130) {
    let pillX = x + 92
    if (item.priority === 'urgent') {
      pillX += drawPill(ctx, '加急', pillX, y + 78, '#fef2f2', '#dc2626') + 8
    }
    if (item.deadline) drawPill(ctx, `${item.deadline}前完成`, pillX, y + 78, '#eef2ff', '#4f46e5')
  }

  ctx.fillStyle = '#263247'
  ctx.font = canvasFont(22, 500)
  drawLines(ctx, layout.contentLines, x + 28, y + layout.contentOffset, 36)

  if (layout.noteOffset !== null) {
    fillRounded(ctx, x + 28, y + layout.noteOffset, CARD_WIDTH - 56, layout.noteHeight, 12, '#f8fafc')
    ctx.fillStyle = '#94a3b8'
    ctx.fillRect(x + 28, y + layout.noteOffset + 12, 3, layout.noteHeight - 24)
    ctx.fillStyle = '#64748b'
    ctx.font = canvasFont(18, 400)
    drawLines(ctx, layout.noteLines, x + 46, y + layout.noteOffset + 34, 30)
  }

  if (layout.attachmentOffset !== null) {
    fillRounded(ctx, x + 28, y + layout.attachmentOffset, CARD_WIDTH - 56, layout.attachmentHeight, 12, '#f0f5ff')
    ctx.font = canvasFont(16, 400)
    ctx.fillStyle = '#64748b'
    let lineY = y + layout.attachmentOffset + 32
    for (const file of layout.attachments) {
      drawLines(ctx, file.lines, x + 46, lineY, 25)
      lineY += file.lines.length * 25 + 8
    }
  }
}

/**
 * 将已发布作业板生成一张高清竖版 PNG 海报。
 * @returns {Promise<Blob>}
 */
export async function createHomeworkPoster(board, settings = {}) {
  if (typeof document !== 'undefined' && document.fonts?.ready) await document.fonts.ready

  const measureCanvas = document.createElement('canvas')
  const measureCtx = measureCanvas.getContext('2d')
  const items = Array.isArray(board.items) ? board.items : []
  const layouts = items.map((item) => measureItem(measureCtx, item))

  measureCtx.font = canvasFont(14, 400)
  const footerLines = wrapText(
    measureCtx,
    settings.displayMotto || '认真完成作业，及时整理复习。',
    WIDTH - PAGE_PADDING * 2
  ).slice(0, 2)
  const footerHeight = 70 + footerLines.length * 22
  const cardsHeight = layouts.reduce((sum, layout) => sum + layout.height, 0)
  const height = Math.ceil(300 + cardsHeight + Math.max(0, layouts.length - 1) * 18 + footerHeight)

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH * SCALE
  canvas.height = height * SCALE
  const ctx = canvas.getContext('2d')
  ctx.scale(SCALE, SCALE)
  ctx.textBaseline = 'alphabetic'

  ctx.fillStyle = '#f2f5fa'
  ctx.fillRect(0, 0, WIDTH, height)
  drawHeader(ctx, board, settings)

  let y = 300
  items.forEach((item, index) => {
    const layout = layouts[index]
    drawItem(ctx, item, layout, y, index)
    y += layout.height + 18
  })

  const footerY = 300 + cardsHeight + Math.max(0, layouts.length - 1) * 18 + 22
  ctx.strokeStyle = '#dce2ec'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(PAGE_PADDING, footerY)
  ctx.lineTo(WIDTH - PAGE_PADDING, footerY)
  ctx.stroke()
  ctx.fillStyle = '#64748b'
  ctx.font = canvasFont(14, 600)
  ctx.fillText(settings.siteName || '班级作业云', PAGE_PADDING, footerY + 31)
  ctx.textAlign = 'right'
  ctx.fillStyle = '#94a3b8'
  ctx.font = canvasFont(13, 400)
  ctx.fillText(board.date, WIDTH - PAGE_PADDING, footerY + 31)
  ctx.textAlign = 'left'
  ctx.fillStyle = '#94a3b8'
  ctx.font = canvasFont(14, 400)
  drawLines(ctx, footerLines, PAGE_PADDING, footerY + 59, 22)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('图片生成失败，请重试'))
    }, 'image/png')
  })
}
