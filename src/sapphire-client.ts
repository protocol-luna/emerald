import type { EmeraldConfig } from "./config";

export interface SapphireResult {
	text: string;
	label: string;
	backend: string;
	valence: number;
	arousal: number;
	debugPromptTokens?: number;
	debugCompletionTokens?: number;
	debugTimeMs?: number;
	debugTokensPerSecond?: number;
	debugEmotionStateValence?: number;
	debugEmotionStateArousal?: number;
	debugClassificationConfidence?: number;
}

export class SapphireClient {
	private base: string;
	private botUsername: string;

	constructor(config: EmeraldConfig) {
		this.base = `http://${config.sapphire_host}:${config.sapphire_port}`;
		this.botUsername = config.sapphire_bot_username;
	}

	async ask(
		text: string,
		sessionId: string,
		debug = false,
	): Promise<SapphireResult> {
		const resp = await fetch(`${this.base}/v1/respond`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: this.botUsername,
				text,
				session_id: sessionId,
				stream: false,
				debug,
			}),
		});
		if (!resp.ok) {
			const errText = await resp.text().catch(() => "");
			throw new Error(`sapphire error ${resp.status}: ${errText.slice(0, 200)}`);
		}
		const raw = (await resp.json()) as Record<string, unknown>;
		return {
			text: raw.text as string,
			label: raw.label as string,
			backend: raw.backend as string,
			valence: raw.valence as number,
			arousal: raw.arousal as number,
			debugPromptTokens: raw.debug_prompt_tokens as number | undefined,
			debugCompletionTokens: raw.debug_completion_tokens as number | undefined,
			debugTimeMs: raw.debug_time_ms as number | undefined,
			debugTokensPerSecond: raw.debug_tokens_per_second as number | undefined,
			debugEmotionStateValence: raw.debug_emotion_state_valence as
				| number
				| undefined,
			debugEmotionStateArousal: raw.debug_emotion_state_arousal as
				| number
				| undefined,
			debugClassificationConfidence: raw.debug_classification_confidence as
				| number
				| undefined,
		};
	}

	async reset(sessionId?: string): Promise<void> {
		try {
			await fetch(`${this.base}/v1/reset`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ session_id: sessionId ?? null }),
			});
		} catch {
			/* best effort */
		}
	}
}
