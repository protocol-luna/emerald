import { BurstPlan } from "../protocol"

export function shouldBurst(burstChance: number): boolean {
  return Math.random() < burstChance
}

export function planBurst(burstDelayMin: number, burstDelayMax: number): BurstPlan | null {
  const fragmentCount = Math.random() < 0.6 ? 2 : 3

  const delays: number[] = []
  for (let i = 0; i < fragmentCount - 1; i++) {
    delays.push(burstDelayMin + Math.random() * (burstDelayMax - burstDelayMin))
  }

  return { fragmentCount, fragmentDelays: delays }
}
