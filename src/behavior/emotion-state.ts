const DEFAULT_DECAY = 0.85;
const DEFAULT_DEADZONE = 0.06;

export class EmotionState {
	private decay: number;
	private deadzone: number;
	private state: Map<string, { valence: number; arousal: number }> = new Map();

	constructor(decay = DEFAULT_DECAY, deadzone = DEFAULT_DEADZONE) {
		this.decay = decay;
		this.deadzone = deadzone;
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
		return next;
	}

	get(key: string): { valence: number; arousal: number } {
		return this.state.get(key) ?? { valence: 0, arousal: 0 };
	}
}
