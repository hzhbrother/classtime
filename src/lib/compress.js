function toFile(blob, name, type) {
  return new File([blob], name, { type, lastModified: Date.now() })
}

function replaceExt(name, ext) {
  return name.replace(/\.[^./\\]+$/, '') + ext
}

async function compressImage(file, maxBytes) {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  let scale = 1
  let quality = 0.85
  let blob = null
  for (let round = 0; round < 9; round += 1) {
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob) break
    if (blob.size <= maxBytes) break
    if (scale > 0.3) scale *= 0.85
    quality = Math.max(0.45, quality - 0.07)
  }
  if (typeof bitmap.close === 'function') bitmap.close()
  if (!blob || blob.size > maxBytes) return null
  return toFile(blob, replaceExt(file.name, '.jpg'), 'image/jpeg')
}

async function compressPdf(file, maxBytes) {
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false })
  const bytes = await doc.save({ useObjectStreams: true, addDefaultPage: false })
  if (bytes.length >= file.size || bytes.length > maxBytes) return null
  return toFile(new Blob([bytes], { type: 'application/pdf' }), file.name, 'application/pdf')
}

async function recompressZip(file, maxBytes) {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const type = file.type || 'application/octet-stream'
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
    mimeType: type
  })
  if (blob.size >= file.size || blob.size > maxBytes) return null
  return toFile(blob, file.name, type)
}

/**
 * 尽力把文件压到 maxBytes 以内；无法有效压缩时返回 null。
 * 图片走 canvas 重编码，PDF 重写对象流，Office/WPS 等 zip 容器重新打包。
 */
export async function shrinkFile(file, maxBytes) {
  if (maxBytes <= 0) return null
  try {
    if (file.type.startsWith('image/')) return await compressImage(file, maxBytes)
    const name = file.name.toLowerCase()
    if (name.endsWith('.pdf') || file.type === 'application/pdf') {
      return await compressPdf(file, maxBytes)
    }
    if (/\.(zip|docx|docm|xlsx|xlsm|pptx|pptm|wps|et|dps)$/.test(name)) {
      return await recompressZip(file, maxBytes)
    }
  } catch {
    return null
  }
  return null
}
