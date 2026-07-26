import { TriggerConfig } from "../config"
import { SleepBehavior } from "./sleep"

export type TriggerReason = "mention" | "dm" | "name" | "keyword" | "follow-up" | "random"

export function computeDelay(
  reason: TriggerReason,
  text: string,
  concentration: Record<string, TriggerConfig>,
  inactivityMs: number,
  inactivityWarmupMinutes: number,
  inactivityWarmupMultiplier: number,
  sleepBehavior: SleepBehavior,
  fatigueMultiplier: number,
): number {
  const cfg = concentration[reason] ?? concentration["name"]
  const base = cfg.delay_min + Math.random() * (cfg.delay_max - cfg.delay_min)

  let delay = base

  const readingFactor = Math.min(text.length / 500, 3)
  delay *= 1 + readingFactor * (0.3 + Math.random() * 0.7)

  const warmupMs = inactivityWarmupMinutes * 60000
  if (inactivityMs > warmupMs) {
    const inactivityRatio = Math.min(inactivityMs / warmupMs, 5)
    delay *= 1 + (inactivityRatio * inactivityWarmupMultiplier - 1) * (0.5 + Math.random() * 0.5)
  }

  if (sleepBehavior === "slow") {
    delay *= 3 + Math.random() * 2
  }

  delay *= fatigueMultiplier

  delay *= 0.5 + Math.random() * 1.5

  return Math.round(delay)
}

export function shouldIgnore(
  reason: TriggerReason,
  concentration: Record<string, TriggerConfig>,
  sleepBehavior: SleepBehavior,
  fatigueIgnoreBonus: number,
): boolean {
  if (reason === "dm" || reason === "mention") return false

  const cfg = concentration[reason] ?? concentration["name"]
  let chance = cfg.ignore_chance

  if (sleepBehavior === "short") {
    chance = Math.min(chance + 0.3, 0.9)
  }

  if (fatigueIgnoreBonus > 0) {
    chance += fatigueIgnoreBonus
  }

  return Math.random() < chance
}

export function shouldReact(
  reason: TriggerReason,
  concentration: Record<string, TriggerConfig>,
  sleepBehavior: SleepBehavior,
): boolean {
  const cfg = concentration[reason] ?? concentration["name"]
  let chance = cfg.reaction_chance

  if (sleepBehavior === "slow" || sleepBehavior === "short") {
    chance = Math.min(chance, 0.02)
  }

  return Math.random() < chance
}

export function pickReaction(reactions: string[]): string {
  return reactions[Math.floor(Math.random() * reactions.length)]
}

export function shouldHesitate(hesitationChance: number): boolean {
  return Math.random() < hesitationChance
}

export function pickHesitationWord(hesitationWords: string[]): string {
  return hesitationWords[Math.floor(Math.random() * hesitationWords.length)]
}

export function shouldForget(forgetChance: number, isDM: boolean, reason: TriggerReason): boolean {
  if (isDM) return false
  if (reason === "mention" || reason === "dm") return false
  return Math.random() < forgetChance
}
