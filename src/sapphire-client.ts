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

	async askStream(
		text: string,
		sessionId: string,
		debug: boolean,
		onChunk: (chunk: string) => void,
	): Promise<SapphireResult> {
		const resp = await fetch(`${this.base}/v1/respond`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: this.botUsername,
				text,
				session_id: sessionId,
				stream: true,
				debug,
			}),
		});
		if (!resp.ok) {
			const errText = await resp.text().catch(() => "");
			throw new Error(`sapphire error ${resp.status}: ${errText.slice(0, 200)}`);
		}

		const reader = resp.body!.getReader();
		const decoder = new TextDecoder();
		let buf = "";
		let firstChunk = true;

		function nextLine(): string | null {
			const idx = buf.indexOf("\n");
			if (idx === -1) return null;
			const line = buf.slice(0, idx);
			buf = buf.slice(idx + 1);
			return line;
		}

		let result: SapphireResult | null = null;

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buf += decoder.decode(value, { stream: true });

			let line: string | null;
			while ((line = nextLine()) !== null) {
				if (!line.startsWith("data: ")) continue;
				const payload = line.slice(6);
				if (payload === "[DONE]") break;

				try {
					const obj = JSON.parse(payload);
					if (typeof obj === "object" && obj !== null && "text" in obj) {
						result = {
							text: obj.text as string,
							label: obj.label as string,
							backend: obj.backend as string,
							valence: obj.valence as number,
							arousal: obj.arousal as number,
							debugPromptTokens: obj.prompt_tokens as number | undefined,
							debugCompletionTokens: obj.completion_tokens as number | undefined,
							debugTimeMs: obj.time_ms as number | undefined,
							debugTokensPerSecond: obj.tokens_per_second as number | undefined,
							debugEmotionStateValence: obj.emotion_state_valence as
								| number
								| undefined,
							debugEmotionStateArousal: obj.emotion_state_arousal as
								| number
								| undefined,
							debugClassificationConfidence: obj.classification_confidence as
								| number
								| undefined,
						};
						continue;
					}
				} catch {
					/* not JSON — content delta */
				}

				if (firstChunk) {
					firstChunk = false;
				}
				onChunk(payload);
			}

			if (line === "[DONE]") break;
		}

		if (result) return result;
		throw new Error("sapphire stream ended without final metadata");
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
