import type { TriggerReason } from "../behavior/mannerisms";
import type { MessageEvent } from "../protocol";
import type { BrainState } from "./state";

export type TriggerResult = {
	shouldRespond: boolean;
	reason: TriggerReason | null;
	paused: boolean;
	stopped: boolean;
	cleared: boolean;
};

export function evaluateMessage(
	event: MessageEvent,
	botUserId: string,
	botUsername: string,
	state: BrainState,
	config: {
		names: string[];
		keywords: string[];
		keyword_chance: number;
		random_chance: number;
		cooldown_seconds: number;
		follow_up_window: number;
		reply_in_dm: boolean;
	},
): TriggerResult {
	const text = event.text.trim().toLowerCase();

	// Commands
	if (text.startsWith("-stop")) {
		state.setPaused(event.client, true);
		return {
			shouldRespond: false,
			reason: null,
			paused: true,
			stopped: true,
			cleared: false,
		};
	}
	if (text.startsWith("-start")) {
		state.setPaused(event.client, false);
		return {
			shouldRespond: false,
			reason: null,
			paused: false,
			stopped: false,
			cleared: false,
		};
	}
	if (text.startsWith("-clear")) {
		return {
			shouldRespond: false,
			reason: null,
			paused: false,
			stopped: false,
			cleared: true,
		};
	}

	// Self-message check (bot should not reply to itself)
	if (event.user === botUserId) {
		return {
			shouldRespond: false,
			reason: null,
			paused: false,
			stopped: false,
			cleared: false,
		};
	}

	// Mention check
	const isMentioned = event.mentions?.some(
		(m) => m === botUserId || m === botUsername,
	);
	if (isMentioned) {
		state.paused = false;
		return {
			shouldRespond: true,
			reason: "mention",
			paused: false,
			stopped: false,
			cleared: false,
		};
	}

	// DM
	if (event.isDM) {
		state.paused = false;
		if (!config.reply_in_dm) {
			return {
				shouldRespond: false,
				reason: null,
				paused: false,
				stopped: false,
				cleared: false,
			};
		}
		return {
			shouldRespond: true,
			reason: "dm",
			paused: false,
			stopped: false,
			cleared: false,
		};
	}

	// Paused
	if (state.paused) {
		return {
			shouldRespond: false,
			reason: null,
			paused: true,
			stopped: false,
			cleared: false,
		};
	}

	// Cooldown (skip for follow-ups)
	if (state.isOnCooldown(event.channel, config.cooldown_seconds)) {
		return {
			shouldRespond: false,
			reason: null,
			paused: false,
			stopped: false,
			cleared: false,
		};
	}

	// Name match
	const allNames = [
		botUsername.toLowerCase(),
		...config.names.map((n) => n.toLowerCase()),
	];
	const hasName = allNames.some((name) => text.includes(name));
	if (hasName) {
		return {
			shouldRespond: true,
			reason: "name",
			paused: false,
			stopped: false,
			cleared: false,
		};
	}

	// Keyword match (probabilistic)
	const words = text.split(/\s+/);
	const hasKeyword = config.keywords.some((kw) =>
		words.includes(kw.toLowerCase()),
	);
	if (hasKeyword && Math.random() < config.keyword_chance) {
		return {
			shouldRespond: true,
			reason: "keyword",
			paused: false,
			stopped: false,
			cleared: false,
		};
	}

	// Follow-up
	state.recordSpeaker(event.channel, event.user);
	state.recordActivity(event.channel);

	if (state.canFollowUp(event.channel, botUserId, config.follow_up_window, 3)) {
		return {
			shouldRespond: true,
			reason: "follow-up",
			paused: false,
			stopped: false,
			cleared: false,
		};
	}

	// Random
	if (Math.random() < config.random_chance) {
		return {
			shouldRespond: true,
			reason: "random",
			paused: false,
			stopped: false,
			cleared: false,
		};
	}

	return {
		shouldRespond: false,
		reason: null,
		paused: false,
		stopped: false,
		cleared: false,
	};
}
