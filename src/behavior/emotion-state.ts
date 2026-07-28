import type { EmeraldDB } from "../db";

const DEFAULT_DECAY = 0.85;
const DEFAULT_DEADZONE = 0.01;

export class EmotionState {
	private decay: number;
	private deadzone: number;
	private state: Map<string, { valence: number; arousal: number }>;
	private db: EmeraldDB | null;

	constructor(
		db: EmeraldDB | null = null,
		decay = DEFAULT_DECAY,
		deadzone = DEFAULT_DEADZONE,
	) {
		this.decay = decay;
		this.deadzone = deadzone;
		this.db = db;
		this.state = db ? db.loadAllEmotions() : new Map();
	}

	update(
		key: string,
		valenceDelta: number,
		arousalDelta: number,
	): { valence: number; arousal: number } {
		const vd =
			Math.abs(valenceDelta) < this.deadzone ? 0 : valenceDelta;
		const ad =
			Math.abs(arousalDelta) < this.deadzone ? 0 : arousalDelta;

		const cur = this.state.get(key) ?? { valence: 0, arousal: 0 };
		const next = {
			valence: cur.valence * this.decay + vd * (1 - this.decay),
			arousal: cur.arousal * this.decay + ad * (1 - this.decay),
		};
		this.state.set(key, next);
		this.db?.saveEmotion(key, next.valence, next.arousal);
		return next;
	}

	get(key: string): { valence: number; arousal: number } {
		return this.state.get(key) ?? { valence: 0, arousal: 0 };
	}
}
