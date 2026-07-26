import { planBurst, shouldBurst } from "./behavior/burst";
import {
	computeDelay,
	pickHesitationWord,
	pickReaction,
	shouldForget,
	shouldHesitate,
	shouldIgnore,
	shouldReact,
} from "./behavior/mannerisms";
import { evaluateSleep } from "./behavior/sleep";
import { applyLetterSwap, applyTypo } from "./behavior/typo";
import type { EmeraldConfig } from "./config";
import type {
	DebugStats,
	InEvent,
	MessageEvent,
	OutCommand,
	ReactionPlan,
	ReplyStyle,
	RespondCommand,
} from "./protocol";
import { SapphireClient } from "./sapphire-client";
import { BrainState } from "./state/state";
import { TopicFatigue } from "./state/topic-fatigue";
import { evaluateMessage } from "./state/trigger";

export type Decision =
	| {
			type: "respond";
			messageId: string;
			commands: OutCommand[];
	  }
	| {
			type: "ignore";
			messageId: string;
	  }
	| {
			type: "pause" | "unpause";
			messageId: string;
			client: string;
	  }
	| {
			type: "clear";
			messageId: string;
	  }
	| {
			type: "forgot";
			messageId: string;
			channel: string;
	  };

export class Brain {
	state = new BrainState();
	fatigue = new TopicFatigue();
	config: EmeraldConfig;
	sapphire: SapphireClient;
	botUsers = new Map<string, { userId: string; username: string }>();

	private spontaneousTimers = new Map<string, ReturnType<typeof setInterval>>();
	private pruneTimer: ReturnType<typeof setInterval> | null = null;

	constructor(config: EmeraldConfig) {
		this.config = config;
		this.sapphire = new SapphireClient(config);
	}

	start() {
		this.pruneTimer = setInterval(
			() => this.state.pruneActivity(this.config.activity_max_age),
			this.config.activity_prune_interval,
		);
	}

	stop() {
		for (const timer of this.spontaneousTimers.values()) clearInterval(timer);
		if (this.pruneTimer) clearInterval(this.pruneTimer);
	}

	registerClient(client: string, userId: string, username: string) {
		this.botUsers.set(client, { userId, username });
		this.startSpontaneous(client);
	}

	unregisterClient(client: string) {
		this.botUsers.delete(client);
		const timer = this.spontaneousTimers.get(client);
		if (timer) {
			clearInterval(timer);
			this.spontaneousTimers.delete(client);
		}
	}

	private startSpontaneous(client: string) {
		const timer = setInterval(() => {
			this.trySpontaneous(client);
		}, this.config.spontaneous_interval_ms);
		this.spontaneousTimers.set(client, timer);
	}

	private trySpontaneous(client: string) {
		if (Math.random() >= this.config.spontaneous_chance) return;

		const sleepBehavior = evaluateSleep(
			this.config.time_schedules,
			this.config.timezone,
		);
		if (sleepBehavior === "sleep") return;

		setImmediate(() => {
			this.emitSpontaneous(client);
		});
	}

	private emitSpontaneous(_client: string) {}

	async handleEvent(
		event: InEvent,
		sendCommand?: (cmd: OutCommand) => void,
	): Promise<Decision[]> {
		switch (event.type) {
			case "ready":
				this.registerClient(event.client, event.userId, event.username);
				return [];

			case "message":
				return await this.handleMessage(event, sendCommand);

			case "bot_message":
				this.state.markBotActivity(event.channel);
				this.state.recordSpeaker(
					event.channel,
					event.client === "jade"
						? (this.botUsers.get("jade")?.userId ?? "")
						: "",
				);
				return [];

			case "presence":
				return [];

			default:
				return [];
		}
	}

