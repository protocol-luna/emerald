import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "./config";
import { EmeraldServer } from "./server";

const configPath = existsSync(join(process.cwd(), "config.yml"))
	? join(process.cwd(), "config.yml")
	: undefined;
const config = loadConfig(configPath);
const server = new EmeraldServer(config);
server.start();

process.on("SIGINT", () => {
	console.log("[Emerald] Shutting down...");
	server.stop();
	process.exit(0);
});

process.on("SIGTERM", () => {
	console.log("[Emerald] Shutting down...");
	server.stop();
	process.exit(0);
});
