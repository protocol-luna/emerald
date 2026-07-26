import { TimeSchedule } from "../config"

export type SleepBehavior = "sleep" | "slow" | "short" | null

export function evaluateSleep(schedules: TimeSchedule[], timezone: string): SleepBehavior {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
  const currentTime = formatter.format(now)

  for (const schedule of schedules) {
    if (isInWindow(currentTime, schedule.start, schedule.end)) {
      return schedule.behavior ?? null
    }
  }
  return null
}

function isInWindow(current: string, start: string, end: string): boolean {
  if (start <= end) {
    return current >= start && current < end
  }
  return current >= start || current < end
}
