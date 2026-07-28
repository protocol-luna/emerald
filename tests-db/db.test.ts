import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { unlinkSync, existsSync } from "node:fs";
import { EmeraldDB } from "../src/db";

const TEST_DB = "/tmp/emerald-test.db";
let db: EmeraldDB;

beforeEach(() => {
	if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
	db = new EmeraldDB(TEST_DB);
});

afterEach(() => {
	db.close();
	if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

describe("EmeraldDB", () => {
	it("loadAllEmotions returns empty for fresh DB", () => {
		const all = db.loadAllEmotions();
		assert.equal(all.size, 0);
	});

	it("save and load emotion", () => {
		db.saveEmotion("session:x", 0.5, -0.3);
		const row = db.loadEmotion("session:x");
		assert.notEqual(row, null);
		assert.equal(typeof row, "object");
		if (row) {
			assert.equal(row.valence, 0.5);
			assert.equal(row.arousal, -0.3);
		}
	});

	it("load unknown key returns null", () => {
		const row = db.loadEmotion("session:nonexistent");
		assert.equal(row, null);
	});

	it("update existing key", () => {
		db.saveEmotion("session:x", 0.5, -0.3);
		db.saveEmotion("session:x", 0.1, 0.2);
		const row = db.loadEmotion("session:x");
		assert.notEqual(row, null);
		if (row) {
			assert.equal(row.valence, 0.1);
			assert.equal(row.arousal, 0.2);
		}
	});

	it("loadAllEmotions returns all entries", () => {
		db.saveEmotion("session:a", 0.1, 0.2);
		db.saveEmotion("session:b", -0.3, 0.4);
		const all = db.loadAllEmotions();
		assert.equal(all.size, 2);
		assert.equal(all.get("session:a")?.valence, 0.1);
		assert.equal(all.get("session:b")?.arousal, 0.4);
	});

	it("prune removes entries inserted before the cutoff", () => {
		db.saveEmotion("session:a", 0.1, 0.2);
		// Manually age session:a via raw SQL
		(db as any).db.prepare(
			"UPDATE emotion_state SET updated_at = 1000000 WHERE key = 'session:a'",
		).run();
		db.saveEmotion("session:b", -0.3, 0.4);
		// Prune entries older than cutoff
		db.prune(99999999);
		const all = db.loadAllEmotions();
		assert.equal(all.size, 1);
		assert.equal(all.get("session:b")?.valence, -0.3);
	});

	it("prune keeps recent entries", () => {
		db.saveEmotion("session:a", 0.1, 0.2);
		db.saveEmotion("session:b", -0.3, 0.4);
		db.prune(86400);
		const all = db.loadAllEmotions();
		assert.equal(all.size, 2);
	});
});
