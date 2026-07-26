import WebSocket from "ws"
import { ClientId, InEvent, OutCommand } from "./protocol"

export type ClientOptions = {
  host?: string
  port?: number
  reconnectInterval?: number
  maxReconnectAttempts?: number
}

export type CommandHandler = (command: OutCommand) => void

export class EmeraldClient {
  private ws: WebSocket | null = null
  private clientId: ClientId
  private userId = ""
  private username = ""
  private host: string
  private port: number
  private reconnectInterval: number
  private maxReconnectAttempts: number
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private commandHandler: CommandHandler | null = null
  private onConnected: (() => void) | null = null
  private onDisconnected: (() => void) | null = null
  private shouldReconnect = true

  constructor(clientId: ClientId, options: ClientOptions = {}) {
    this.clientId = clientId
    this.host = options.host ?? "127.0.0.1"
    this.port = options.port ?? 3126
    this.reconnectInterval = options.reconnectInterval ?? 3000
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? Infinity
  }

  setUserId(userId: string, username: string) {
    this.userId = userId
    this.username = username
  }

  onCommand(handler: CommandHandler) {
    this.commandHandler = handler
  }

  onConnect(cb: () => void) {
    this.onConnected = cb
  }

  onDisconnect(cb: () => void) {
    this.onDisconnected = cb
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return

    const url = `ws://${this.host}:${this.port}`
    this.ws = new WebSocket(url)

    this.ws.on("open", () => {
      this.reconnectAttempts = 0
      this.send({ event: "in", payload: { type: "ready", client: this.clientId, userId: this.userId, username: this.username } })
      this.onConnected?.()
    })

    this.ws.on("message", (raw) => {
      try {
        const data = JSON.parse(raw.toString())
        if (data.event === "command") {
          this.commandHandler?.(data.command as OutCommand)
        }
      } catch (err) {
        console.error(`[EmeraldClient] Error parsing message:`, err)
      }
    })

    this.ws.on("close", () => {
      this.onDisconnected?.()
      if (this.shouldReconnect) this.scheduleReconnect()
    })

    this.ws.on("error", () => {
      // handled by close
    })
  }

  disconnect() {
    this.shouldReconnect = false
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
  }

  sendEvent(event: InEvent) {
    this.send({ event: "in", payload: event })
  }

  private send(data: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return
    this.reconnectAttempts++

    this.reconnectTimer = setTimeout(() => {
      console.log(`[EmeraldClient] Reconnecting (attempt ${this.reconnectAttempts})...`)
      this.connect()
    }, this.reconnectInterval)
  }
}
