import type { EmeraldConfig } from "./config";

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
	): Promise<string> {
		const resp = await fetch(`${this.base}/v1/respond`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: this.botUsername,
				text,
				session_id: sessionId,
				stream: false,
			}),
		});
		if (!resp.ok) {
			const errText = await resp.text().catch(() => "");
			throw new Error(`sapphire error ${resp.status}: ${errText.slice(0, 200)}`);
		}
		const data = (await resp.json()) as { text: string };
		return data.text;
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
