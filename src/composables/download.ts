/**
 * Hands a text file to the browser's download mechanism. The link is attached to the
 * document and the object URL is revoked later, because some browsers (notably Safari and
 * older Firefox) cancel downloads whose URL is revoked synchronously after the click.
 */
export function downloadTextFile(fileName: string, contents: string, type = 'application/json') {
  const blob = new Blob([contents], { type: `${type};charset=utf-8` })
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName
  link.hidden = true
  document.body.append(link)
  try {
    link.click()
  } finally {
    link.remove()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
  }
}
