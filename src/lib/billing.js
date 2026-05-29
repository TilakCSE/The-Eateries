export function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

export function pad(n) {
  return String(n).padStart(2, '0')
}

export function getElapsedSeconds(startTime) {
  return Math.floor((Date.now() - new Date(startTime).getTime()) / 1000)
}

// Formats for audit logs: "29 May, 03:15 PM"
export function formatDateTime(isoString) {
  if (!isoString) return ''
  const d = new Date(isoString)
  const date = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  return `${date}, ${time}`
}

// Only used as a suggestion label, never enforced
export function suggestedCharge(table, elapsedSeconds, frameCount, playerCount) {
  if (!table) return null
  const hours = elapsedSeconds / 3600
  const hourly = Math.ceil(hours * table.rate_hourly)
  const byFrame = frameCount > 0 ? frameCount * table.rate_frame : null
  return { hourly, byFrame }
}

export function formatINR(amount) {
  return '₹' + Number(amount).toLocaleString('en-IN')
}