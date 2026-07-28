import { test, expect, beforeEach, afterEach, mock } from "bun:test";
import { Brain } from "../src/brain";
import type { EmeraldConfig } from "../src/config";
import { DEFAULT_CONFIG } from "../src/config";
import type { InEvent, OutCommand } from "../src/protocol";

function makeConfig(): EmeraldConfig {
	return { ...DEFAULT_CONFIG, ruby_enabled: false };
}

function makeStreamResponse(data: {
	content?: string;
}): Response {
	const content = data.content ?? "hello there";
	const meta = {
		text: content,
		label: "FUTILE",
		backend: "ollama",
		valence: 0.05,
		arousal: 0.03,
		prompt_tokens: 10,
		completion_tokens: 5,
		time_ms: 200,
		tokens_per_second: 25,
		classification_confidence: 0.8,
	};
	const body =
		`data: {"content":"${content}"}\n` +
		`data: ${JSON.stringify(meta)}\n` +
		"data: [DONE]\n";

	const encoder = new TextEncoder();
	let pos = 0;
	const stream = new ReadableStream({
		pull(controller) {
			if (pos < body.length) {
				const chunk = body.slice(pos, pos + 64);
				pos += 64;
				controller.enqueue(encoder.encode(chunk));
			} else {
				controller.close();
			}
		},
	});

	return new Response(stream, {
		status: 200,
		headers: { "Content-Type": "text/event-stream" },
	});
}

let brain: Brain;
let fetchMock: ReturnType<typeof mock>;

beforeEach(() => {
	fetchMock = mock(() => Promise.resolve(makeStreamResponse({})));
	globalThis.fetch = fetchMock;
	brain = new Brain(makeConfig());
	brain.start();
});

afterEach(() => {
	brain.stop();
	delete (globalThis as any).fetch;
});

function msg(
	text: string,
	overrides?: Partial<InEvent>,
): InEvent {
	return {
		type: "message",
		client: "jade",
		channel: "123",
		user: "456",
		username: "testuser",
		text,
		id: `msg_${Date.now()}_${Math.random()}`,
		timestamp: Date.now(),
		isDM: false,
		mentions: ["1140621041543155803"],
		debug: false,
		...overrides,
	} as InEvent;
}

test("mention triggers respond decision", async () => {
	brain.registerClient("jade", "1140621041543155803", "Kalupso");
	const decisions = await brain.handleEvent(msg("hello"), () => {});

	expect(decisions.length).toBe(1);
	expect(decisions[0].type).toBe("respond");
	if (decisions[0].type === "respond") {
		expect(
			decisions[0].commands.find((c) => c.type === "respond"),
		).toBeDefined();
	}
});

test("DM triggers respond decision", async () => {
	brain.registerClient("jade", "1140621041543155803", "Kalupso");
	const decisions = await brain.handleEvent(
		msg("dm test", { isDM: true, mentions: [] }),
		() => {},
	);

	expect(decisions.length).toBe(1);
	expect(decisions[0].type).toBe("respond");
});

test("debug=true populates debugStats", async () => {
	brain.registerClient("jade", "1140621041543155803", "Kalupso");
	const decisions = await brain.handleEvent(
		msg("hello", { debug: true }),
		() => {},
	);

	expect(decisions[0].type).toBe("respond");
	if (decisions[0].type === "respond") {
		const cmd = decisions[0].commands.find(
			(c): c is OutCommand & { type: "respond" } => c.type === "respond",
		);
		expect(cmd).toBeDefined();
		if (cmd && "debugStats" in cmd && cmd.debugStats) {
			expect(cmd.debugStats.messageValence).toBe(0.05);
			expect(cmd.debugStats.messageArousal).toBe(0.03);
			expect(cmd.debugStats.classificationLabel).toBe("FUTILE");
			expect(cmd.debugStats.emotionStateValence).toBeDefined();
			expect(cmd.debugStats.emotionStateArousal).toBeDefined();
		}
	}
});

test("streaming sends a typing command", async () => {
	const sentCommands: OutCommand[] = [];
	brain.registerClient("jade", "1140621041543155803", "Kalupso");
	await brain.handleEvent(msg("hello", { id: "m3" }), (cmd) =>
		sentCommands.push(cmd),
	);

	const typingCmd = sentCommands.find((c) => c.type === "typing");
	expect(typingCmd).toBeDefined();
});

test("emotion state persists across events", async () => {
	brain.registerClient("jade", "1140621041543155803", "Kalupso");
	await brain.handleEvent(msg("first", { debug: true, id: "m1" }), () => {});
	const decisions = await brain.handleEvent(
		msg("second", { debug: true, id: "m2" }),
		() => {},
	);

	if (decisions[0].type === "respond") {
		const cmd = decisions[0].commands.find(
			(c): c is OutCommand & { type: "respond" } => c.type === "respond",
		);
		if (cmd && "debugStats" in cmd && cmd.debugStats) {
			expect(cmd.debugStats.emotionStateValence).toBeGreaterThan(0);
		}
	}
});

test("handleEvent is called twice with different messages", async () => {
	brain.registerClient("jade", "1140621041543155803", "Kalupso");
	await brain.handleEvent(msg("first", { id: "m1" }), () => {});
	await brain.handleEvent(msg("second", { id: "m2" }), () => {});
	expect(fetchMock).toHaveBeenCalledTimes(2);
});
