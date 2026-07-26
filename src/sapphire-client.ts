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
		const data = await resp.json() as SapphireResult;
		return data;
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
