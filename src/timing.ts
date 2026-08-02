export const DAY_DURATION_SECONDS = 120

export const DAYS_IN_YEAR = 360
export const DAYS_IN_MONTH = 30
export const DAYS_IN_WEEK = 7

export function formatGameDate(totalDays: number): string {
  const t = Math.max(0, totalDays - 1)
  const years = Math.floor(t / DAYS_IN_YEAR)
  const months = Math.floor((t % DAYS_IN_YEAR) / DAYS_IN_MONTH)
  const weeks = Math.floor((t % DAYS_IN_MONTH) / DAYS_IN_WEEK)
  const days = (t % DAYS_IN_MONTH) % DAYS_IN_WEEK + 1
  const parts: string[] = []
  if (years) parts.push(`${years} г.`)
  if (months || years) parts.push(`${months} мес.`)
  if (weeks || months || years) parts.push(`${weeks} нед.`)
  parts.push(`${days} дн.`)
  return parts.join(' ')
}