const AZERTY: Record<string, string[]> = {
	a: ["z", "q"],
	z: ["a", "e"],
	e: ["z", "r"],
	r: ["e", "t"],
	t: ["r", "y"],
	y: ["t", "u"],
	u: ["y", "i"],
	i: ["u", "o"],
	o: ["i", "p"],
	p: ["o"],
	q: ["a", "s"],
	s: ["q", "d"],
	d: ["s", "f"],
	f: ["d", "g"],
	g: ["f", "h"],
	h: ["g", "j"],
	j: ["h", "k"],
	k: ["j", "l"],
	l: ["k", "m"],
	m: ["l"],
	w: ["x", "c"],
	x: ["w", "c"],
	c: ["x", "v"],
	v: ["c", "b"],
	b: ["v", "n"],
	n: ["b", ","],
};

const QWERTY: Record<string, string[]> = {
	q: ["w", "a"],
	w: ["q", "e"],
	e: ["w", "r"],
	r: ["e", "t"],
	t: ["r", "y"],
	y: ["t", "u"],
	u: ["y", "i"],
	i: ["u", "o"],
	o: ["i", "p"],
	p: ["o"],
	a: ["q", "s"],
	s: ["a", "d"],
	d: ["s", "f"],
	f: ["d", "g"],
	g: ["f", "h"],
	h: ["g", "j"],
	j: ["h", "k"],
	k: ["j", "l"],
	l: ["k"],
	z: ["x"],
	x: ["z", "c"],
	c: ["x", "v"],
	v: ["c", "b"],
	b: ["v", "n"],
	n: ["b", "m"],
	m: ["n"],
};

const LAYOUTS = { azerty: AZERTY, qwerty: QWERTY };

export function applyTypo(
	text: string,
	layout: "azerty" | "qwerty",
): { text: string; original: string; corrected: string } | null {
	const words = text.split(/\s+/);
	const candidates = words.filter((w) => /^[a-zA-Z]{2,}$/.test(w));
	if (candidates.length === 0) return null;

	const target = candidates[Math.floor(Math.random() * candidates.length)];
	const keymap = LAYOUTS[layout];
	if (!keymap) return null;

	const chars = target.split("");
	const indices: number[] = [];
	for (let i = 0; i < chars.length; i++) {
		const lower = chars[i].toLowerCase();
		if (keymap[lower]) indices.push(i);
	}
	if (indices.length === 0) return null;

	const idx = indices[Math.floor(Math.random() * indices.length)];
	const originalChar = chars[idx].toLowerCase();
	const neighbors = keymap[originalChar];
	if (!neighbors || neighbors.length === 0) return null;

	const neighbor = neighbors[Math.floor(Math.random() * neighbors.length)];
	const isUpper = chars[idx] === chars[idx].toUpperCase();
	chars[idx] = isUpper ? neighbor.toUpperCase() : neighbor;

	const corrected = target;
	const typoText = chars.join("");
	const result = text.replace(target, typoText);

	return { text: result, original: corrected, corrected: typoText };
}

export function applyLetterSwap(
	text: string,
): { text: string; original: string; corrected: string } | null {
	const words = text.split(/\s+/);
	const candidates = words.filter((w) => /^[a-zA-Z]{3,}$/.test(w));
	if (candidates.length === 0) return null;

	const target = candidates[Math.floor(Math.random() * candidates.length)];
	const chars = target.split("");
	const idx = Math.floor(Math.random() * (chars.length - 1));
	const temp = chars[idx];
	chars[idx] = chars[idx + 1];
	chars[idx + 1] = temp;

	const swapped = chars.join("");
	const result = text.replace(target, swapped);

	return { text: result, original: target, corrected: swapped };
}
