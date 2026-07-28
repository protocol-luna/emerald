import type { EmeraldConfig } from "./config";
import type { InEvent } from "./protocol";

export class RubyClient {
	private base: string;

	constructor(config: EmeraldConfig) {
		this.base = `http://${config.ruby_host}:${config.ruby_port}`;
	}

	async train(event: InEvent & { type: "message" }) {
		try {
			await fetch(`${this.base}/train`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					text: event.text,
					isDM: event.isDM,
					channel_id: event.channel,
					user_id: event.user,
					platform: event.client,
				}),
			});
		} catch {
			/* fire and forget */
		}
	}

	async generate(
		seed?: string,
		maxLength = 30,
		channelId?: string,
	): Promise<string> {
		const resp = await fetch(`${this.base}/generate`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				seed,
				max_length: maxLength,
				channel_id: channelId,
			}),
		});
		if (!resp.ok) {
			const errText = await resp.text().catch(() => "");
			throw new Error(`ruby error ${resp.status}: ${errText.slice(0, 200)}`);
		}
		const data = (await resp.json()) as { text: string };
		return data.text;
	}
}
