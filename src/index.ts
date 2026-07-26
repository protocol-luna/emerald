import { loadConfig } from "./config"
import { EmeraldServer } from "./server"

const config = loadConfig()
const server = new EmeraldServer(config)
server.start()

process.on("SIGINT", () => {
  console.log("[Emerald] Shutting down...")
  server.stop()
  process.exit(0)
})

process.on("SIGTERM", () => {
  console.log("[Emerald] Shutting down...")
  server.stop()
  process.exit(0)
})