	private async handleMessage(
		event: MessageEvent,
		sendCommand?: (cmd: OutCommand) => void,
	): Promise<Decision[]> {
		const botUser = this.botUsers.get(event.client);
		if (!botUser) return [{ type: "ignore", messageId: event.id }];

		const trigger = evaluateMessage(
			event,
			botUser.userId,
			botUser.username,
			this.state,
			{
				names: this.config.names,
				keywords: this.config.keywords,
				random_chance: this.config.random_chance,
				cooldown_seconds: this.config.cooldown_seconds,
				follow_up_window: this.config.follow_up_window,
				reply_in_dm: this.config.reply_in_dm,
			},
		);

		if (trigger.stopped) {
			return [{ type: "pause", messageId: event.id, client: event.client }];
		}

		if (trigger.cleared) {
			return [{ type: "clear", messageId: event.id }];
		}

		if (trigger.paused && !trigger.shouldRespond) {
			return [{ type: "ignore", messageId: event.id }];
		}

		if (!trigger.shouldRespond || !trigger.reason) {
			return [{ type: "ignore", messageId: event.id }];
		}

		this.state.recordActivity(event.channel);
		this.state.recordSpeaker(event.channel, event.user);

		if (trigger.reason !== "mention" && trigger.reason !== "dm") {
			this.state.markReplied(event.channel);
		}

		if (trigger.reason === "follow-up") {
			this.state.markFollowUp(event.channel, this.config.follow_up_window);
		}

		if (this.state.isSessionPaused(event.channel)) {
			this.state.queueMessage(
				event.channel,
				event.text,
				event.user,
				event.username,
				event.timestamp,
				event.mentions,
			);
			return [{ type: "ignore", messageId: event.id }];
		}

		this.state.checkSessionLimit(
			event.channel,
			this.config.session_message_limit,
			this.config.session_pause_seconds,
			this.config.session_reset_minutes,
			() => {},
		);

		const sleepBehavior = evaluateSleep(
			this.config.time_schedules,
			this.config.timezone,
		);
		this.fatigue.recordMessage(event.channel, event.text);
		this.fatigue.prune(this.config.topic_fatigue_window);

		const fatigueMultiplier = this.fatigue.getFatigueMultiplier(
			event.channel,
			this.config.topic_fatigue_enabled,
			this.config.topic_fatigue_threshold,
			this.config.topic_fatigue_delay_multiplier,
		);

		if (
			shouldIgnore(
				trigger.reason,
				this.config.concentration,
				sleepBehavior,
				this.fatigue.getIgnoreBonus(
					event.channel,
					this.config.topic_fatigue_enabled,
					this.config.topic_fatigue_threshold,
					this.config.topic_fatigue_ignore_bonus,
				),
			)
		) {
			return [{ type: "ignore", messageId: event.id }];
		}

		if (shouldForget(this.config.forget_chance, event.isDM, trigger.reason)) {
			return [
				{
					type: "forgot",
					messageId: event.id,
					channel: event.channel,
				},
			];
		}

		const inactivityMs = this.state.getGlobalInactivityMs();

		const delay = computeDelay(
			trigger.reason,
			event.text,
			this.config.concentration,
			inactivityMs,
			this.config.inactivity_warmup_minutes,
			this.config.inactivity_warmup_multiplier,
			sleepBehavior,
			fatigueMultiplier,
		);

		const _decisions: Decision[] = [];

		this.state.lastDecision = {
			messageId: event.id,
			reason: trigger.reason,
			delay,
			timestamp: Date.now(),
		};

		const commands: OutCommand[] = [];

		const willReact = shouldReact(
			trigger.reason,
			this.config.concentration,
			sleepBehavior,
		);
		let reactPlan: ReactionPlan | undefined;
		if (willReact) {
			const emoji = pickReaction(this.config.reactions);
			const reactDelay = Math.max(0, delay - 800 - Math.random() * 500);
			reactPlan = { emoji, delay: Math.round(reactDelay) };
		}

		const willHesitate = shouldHesitate(this.config.hesitation_chance);
		const hesitationWord = willHesitate
			? pickHesitationWord(this.config.hesitation_words)
			: undefined;

		const burst = shouldBurst(this.config.burst_chance);
		const burstPlan = burst
			? planBurst(this.config.burst_delay_min, this.config.burst_delay_max)
			: undefined;

		const willVoice = Math.random() < this.config.voice_message_chance;

		const replyStyle = this.pickReplyStyle(false);

		const sessionId = `${event.client}:${event.channel}`;
		const debugMode = event.debug ?? false;

		const cleanText = this.stripMentions(event.text, botUser.userId, botUser.username);

		let responseText = "";
		let debugStats: DebugStats | undefined;
		let typingSent = false;
		try {
			const result = await this.sapphire.askStream(
				cleanText,
				sessionId,
				debugMode,
				() => {
					if (!typingSent) {
						typingSent = true;
						const typingDuration = Math.max(5000, delay + 30000);
						sendCommand?.({
							type: "typing",
							id: `type_${event.id}`,
							channel: event.channel,
							duration: Math.round(typingDuration),
						});
					}
				},
			);
			responseText = result.text.replace(/^[^:]+:\s*/, "");
			if (debugMode && result.debugPromptTokens !== undefined) {
				debugStats = {
					promptTokens: result.debugPromptTokens,
					completionTokens: result.debugCompletionTokens ?? 0,
					timeMs: result.debugTimeMs ?? 0,
					tokensPerSecond: result.debugTokensPerSecond ?? 0,
					emotionStateValence: result.debugEmotionStateValence ?? 0,
					emotionStateArousal: result.debugEmotionStateArousal ?? 0,
					classificationLabel: result.label,
					classificationConfidence: result.debugClassificationConfidence ?? 0,
					messageValence: result.valence,
					messageArousal: result.arousal,
					behavior: {
						typoChance: this.config.typo_chance,
						typoApplied: false,
						swapChance: this.config.letter_swap_chance,
						swapApplied: false,
						burstChance: this.config.burst_chance,
						burstApplied: false,
						hesitationChance: this.config.hesitation_chance,
						hesitationApplied: false,
						forgetChance: this.config.forget_chance,
						voiceChance: this.config.voice_message_chance,
						voiceApplied: false,
						sleepMode: sleepBehavior,
						fatigueMultiplier,
					},
				};
			}
		} catch (err) {
			console.error(`[Brain] Sapphire error for ${event.id}:`, err);
			return [
				{
					type: "ignore",
					messageId: event.id,
				},
			];
		}

		if (!responseText) {
			return [{ type: "ignore", messageId: event.id }];
		}

		let processedText = responseText;

		let typoApplied = false;
		let swapApplied = false;

		if (Math.random() < this.config.typo_chance) {
			const result = applyTypo(processedText, this.config.typo_layout);
			if (result) {
				processedText = result.text;
				typoApplied = true;
			}
		}

		if (Math.random() < this.config.letter_swap_chance) {
			const result = applyLetterSwap(processedText);
			if (result) {
				processedText = result.text;
				swapApplied = true;
			}
		}

		if (debugStats?.behavior) {
			debugStats.behavior.typoApplied = typoApplied;
			debugStats.behavior.swapApplied = swapApplied;
			debugStats.behavior.hesitationApplied = willHesitate;
			debugStats.behavior.burstApplied = burst;
			debugStats.behavior.voiceApplied = willVoice;
		}

		const respondCommand: RespondCommand = {
			type: "respond",
			id: `rsp_${event.id}`,
			channel: event.channel,
			text: event.text,
			responseText: processedText,
			delay: Math.round(delay),
			replyTo: event.id,
			replyStyle,
			hesitationWord,
			burstPlan: burstPlan ?? undefined,
			react: reactPlan,
			voice: willVoice || undefined,
			sessionId,
			debugStats,
		};
		commands.push(respondCommand);

		return [
			{
				type: "respond",
				messageId: event.id,
				commands,
			},
		];
	}

	private pickReplyStyle(isActiveConversation: boolean): ReplyStyle {
		if (isActiveConversation) {
			const total = this.config.reply_styles.reduce((s, r) => s + r.weight, 0);
			let roll = Math.random() * total;
			for (const style of this.config.reply_styles) {
				roll -= style.weight;
				if (roll <= 0) {
					return {
						messageReference: style.message_reference,
						mentionRepliedUser: style.mention_replied_user,
					};
				}
			}
		}

		const roll = Math.random();
		if (roll < 0.7)
			return { messageReference: true, mentionRepliedUser: false };
		if (roll < 0.9) return { messageReference: true, mentionRepliedUser: true };
		return { messageReference: false, mentionRepliedUser: false };
	}

	private stripMentions(text: string, userId: string, username: string): string {
		let result = text;
		result = result.replace(new RegExp(`<@!?${userId}>`, "g"), "");
		if (username) {
			result = result.replace(new RegExp(`@${username}\\b`, "gi"), "");
		}
		return result.trim();
	}
}
