import Database from "better-sqlite3";
import type BetterSqlite3 from "better-sqlite3";

type DB = BetterSqlite3.Database;

export type EmotionRow = {
	key: string;
	valence: number;
	arousal: number;
	updated_at: number;
};

export class EmeraldDB {
	private db: DB;
	private insertStmt;
	private loadAllStmt;
	private loadOneStmt;
	private pruneStmt;

	constructor(path: string) {
		this.db = new Database(path);
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS emotion_state (
				key TEXT PRIMARY KEY,
				valence REAL NOT NULL DEFAULT 0,
				arousal REAL NOT NULL DEFAULT 0,
				updated_at INTEGER NOT NULL DEFAULT (unixepoch())
			)
		`);
		this.insertStmt = this.db.prepare(`
			INSERT INTO emotion_state (key, valence, arousal, updated_at)
			VALUES (?1, ?2, ?3, unixepoch())
			ON CONFLICT(key) DO UPDATE SET
				valence = ?2,
				arousal = ?3,
				updated_at = unixepoch()
		`);
		this.loadAllStmt = this.db.prepare("SELECT key, valence, arousal FROM emotion_state");
		this.loadOneStmt = this.db.prepare(
			"SELECT valence, arousal FROM emotion_state WHERE key = ?1",
		);
		this.pruneStmt = this.db.prepare(
			"DELETE FROM emotion_state WHERE updated_at < unixepoch() - ?1",
		);
	}

	saveEmotion(key: string, valence: number, arousal: number): void {
		this.insertStmt.run(key, valence, arousal);
	}

	loadEmotion(key: string): { valence: number; arousal: number } | null {
		const row = this.loadOneStmt.get(key) as { valence: number; arousal: number } | null;
		return row ?? null;
	}

	loadAllEmotions(): Map<string, { valence: number; arousal: number }> {
		const rows = this.loadAllStmt.all() as EmotionRow[];
		const map = new Map<string, { valence: number; arousal: number }>();
		for (const r of rows) {
			map.set(r.key, { valence: r.valence, arousal: r.arousal });
		}
		return map;
	}

	prune(maxAgeSeconds: number): void {
		this.pruneStmt.run(maxAgeSeconds);
	}

	close(): void {
		this.db.close();
	}
}
