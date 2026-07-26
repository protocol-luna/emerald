import type { TriggerReason } from "../behavior/mannerisms";

type CooldownEntry = { lastReply: number };

type ActivityEntry = {
	lastMessage: number;
	lastBotActivity: number;
	responseCount: number;
};

type SessionEntry = {
	count: number;
	paused: boolean;
	pauseTimeout?: ReturnType<typeof setTimeout>;
	lastMessage: number;
	queuedMessages: Array<{
		text: string;
		user: string;
		username?: string;
		timestamp: number;
		mentions?: string[];
	}>;
};

type BotActivity = { timestamp: number };
type SpeakerEntry = { userId: string; lastSpoke: number };

type FollowUpEntry = {
	lastFollowUp: number;
	count: number;
};

type PendingDecision = {
	messageId: string;
	channel: string;
	user: string;
	username?: string;
	text: string;
	isDM: boolean;
	mentions?: string[];
	reason: TriggerReason;
	timestamp: number;
};

export class BrainState {
	cooldowns = new Map<string, CooldownEntry>();
	activity = new Map<string, ActivityEntry>();
	sessions = new Map<string, SessionEntry>();
	botActivity = new Map<string, BotActivity>();
	globalLastActivity = 0;
	lastSpeaker = new Map<string, SpeakerEntry>();
	followUpMap = new Map<string, FollowUpEntry>();
	pendingDecisions = new Map<string, PendingDecision>();

	paused = false;
	pausedBy = "";

	lastDecision: {
		messageId: string;
		reason: TriggerReason;
		delay: number;
		timestamp: number;
	} | null = null;

	setPaused(client: string, paused: boolean) {
		this.paused = paused;
		this.pausedBy = client;
	}

	isOnCooldown(channel: string, cooldownSeconds: number): boolean {
		const entry = this.cooldowns.get(channel);
		if (!entry) return false;
		return Date.now() - entry.lastReply < cooldownSeconds * 1000;
	}

	markReplied(channel: string) {
		this.cooldowns.set(channel, { lastReply: Date.now() });
	}

	markBotActivity(channel: string) {
		const now = Date.now();
		this.botActivity.set(channel, { timestamp: now });
		this.globalLastActivity = now;
	}

	getGlobalInactivityMs(): number {
		return Date.now() - this.globalLastActivity;
	}

	isRecentBotActivity(channel: string, window: number): boolean {
		const entry = this.botActivity.get(channel);
		if (!entry) return false;
		return Date.now() - entry.timestamp < window;
	}

	recordSpeaker(channel: string, userId: string) {
		this.lastSpeaker.set(channel, { userId, lastSpoke: Date.now() });
	}

	getLastSpeaker(channel: string): string | undefined {
		return this.lastSpeaker.get(channel)?.userId;
	}

	canFollowUp(
		channel: string,
		botId: string,
		followUpWindow: number,
		followUpMax: number,
	): boolean {
		if (!this.isRecentBotActivity(channel, followUpWindow)) return false;
		if (this.getLastSpeaker(channel) !== botId) return false;

		const followUp = this.followUpMap.get(channel);
		const count = followUp?.count ?? 0;
		return count < followUpMax;
	}

	markFollowUp(channel: string, followUpWindow: number) {
		const now = Date.now();
		const existing = this.followUpMap.get(channel);
		const count = (existing?.count ?? 0) + 1;
		this.followUpMap.set(channel, { lastFollowUp: now, count });

		setTimeout(() => {
			const entry = this.followUpMap.get(channel);
			if (entry) {
				entry.count = Math.max(0, entry.count - 1);
				if (entry.count === 0) this.followUpMap.delete(channel);
			}
		}, followUpWindow);
	}

	checkSessionLimit(
		channel: string,
		sessionMessageLimit: number,
		sessionPauseSeconds: number,
		sessionResetMinutes: number,
		onResume: (
			channel: string,
			queued: Array<{
				text: string;
				user: string;
				username?: string;
				timestamp: number;
				mentions?: string[];
			}>,
		) => void,
	): boolean {
		let session = this.sessions.get(channel);
		if (!session) {
			session = {
				count: 0,
				paused: false,
				lastMessage: Date.now(),
				queuedMessages: [],
			};
			this.sessions.set(channel, session);
		}

		if (Date.now() - session.lastMessage > sessionResetMinutes * 60000) {
			session.count = 0;
			session.paused = false;
			if (session.pauseTimeout) clearTimeout(session.pauseTimeout);
			session.queuedMessages = [];
		}

		session.count++;
		session.lastMessage = Date.now();

		if (session.count >= sessionMessageLimit) {
			session.paused = true;
			session.pauseTimeout = setTimeout(() => {
				const s = this.sessions.get(channel);
				if (s) {
					s.paused = false;
					s.count = 0;
					const queued = [...s.queuedMessages];
					s.queuedMessages = [];
					onResume(channel, queued);
				}
			}, sessionPauseSeconds * 1000);
			return true;
		}

		return false;
	}

	isSessionPaused(channel: string): boolean {
		const session = this.sessions.get(channel);
		return session?.paused ?? false;
	}

	queueMessage(
		channel: string,
		text: string,
		user: string,
		username?: string,
		timestamp?: number,
		mentions?: string[],
	) {
		let session = this.sessions.get(channel);
		if (!session) {
			session = {
				count: 0,
				paused: false,
				lastMessage: Date.now(),
				queuedMessages: [],
			};
			this.sessions.set(channel, session);
		}
		session.queuedMessages.push({
			text,
			user,
			username,
			timestamp: timestamp ?? Date.now(),
			mentions,
		});
	}

	recordActivity(channel: string) {
		const now = Date.now();
		const existing = this.activity.get(channel) ?? {
			lastMessage: 0,
			lastBotActivity: 0,
			responseCount: 0,
		};
		existing.lastMessage = now;
		this.activity.set(channel, existing);

		const entry = this.botActivity.get(channel);
		if (!entry || now - entry.timestamp > 300000) {
			this.globalLastActivity = now;
		}
	}

	pruneActivity(maxAge: number) {
		const now = Date.now();
		for (const [channel, entry] of this.activity) {
			if (now - entry.lastMessage > maxAge) {
				this.activity.delete(channel);
			}
		}
		for (const [channel, entry] of this.botActivity) {
			if (now - entry.timestamp > maxAge) {
				this.botActivity.delete(channel);
			}
		}
	}

	toJSON(): Record<string, unknown> {
		return {
			paused: this.paused,
			pausedBy: this.pausedBy,
			sessions: Array.from(this.sessions.entries()).map(([k, v]) => ({
				channel: k,
				count: v.count,
				paused: v.paused,
				lastMessage: v.lastMessage,
			})),
			cooldowns: Array.from(this.cooldowns.entries()).map(([k]) => k),
			lastDecision: this.lastDecision,
		};
	}
}
