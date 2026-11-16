const PIECE_BYTES = 2.5 * 1024 * 1024
const DOWNLOAD_CONCURRENCY = 3

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

function directDownload(file) {
  const link = document.createElement('a')
  link.href = `/api/attachments/${file.id}/download`
  link.download = file.filename || 'attachment'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * 下载附件。小文件（≤ 2.5 MB）交给浏览器原生；大文件分片 Range 拉取后合并。
 * onProgress({ loaded, total, piecesDone, piecesTotal }) 会持续回调，
 * 让 UI 可以实时展示进度条。
 */
export async function downloadAttachment(file, onProgress) {
  const size = Number(file?.size) || 0
  if (!file?.id) return
  if (size <= PIECE_BYTES) {
    directDownload(file)
    if (onProgress) onProgress({ loaded: size, total: size, piecesDone: 1, piecesTotal: 1, filename: file.filename })
    return
  }
  const count = Math.ceil(size / PIECE_BYTES)
  const parts = new Array(count)
  let loadedPieces = 0
  let error = null
  let cursor = 0

  if (onProgress) {
    onProgress({ loaded: 0, total: size, piecesDone: 0, piecesTotal: count, filename: file.filename })
  }

  async function worker() {
    while (!error && cursor < count) {
      const index = cursor
      cursor += 1
      const start = index * PIECE_BYTES
      const end = Math.min(start + PIECE_BYTES - 1, size - 1)
      try {
        const res = await fetch(`/api/attachments/${file.id}/download`, {
          headers: { Range: `bytes=${start}-${end}` },
          credentials: 'same-origin'
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        parts[index] = await res.arrayBuffer()
        loadedPieces += 1
        if (onProgress) {
          const loaded = Math.min(loadedPieces * PIECE_BYTES, size)
          onProgress({ loaded, total: size, piecesDone: loadedPieces, piecesTotal: count, filename: file.filename })
        }
      } catch (err) {
        error = err
        throw err
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, count) }, worker))
    if (!error) saveBlob(new Blob(parts, { type: file.mime || 'application/octet-stream' }), file.filename || 'attachment')
  } catch {
    /* worker 会在出错时中断其他 worker，这里抛出统一错误 */
    throw error || new Error('附件下载失败')
  }
}

export { formatSize }
