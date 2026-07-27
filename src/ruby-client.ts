import type { EmeraldConfig } from "./config";

export class RubyClient {
	private base: string;

	constructor(config: EmeraldConfig) {
		this.base = `http://${config.ruby_host}:${config.ruby_port}`;
	}

	async train(text: string, isDM = false) {
		try {
			await fetch(`${this.base}/train`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ text, isDM }),
			});
		} catch {
			/* fire and forget -- don't block message handling */
		}
	}

	async generate(seed?: string, maxLength = 30): Promise<string> {
		const resp = await fetch(`${this.base}/generate`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ seed, max_length: maxLength }),
		});
		if (!resp.ok) {
			const errText = await resp.text().catch(() => "");
			throw new Error(`ruby error ${resp.status}: ${errText.slice(0, 200)}`);
		}
		const data = (await resp.json()) as { text: string };
		return data.text;
	}
}
