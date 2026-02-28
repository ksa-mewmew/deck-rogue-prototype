import type { GameState } from "../../engine/types";
import { applySlotCardScale } from "../slots";

let postLayoutScheduled = false;

export function scaleAllSlotCards() {
	document.querySelectorAll<HTMLElement>(".slot").forEach((slot) => {
		const scaler = slot.querySelector<HTMLElement>(".slotCardScaler");
		if (scaler) applySlotCardScale(slot, scaler);
	});
}

export function schedulePostLayout(g: GameState) {
	if (postLayoutScheduled) return;
	postLayoutScheduled = true;
	requestAnimationFrame(() => {
		postLayoutScheduled = false;
		normalizeEnemyNameWidth();
		alignHandToBoardAnchor(g);
		alignEnemyHudToViewportCenter();
		scaleAllSlotCards();
	});
}

export function normalizeEnemyNameWidth() {
	const names = Array.from(document.querySelectorAll<HTMLElement>(".enemyName"));
	if (names.length === 0) return;

	let maxLen = 0;
	for (const el of names) {
		const t = (el.textContent ?? "").trim();
		if (t.length > maxLen) maxLen = t.length;
	}

	const CAP_CH = 24;
	const wch = Math.max(6, Math.min(maxLen, CAP_CH));

	names.forEach((el) => {
		el.style.display = "inline-block";
		el.style.width = `${wch}ch`;
		el.style.whiteSpace = "nowrap";
		el.style.overflow = "hidden";
		el.style.textOverflow = "ellipsis";
	});
}

export function alignHandToBoardAnchor(_g: GameState) {
	const hand = document.querySelector<HTMLElement>(".hand");
	const row = document.querySelector<HTMLElement>(".handCardsRow");
	if (!hand || !row) return;

	const slot = document.querySelector<HTMLElement>(`.slot[data-slot-side="front"][data-slot-index="1"]`);
	const stage = document.querySelector<HTMLElement>(".stageInner");
	const anchorRect = slot?.getBoundingClientRect() ?? stage?.getBoundingClientRect();
	if (!anchorRect) return;

	const anchorX = anchorRect.left + anchorRect.width / 2;

	const cards = Array.from(row.querySelectorAll<HTMLElement>(".card"));
	if (cards.length === 0) return;

	const firstR = cards[0].getBoundingClientRect();
	const lastR = cards[cards.length - 1].getBoundingClientRect();
	const contentLeftViewport = firstR.left;
	const contentRightViewport = lastR.right;
	const contentCenterViewport = (contentLeftViewport + contentRightViewport) / 2;

	const deltaViewport = anchorX - contentCenterViewport;

	const rowW = row.scrollWidth;
	const viewW = hand.clientWidth;

	if (rowW <= viewW + 1) {
		const dxvw = (deltaViewport / window.innerWidth) * 100;
		row.style.transform = `translateX(${dxvw.toFixed(4)}vw)`;
		hand.scrollLeft = 0;
		return;
	}

	let next = hand.scrollLeft - deltaViewport;

	const maxScroll = Math.max(0, rowW - viewW);
	if (next < 0) next = 0;
	if (next > maxScroll) next = maxScroll;

	hand.scrollLeft = Math.round(next);
	row.style.transform = "";
}

export function alignEnemyHudToViewportCenter() {
	if (document.body.classList.contains("mobile")) return;

	const hud = document.querySelector<HTMLElement>(".enemyHudCenter");
	if (!hud) return;

	const mover = hud.querySelector<HTMLElement>(".enemyHudCenterMover") ?? hud;
	const wrap =
		hud.querySelector<HTMLElement>(".enemyHud") ??
		hud.querySelector<HTMLElement>(".enemyStrip") ??
		mover;

	hud.style.position = "fixed";
	hud.style.top = "calc(8 * var(--u))";
	hud.style.left = "50%";
	hud.style.right = "auto";
	hud.style.overflow = "visible";

	mover.style.transform = "";
	mover.style.overflow = "visible";
	mover.style.width = "max-content";

	wrap.style.display = "flex";
	wrap.style.flexWrap = "nowrap";
	wrap.style.justifyContent = "center";
	wrap.style.alignItems = "stretch";
	wrap.style.maxWidth = "100%";
	wrap.style.overflowX = "auto";

	const banners = Array.from(hud.querySelectorAll<HTMLElement>(".enemyBanner"));
	if (banners.length === 0) {
		hud.style.removeProperty("--enemyHudDx");
		return;
	}

	hud.style.setProperty("--enemyHudDx", "0vw");

	let sumMass = 0;
	let sumWeightedX = 0;
	for (const banner of banners) {
		const rect = banner.getBoundingClientRect();
		const mass = Math.max(1, rect.width);
		const centerX = rect.left + rect.width / 2;
		sumMass += mass;
		sumWeightedX += centerX * mass;
	}
	if (sumMass <= 0) return;

	const currentCenterOfMassX = sumWeightedX / sumMass;
	const viewportCenterX = window.innerWidth * 0.5;
	let dxPx = viewportCenterX - currentCenterOfMassX;

	const hudRect = hud.getBoundingClientRect();
	const maxLeftShiftPx = Math.max(0, hudRect.left);
	const maxRightShiftPx = Math.max(0, window.innerWidth - hudRect.right);
	if (dxPx > maxLeftShiftPx) dxPx = maxLeftShiftPx;
	if (dxPx < -maxRightShiftPx) dxPx = -maxRightShiftPx;

	const dxVw = (dxPx / Math.max(1, window.innerWidth)) * 100;
	hud.style.setProperty("--enemyHudDx", `${dxVw.toFixed(4)}vw`);
}
