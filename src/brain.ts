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
import { EmotionState } from "./behavior/emotion-state";
import type { EmeraldConfig } from "./config";
import type { EmeraldDB } from "./db";
import type {
	DebugStats,
	InEvent,
	MessageEvent,
	OutCommand,
	ReactionPlan,
	ReplyStyle,
	RespondCommand,
	SpontaneousCommand,
} from "./protocol";
import { RubyClient } from "./ruby-client";
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
	ruby: RubyClient | null = null;
	botUsers = new Map<string, { userId: string; username: string }>();

	private spontaneousTimers = new Map<string, ReturnType<typeof setInterval>>();
	private pruneTimer: ReturnType<typeof setInterval> | null = null;
	private broadcastCommand: ((cmd: OutCommand) => void) | null = null;
	private emotionState!: EmotionState;

	constructor(
		config: EmeraldConfig,
		broadcastCommand?: (cmd: OutCommand) => void,
		db?: EmeraldDB,
	) {
		this.config = config;
		this.sapphire = new SapphireClient(config);
		if (config.ruby_enabled) {
			this.ruby = new RubyClient(config);
		}
		this.broadcastCommand = broadcastCommand ?? null;
		this.emotionState = new EmotionState(db ?? null);
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

		// find channels where the bot was recently active
		// but a user was the last speaker (don't talk into the void)
		const botUser = this.botUsers.get(client);
		if (!botUser) return;

		const eligibleChannels: string[] = [];
		for (const [key] of this.state.botActivity) {
			if (
				!this.state.isRecentBotActivity(
					key,
					this.config.spontaneous_channel_window_ms,
				)
			)
				continue;
			const lastSpeaker = this.state.getLastSpeaker(key);
			if (lastSpeaker && lastSpeaker !== botUser.userId) {
				const colon = key.indexOf(":");
				eligibleChannels.push(key.slice(colon + 1));
			}
		}

		if (eligibleChannels.length === 0) return;

		const channel =
			eligibleChannels[Math.floor(Math.random() * eligibleChannels.length)];
		const sessionId = `${client}:${channel}`;

		setImmediate(() => {
			this.emitSpontaneous(client, channel, sessionId);
		});
	}

	private async emitSpontaneous(
		_client: string,
		channel: string,
		sessionId: string,
	) {
		if (this.ruby && this.config.ruby_reasons.includes("spontaneous")) {
			try {
				const text = await this.ruby.generate(undefined, 20, channel);
				if (!text) return;

				const delay = computeDelay(
					"random",
					"",
					this.config.concentration,
					0,
					this.config.inactivity_warmup_minutes,
					this.config.inactivity_warmup_multiplier,
					null,
					1,
				);

				let processedText = text;
				if (Math.random() < this.config.typo_chance) {
					const r = applyTypo(processedText, this.config.typo_layout);
					if (r) processedText = r.text;
				}
				if (Math.random() < this.config.letter_swap_chance) {
					const r = applyLetterSwap(processedText);
					if (r) processedText = r.text;
				}

				const willHesitate = shouldHesitate(this.config.hesitation_chance);
				const hesitationWord = willHesitate
					? pickHesitationWord(this.config.hesitation_words)
					: undefined;

				const burst = shouldBurst(this.config.burst_chance);
				const burstPlan = burst
					? planBurst(this.config.burst_delay_min, this.config.burst_delay_max)
					: undefined;

				const cmd: RespondCommand = {
					type: "respond",
					id: `ruby_spon_${channel}_${Date.now()}`,
					channel,
					text: "",
					responseText: processedText,
					delay: Math.round(delay),
					hesitationWord,
					burstPlan: burstPlan ?? undefined,
					sessionId,
					replyStyle: { messageReference: false, mentionRepliedUser: false },
				};
				this.broadcastCommand?.(cmd);
				return;
			} catch (err) {
				console.error("[Brain] Ruby spontaneous error:", err);
			}
		}

		const cmd: SpontaneousCommand = {
			type: "spontaneous",
			id: `spon_${channel}_${Date.now()}`,
			channel,
			sessionId,
		};
		this.broadcastCommand?.(cmd);
	}

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
				this.state.markBotActivity(event.client, event.channel);
				this.state.recordSpeaker(
					event.client,
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

		if (this.ruby && event.user !== botUser.userId) {
			this.ruby.train(event);
		}

		const trigger = evaluateMessage(
			event,
			botUser.userId,
			botUser.username,
			this.state,
			{
				names: this.config.names,
				keywords: this.config.keywords,
				keyword_chance: this.config.keyword_chance,
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

		this.state.recordActivity(event.client, event.channel);
		this.state.recordSpeaker(event.client, event.channel, event.user);

		if (trigger.reason !== "mention" && trigger.reason !== "dm") {
			this.state.markReplied(event.client, event.channel);
		}

		if (trigger.reason === "follow-up") {
			this.state.markFollowUp(
				event.client,
				event.channel,
				this.config.follow_up_window,
			);
		}

		if (this.state.isSessionPaused(event.client, event.channel)) {
			this.state.queueMessage(
				event.client,
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
			event.client,
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

		const sessionId = `${event.client}:${event.channel}`;
		const emo = this.emotionState.get(sessionId);
		const emoIgnoreBonus = Math.max(0, -emo.valence * 3);
		const emoForgetBonus = Math.max(0, -emo.valence * 2);
		const emoDelayMult = Math.max(0.5, 1.0 - emo.arousal * 2.5);
		const emoHesitationMult = Math.max(0.5, 1.0 + emo.arousal * 4);
		const emoBurstMult = Math.max(0.5, 1.0 + emo.arousal * 4);
		const emoTypoMult = Math.max(0.5, 1.0 + emo.arousal * 3);

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
				) + emoIgnoreBonus,
			)
		) {
			return [{ type: "ignore", messageId: event.id }];
		}

		if (shouldForget(this.config.forget_chance + emoForgetBonus, event.isDM, trigger.reason)) {
			return [
				{
					type: "forgot",
					messageId: event.id,
					channel: event.channel,
				},
			];
		}

		const inactivityMs = this.state.getGlobalInactivityMs();

		let delay = computeDelay(
			trigger.reason,
			event.text,
			this.config.concentration,
			inactivityMs,
			this.config.inactivity_warmup_minutes,
			this.config.inactivity_warmup_multiplier,
			sleepBehavior,
			fatigueMultiplier,
		);
		delay = Math.round(delay * emoDelayMult);

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

		const willHesitate = shouldHesitate(this.config.hesitation_chance * emoHesitationMult);
		const hesitationWord = willHesitate
			? pickHesitationWord(this.config.hesitation_words)
			: undefined;

		const burst = shouldBurst(this.config.burst_chance * emoBurstMult);
		const burstPlan = burst
			? planBurst(this.config.burst_delay_min, this.config.burst_delay_max)
			: undefined;

		const willVoice = Math.random() < this.config.voice_message_chance;

		const replyStyle = this.pickReplyStyle(false);

		const debugMode = event.debug ?? false;

		const cleanText = this.stripMentions(
			event.text,
			botUser.userId,
			botUser.username,
		);

		let responseText = "";
		let debugStats: DebugStats | undefined;
		let typingSent = false;
		const useRuby =
			this.ruby && this.config.ruby_reasons.includes(trigger.reason ?? "");
		try {
			if (useRuby) {
				const seed = event.text.split(/\s+/).slice(-2).join(" ");
				// biome-ignore lint/style/noNonNullAssertion: guarded by useRuby check
				responseText = await this.ruby!.generate(seed, 25);
				if (debugMode) {
					debugStats = {
						promptTokens: 0,
						completionTokens: 0,
						timeMs: 0,
						tokensPerSecond: 0,
						emotionStateValence: 0,
						emotionStateArousal: 0,
						prevEmotionStateValence: 0,
						prevEmotionStateArousal: 0,
						classificationLabel: "",
						classificationConfidence: 0,
						messageValence: 0,
						messageArousal: 0,
						triggerReason: trigger.reason,
						delay: Math.round(delay),
						usedRuby: true,
						inactivityMs,
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
			} else {
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
				const prevEmo = this.emotionState.get(sessionId);
				const updatedEmo = this.emotionState.update(sessionId, result.valence, result.arousal);
				if (debugMode && result.debugPromptTokens !== undefined) {
					debugStats = {
						promptTokens: result.debugPromptTokens,
						completionTokens: result.debugCompletionTokens ?? 0,
						timeMs: result.debugTimeMs ?? 0,
						tokensPerSecond: result.debugTokensPerSecond ?? 0,
						emotionStateValence: updatedEmo.valence,
						emotionStateArousal: updatedEmo.arousal,
						prevEmotionStateValence: prevEmo.valence,
						prevEmotionStateArousal: prevEmo.arousal,
						classificationLabel: result.label,
						classificationConfidence: result.debugClassificationConfidence ?? 0,
						messageValence: result.valence,
						messageArousal: result.arousal,
						triggerReason: trigger.reason,
						delay: Math.round(delay),
						usedRuby: false,
						inactivityMs,
						behavior: {
							typoChance: this.config.typo_chance * emoTypoMult,
							typoApplied: false,
							swapChance: this.config.letter_swap_chance * emoTypoMult,
							swapApplied: false,
							burstChance: this.config.burst_chance * emoBurstMult,
							burstApplied: false,
							hesitationChance: this.config.hesitation_chance * emoHesitationMult,
							hesitationApplied: false,
							forgetChance: this.config.forget_chance + emoForgetBonus,
							voiceChance: this.config.voice_message_chance,
							voiceApplied: false,
							sleepMode: sleepBehavior,
							fatigueMultiplier,
						},
					};
				}
			}
		} catch (err) {
			console.error(
				`[Brain] ${useRuby ? "Ruby" : "Sapphire"} error for ${event.id}:`,
				err,
			);
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
		let typoResult: {
			text: string;
			original: string;
			corrected: string;
		} | null = null;
		let swapResult: {
			text: string;
			original: string;
			corrected: string;
		} | null = null;

		if (Math.random() < this.config.typo_chance * emoTypoMult) {
			const result = applyTypo(processedText, this.config.typo_layout);
			if (result) {
				processedText = result.text;
				typoApplied = true;
				typoResult = result;
			}
		}

		if (Math.random() < this.config.letter_swap_chance * emoTypoMult) {
			const result = applyLetterSwap(processedText);
			if (result) {
				processedText = result.text;
				swapApplied = true;
				swapResult = result;
			}
		}

		if (debugStats?.behavior) {
			debugStats.behavior.typoApplied = typoApplied;
			debugStats.behavior.swapApplied = swapApplied;
			debugStats.behavior.hesitationApplied = willHesitate;
			debugStats.behavior.burstApplied = burst;
			debugStats.behavior.voiceApplied = willVoice;
		}

		const correctionDelayMin = this.config.typo_correction_delay_min;
		const correctionDelayMax = this.config.typo_correction_delay_max;
		const correctionDelay =
			correctionDelayMin +
			Math.random() * (correctionDelayMax - correctionDelayMin);

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
			typoCorrection: typoResult
				? {
						originalWord: typoResult.original,
						correctedWord: typoResult.corrected,
						delay: Math.round(correctionDelay),
						style: this.config.typo_correction_style,
					}
				: undefined,
			letterSwap: swapResult
				? {
						original: swapResult.original,
						corrected: swapResult.corrected,
						delay: Math.round(correctionDelay),
					}
				: undefined,
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

	private stripMentions(
		text: string,
		userId: string,
		username: string,
	): string {
		let result = text;
		result = result.replace(new RegExp(`<@!?${userId}>`, "g"), "");
		if (username) {
			result = result.replace(new RegExp(`@${username}\\b`, "gi"), "");
		}
		return result.trim();
	}
}
