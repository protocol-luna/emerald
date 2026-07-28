import { test, expect } from "bun:test";

// Replicate the modulation formulas from brain.ts for isolated testing

function emoIgnoreBonus(valence: number): number {
	return Math.max(0, -valence * 3);
}

function emoForgetBonus(valence: number): number {
	return Math.max(0, -valence * 2);
}

function emoDelayMult(arousal: number): number {
	return Math.max(0.5, 1.0 - arousal * 2.5);
}

function emoHesitationMult(arousal: number): number {
	return Math.max(0.5, 1.0 + arousal * 4);
}

function emoBurstMult(arousal: number): number {
	return Math.max(0.5, 1.0 + arousal * 4);
}

function emoTypoMult(arousal: number): number {
	return Math.max(0.5, 1.0 + arousal * 3);
}

test("ignore bonus: positive valence gives nothing", () => {
	expect(emoIgnoreBonus(0.1)).toBe(0);
	expect(emoIgnoreBonus(0.0)).toBe(0);
});

test("ignore bonus: negative valence gives scaled bonus", () => {
	expect(emoIgnoreBonus(-0.05)).toBeCloseTo(0.15, 5);
	expect(emoIgnoreBonus(-0.1)).toBeCloseTo(0.3, 5);
});

test("forget bonus: positive valence gives nothing", () => {
	expect(emoForgetBonus(0.05)).toBe(0);
});

test("forget bonus: negative valence gives scaled bonus", () => {
	expect(emoForgetBonus(-0.1)).toBeCloseTo(0.2, 5);
});

test("delay mult: zero arousal gives 1.0", () => {
	expect(emoDelayMult(0)).toBe(1.0);
});

test("delay mult: high arousal reduces delay", () => {
	expect(emoDelayMult(0.1)).toBeCloseTo(0.75, 5);
	expect(emoDelayMult(0.2)).toBeCloseTo(0.5, 5);
});

test("delay mult: clamped at 0.5 minimum", () => {
	expect(emoDelayMult(1.0)).toBe(0.5);
});

test("hesitation mult: zero arousal gives 1.0", () => {
	expect(emoHesitationMult(0)).toBe(1.0);
});

test("hesitation mult: high arousal increases hesitation", () => {
	expect(emoHesitationMult(0.1)).toBeCloseTo(1.4, 5);
});

test("hesitation mult: clamped at 0.5 minimum", () => {
	expect(emoHesitationMult(-1.0)).toBe(0.5);
});

test("burst mult is same as hesitation", () => {
	expect(emoBurstMult(0.1)).toBe(emoHesitationMult(0.1));
});

test("typo mult: high arousal increases typo chance", () => {
	expect(emoTypoMult(0.1)).toBeCloseTo(1.3, 5);
});

test("all modulations: neutral state gives baseline", () => {
	const v = 0.01;
	const a = 0.01;
	expect(emoIgnoreBonus(v)).toBe(0);
	expect(emoForgetBonus(v)).toBe(0);
	expect(emoDelayMult(a)).toBeCloseTo(0.975, 5);
	expect(emoHesitationMult(a)).toBeCloseTo(1.04, 5);
	expect(emoBurstMult(a)).toBeCloseTo(1.04, 5);
	expect(emoTypoMult(a)).toBeCloseTo(1.03, 5);
});

test("all modulations: strong emotion gives noticeable effect", () => {
	const v = -0.1;
	const a = 0.15;
	expect(emoIgnoreBonus(v)).toBeCloseTo(0.3, 5);
	expect(emoForgetBonus(v)).toBeCloseTo(0.2, 5);
	expect(emoDelayMult(a)).toBeCloseTo(0.625, 5);
	expect(emoHesitationMult(a)).toBeCloseTo(1.6, 5);
	expect(emoBurstMult(a)).toBeCloseTo(1.6, 5);
	expect(emoTypoMult(a)).toBeCloseTo(1.45, 5);
});
