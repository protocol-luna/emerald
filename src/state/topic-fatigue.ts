export class TopicFatigue {
	logs = new Map<string, string[]>();

	recordMessage(channel: string, text: string) {
		const words = text
			.toLowerCase()
			.split(/\s+/)
			.filter((w) => w.length >= 4 && /^[a-z]+$/.test(w));

		if (words.length === 0) return;

		let log = this.logs.get(channel);
		if (!log) {
			log = [];
			this.logs.set(channel, log);
		}

		log.push(...words);
	}

	countFrequency(channel: string): number {
		const log = this.logs.get(channel);
		if (!log || log.length === 0) return 0;

		const freq = new Map<string, number>();
		for (const word of log) {
			freq.set(word, (freq.get(word) ?? 0) + 1);
		}
		let max = 0;
		for (const count of freq.values()) {
			if (count > max) max = count;
		}
		return max;
	}

	getFatigueMultiplier(
		channel: string,
		enabled: boolean,
		threshold: number,
		delayMultiplier: number,
	): number {
		if (!enabled) return 1;
		const count = this.countFrequency(channel);
		if (count < threshold) return 1;
		const excess = count - threshold + 1;
		return Math.min(excess * delayMultiplier, 5);
	}

	getIgnoreBonus(
		channel: string,
		enabled: boolean,
		threshold: number,
		ignoreBonus: number,
	): number {
		if (!enabled) return 0;
		const count = this.countFrequency(channel);
		return count >= threshold ? ignoreBonus : 0;
	}

	prune(window: number) {
		const maxEntries = window * 10;
		for (const [channel, log] of this.logs) {
			if (log.length > maxEntries) {
				this.logs.set(channel, log.slice(log.length - maxEntries));
			}
		}
	}
}
