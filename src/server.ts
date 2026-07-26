import { WebSocket, WebSocketServer } from "ws";
import { Brain } from "./brain";
import type { EmeraldConfig } from "./config";
import type { InEvent, OutCommand, WsMessage } from "./protocol";

type BotConnection = {
	ws: WebSocket;
	clientId: string;
};

export class EmeraldServer {
	private wss: WebSocketServer;
	private brain: Brain;
	private connections = new Map<string, BotConnection>();

	constructor(config: EmeraldConfig) {
		this.brain = new Brain(config);
		this.wss = new WebSocketServer({ port: config.port });
	}

	start() {
		this.brain.start();

		this.wss.on("connection", (ws) => {
			let clientId = "";

			ws.on("message", (raw) => {
				try {
					const data = JSON.parse(raw.toString());
					if (data.event !== "in") return;

					const event = data.payload as InEvent;
					if (event.type === "ready") {
						clientId = event.client;
						this.connections.set(clientId, { ws, clientId });
						console.log(`[Emerald] ${clientId} connected (${event.userId})`);
					}

					this.brain.handleEvent(event);
				} catch (err) {
					console.error("[Emerald] Error handling event:", err);
				}
			});

			ws.on("close", () => {
				if (clientId) {
					this.brain.unregisterClient(clientId);
					this.connections.delete(clientId);
					console.log(`[Emerald] ${clientId} disconnected`);
				}
			});

			ws.on("error", (err) => {
				console.error("[Emerald] WebSocket error:", err);
			});

			ws.send(JSON.stringify({ event: "connected" }));
		});

		const addr = this.wss.address();
		const port =
			typeof addr === "string"
				? parseInt(addr.split(":")[1], 10)
				: (addr?.port ?? "(unknown)");
		console.log(`[Emerald] Server listening on port ${port}`);
	}

	stop() {
		this.brain.stop();
		this.wss.close();
	}

	sendCommand(clientId: string, command: OutCommand) {
		const conn = this.connections.get(clientId);
		if (!conn || conn.ws.readyState !== WebSocket.OPEN) return;

		const msg: WsMessage = { event: "command", command };
		conn.ws.send(JSON.stringify(msg));
	}

	broadcastCommand(command: OutCommand) {
		for (const [clientId] of this.connections) {
			this.sendCommand(clientId, command);
		}
	}
}
