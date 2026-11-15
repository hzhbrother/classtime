const PIECE_BYTES = 2 * 1024 * 1024

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 15000)
}

/**
 * 小附件交给浏览器直接下载；大附件按 Range 分片拉取后合并，
 * 避免 Vercel 函数 4.5 MB 响应体上限导致下载被截断。
 */
export async function downloadAttachment(file) {
  const size = Number(file?.size) || 0
  if (!file?.id) return
  if (size <= PIECE_BYTES) {
    const link = document.createElement('a')
    link.href = `/api/attachments/${file.id}/download`
    link.download = file.filename || 'attachment'
    document.body.appendChild(link)
    link.click()
    link.remove()
    return
  }
  const parts = []
  for (let start = 0; start < size; start += PIECE_BYTES) {
    const end = Math.min(start + PIECE_BYTES - 1, size - 1)
    const res = await fetch(`/api/attachments/${file.id}/download`, {
      headers: { Range: `bytes=${start}-${end}` },
      credentials: 'same-origin'
    })
    if (!res.ok) throw new Error('附件下载失败，请稍后重试')
    parts.push(await res.arrayBuffer())
  }
  saveBlob(new Blob(parts, { type: file.mime || 'application/octet-stream' }), file.filename || 'attachment')
}
