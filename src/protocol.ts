export type ClientId = "jade" | "pixieglow";

export type MessageEvent = {
	type: "message";
	id: string;
	client: ClientId;
	channel: string;
	user: string;
	username?: string;
	text: string;
	timestamp: number;
	isDM: boolean;
	mentions?: string[];
	debug?: boolean;
};

export type ReadyEvent = {
	type: "ready";
	client: ClientId;
	userId: string;
	username: string;
};

export type BotMessageEvent = {
	type: "bot_message";
	client: ClientId;
	channel: string;
	text: string;
	timestamp: number;
};

export type PresenceEvent = {
	type: "presence";
	client: ClientId;
	status: "online" | "idle" | "dnd" | "invisible";
};

export type InEvent =
	| MessageEvent
	| ReadyEvent
	| BotMessageEvent
	| PresenceEvent;

export type ReactionPlan = {
	emoji: string;
	delay: number;
};

export type BurstPlan = {
	fragmentCount: number;
	fragmentDelays: number[];
};

export type ReplyStyle = {
	messageReference: boolean;
	mentionRepliedUser: boolean;
};

export type TypoCorrection = {
	originalWord: string;
	correctedWord: string;
	delay: number;
	style: "edit" | "message" | "mixed";
};

export type BehaviorDebug = {
	typoChance: number;
	typoApplied: boolean;
	swapChance: number;
	swapApplied: boolean;
	burstChance: number;
	burstApplied: boolean;
	hesitationChance: number;
	hesitationApplied: boolean;
	forgetChance: number;
	voiceChance: number;
	voiceApplied: boolean;
	sleepMode: string | null;
	fatigueMultiplier: number;
};

export type DebugStats = {
	promptTokens: number;
	completionTokens: number;
	timeMs: number;
	tokensPerSecond: number;
	emotionStateValence: number;
	emotionStateArousal: number;
	classificationLabel: string;
	classificationConfidence: number;
	messageValence: number;
	messageArousal: number;
	behavior?: BehaviorDebug;
};

export type RespondCommand = {
	type: "respond";
	id: string;
	channel: string;
	text: string;
	responseText: string;
	delay: number;
	replyTo?: string;
	replyStyle: ReplyStyle;
	hesitationWord?: string;
	burstPlan?: BurstPlan;
	typoCorrection?: TypoCorrection;
	letterSwap?: { original: string; corrected: string; delay: number };
	react?: ReactionPlan;
	voice?: boolean;
	sessionId?: string;
	debugStats?: DebugStats;
};

export type TypingCommand = {
	type: "typing";
	id: string;
	channel: string;
	duration: number;
};

export type SetPresenceCommand = {
	type: "set_presence";
	id: string;
	status: "online" | "idle" | "dnd" | "invisible";
	text?: string;
	activityType?: number;
};

export type SpontaneousCommand = {
	type: "spontaneous";
	id: string;
	channel: string;
	sessionId: string;
};

export type ForgotCommand = {
	type: "forgot";
	id: string;
	channel: string;
};

export type OutCommand =
	| RespondCommand
	| TypingCommand
	| SetPresenceCommand
	| SpontaneousCommand
	| ForgotCommand;

export type WsMessage =
	| { event: "command"; command: OutCommand }
	| { event: "ack"; ackId: string };
