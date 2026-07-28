import { test, expect, beforeEach } from "bun:test";
import { EmotionState } from "../src/behavior/emotion-state";

let state: EmotionState;

beforeEach(() => {
	state = new EmotionState(null, 0.85, 0.01);
});

test("starts at zero for unknown key", () => {
	const s = state.get("session:x");
	expect(s.valence).toBe(0);
	expect(s.arousal).toBe(0);
});

test("single update applies EMA with decay", () => {
	const r = state.update("session:x", 0.2, 0.4);
	expect(r.valence).toBeCloseTo(0.03, 5); // 0 * 0.85 + 0.2 * 0.15
	expect(r.arousal).toBeCloseTo(0.06, 5);
});

test("get returns same as update result", () => {
	state.update("session:x", 0.1, 0.2);
	const s = state.get("session:x");
	expect(s.valence).toBeCloseTo(0.015, 5);
	expect(s.arousal).toBeCloseTo(0.03, 5);
});

test("successive updates accumulate with decay", () => {
	state.update("session:x", 0.2, 0.0);
	state.update("session:x", 0.2, 0.0);
	const s = state.get("session:x");
	const step1 = 0.2 * 0.15;
	const step2 = step1 * 0.85 + 0.2 * 0.15;
	expect(s.valence).toBeCloseTo(step2, 5);
	expect(s.arousal).toBe(0);
});

test("decay toward zero with no signal", () => {
	state.update("session:x", 1.0, 1.0);
	for (let i = 0; i < 20; i++) {
		state.update("session:x", 0, 0);
	}
	const s = state.get("session:x");
	expect(s.valence).toBeLessThan(0.01);
	expect(s.arousal).toBeLessThan(0.01);
});

test("deadzone zeros small valences", () => {
	const r = state.update("session:x", 0.005, 0.3);
	expect(r.valence).toBe(0); // 0.005 < 0.01 deadzone
	expect(r.arousal).toBeCloseTo(0.045, 5);
});

test("deadzone zeros small arousals", () => {
	const r = state.update("session:x", 0.3, 0.005);
	expect(r.valence).toBeCloseTo(0.045, 5);
	expect(r.arousal).toBe(0);
});

test("different keys are independent", () => {
	state.update("session:a", 0.5, 0.1);
	state.update("session:b", -0.3, 0.2);
	const a = state.get("session:a");
	const b = state.get("session:b");
	expect(a.valence).toBeGreaterThan(0);
	expect(b.valence).toBeLessThan(0);
});

test("negative values work correctly", () => {
	const r = state.update("session:x", -0.4, -0.2);
	expect(r.valence).toBeCloseTo(-0.06, 5);
	expect(r.arousal).toBeCloseTo(-0.03, 5);
});

test("steady state equals constant input", () => {
	for (let i = 0; i < 100; i++) {
		state.update("session:x", 0.1, 0.2);
	}
	const s = state.get("session:x");
	expect(s.valence).toBeCloseTo(0.1, 2);
	expect(s.arousal).toBeCloseTo(0.2, 2);
});
