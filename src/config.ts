import { existsSync, readFileSync } from "node:fs";
import { load } from "js-yaml";

export type TriggerConfig = {
	delay_min: number;
	delay_max: number;
	ignore_chance: number;
	reaction_chance: number;
};

export type TimeSchedule = {
	start: string;
	end: string;
	behavior?: "sleep" | "slow" | "short";
};

export type ReplyStyleConfig = {
	message_reference: boolean;
	mention_replied_user: boolean;
	weight: number;
};

export type EmeraldConfig = {
	port: number;

	names: string[];
	keywords: string[];
	random_chance: number;
	cooldown_seconds: number;
	reply_in_dm: boolean;

	concentration: Record<string, TriggerConfig>;

	reactions: string[];

	spontaneous_interval_ms: number;
	spontaneous_chance: number;
	spontaneous_whitelist: string;

	burst_chance: number;
	burst_delay_min: number;
	burst_delay_max: number;

	hesitation_chance: number;
	hesitation_words: string[];
	forget_chance: number;

	topic_fatigue_enabled: boolean;
	topic_fatigue_window: number;
	topic_fatigue_threshold: number;
	topic_fatigue_delay_multiplier: number;
	topic_fatigue_ignore_bonus: number;

	typo_chance: number;
	typo_layout: "azerty" | "qwerty";
	typo_correction_delay_min: number;
	typo_correction_delay_max: number;
	typo_correction_style: "edit" | "message" | "mixed";

	letter_swap_chance: number;

	inactivity_warmup_minutes: number;
	inactivity_warmup_multiplier: number;

	timezone: string;
	time_schedules: TimeSchedule[];

	session_message_limit: number;
	session_pause_seconds: number;
	session_reset_minutes: number;

	reply_styles: ReplyStyleConfig[];

	follow_up_window: number;
	follow_up_max: number;

	activity_prune_interval: number;
	activity_max_age: number;
};

export const DEFAULT_CONFIG: EmeraldConfig = {
	port: 3126,

	names: ["Luna", "Pixie"],
	keywords: [
		"hello",
		"hi",
		"hey",
		"yo",
		"help",
		"question",
		"ai",
		"llm",
		"bot",
	],
	random_chance: 0.015,
	cooldown_seconds: 8,
	reply_in_dm: true,

	concentration: {
		mention: {
			delay_min: 300,
			delay_max: 1500,
			ignore_chance: 0.02,
			reaction_chance: 0.08,
		},
		dm: {
			delay_min: 400,
			delay_max: 1800,
			ignore_chance: 0,
			reaction_chance: 0.05,
		},
		name: {
			delay_min: 800,
			delay_max: 4000,
			ignore_chance: 0.02,
			reaction_chance: 0.06,
		},
		keyword: {
			delay_min: 1000,
			delay_max: 3500,
			ignore_chance: 0.02,
			reaction_chance: 0.04,
		},
		"follow-up": {
			delay_min: 500,
			delay_max: 2000,
			ignore_chance: 0.02,
			reaction_chance: 0.03,
		},
		random: {
			delay_min: 1500,
			delay_max: 5000,
			ignore_chance: 0.02,
			reaction_chance: 0.02,
		},
	},

	reactions: [
		"👀",
		"😄",
		"🤔",
		"👋",
		"🔥",
		"💀",
		"✨",
		"😭",
		"🤨",
		"👌",
		"🙏",
		"💅",
		"🗿",
		"🌚",
	],

	spontaneous_interval_ms: 300000,
	spontaneous_chance: 0.12,
	spontaneous_whitelist: "*",

	burst_chance: 0.15,
	burst_delay_min: 1500,
	burst_delay_max: 4000,

	hesitation_chance: 0.15,
	hesitation_words: [
		"uh...",
		"um...",
		"well...",
		"i mean...",
		"hmm...",
		"so...",
	],
	forget_chance: 0.03,

	topic_fatigue_enabled: true,
	topic_fatigue_window: 10,
	topic_fatigue_threshold: 3,
	topic_fatigue_delay_multiplier: 2,
	topic_fatigue_ignore_bonus: 0.15,

	typo_chance: 0.06,
	typo_layout: "azerty",
	typo_correction_delay_min: 2000,
	typo_correction_delay_max: 4000,
	typo_correction_style: "mixed",

	letter_swap_chance: 0.04,

	inactivity_warmup_minutes: 10,
	inactivity_warmup_multiplier: 2,

	timezone: "Europe/Paris",
	time_schedules: [
		{ start: "07:00", end: "10:00" },
		{ start: "10:00", end: "11:00", behavior: "short" },
		{ start: "11:00", end: "16:00" },
		{ start: "16:00", end: "18:00", behavior: "slow" },
		{ start: "18:00", end: "22:00" },
		{ start: "22:00", end: "07:00", behavior: "sleep" },
	],

	session_message_limit: 8,
	session_pause_seconds: 30,
	session_reset_minutes: 3,

	reply_styles: [
		{ message_reference: true, mention_replied_user: false, weight: 50 },
		{ message_reference: true, mention_replied_user: true, weight: 15 },
		{ message_reference: false, mention_replied_user: false, weight: 30 },
		{ message_reference: false, mention_replied_user: true, weight: 5 },
	],

	follow_up_window: 60000,
	follow_up_max: 3,

	activity_prune_interval: 300000,
	activity_max_age: 3600000,
};

export function loadConfig(path?: string): EmeraldConfig {
	if (path && existsSync(path)) {
		const yaml = readFileSync(path, "utf-8");
		const parsed = load(yaml) as Partial<EmeraldConfig>;
		return deepMerge(DEFAULT_CONFIG, parsed);
	}

	const envPath = process.env.EMERALD_CONFIG;
	if (envPath && existsSync(envPath)) {
		const yaml = readFileSync(envPath, "utf-8");
		const parsed = load(yaml) as Partial<EmeraldConfig>;
		return deepMerge(DEFAULT_CONFIG, parsed);
	}

	return { ...DEFAULT_CONFIG };
}

function deepMerge<T extends Record<string, unknown>>(
	base: T,
	override: Partial<T>,
): T {
	const result = { ...base };
	for (const key of Object.keys(override) as (keyof T)[]) {
		const val = override[key];
		if (val !== undefined) {
			if (
				val &&
				typeof val === "object" &&
				!Array.isArray(val) &&
				typeof result[key] === "object" &&
				!Array.isArray(result[key])
			) {
				result[key] = deepMerge(
					result[key] as Record<string, unknown>,
					val as Record<string, unknown>,
				) as T[keyof T];
			} else {
				result[key] = val as T[keyof T];
			}
		}
	}
	return result;
}
