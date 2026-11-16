const inApp = typeof Android !== "undefined";

const pending = new Map();
let nextCallId = 0;

function callNative(method, ...args) {
	return new Promise(resolve => {
		const callId = String(++nextCallId);
		pending.set(callId, resolve);
		Android[method](callId, ...args);
	});
}

window.onNativeResult = (callId, result) => {
	pending.get(String(callId))?.(result);
	pending.delete(String(callId));
};

const sessionReady = inApp ? callNative("getSession") : Promise.resolve(null);

sessionReady.then(session => {
	if (inApp && !session) {
		location.replace("../login-page/login.html");
	} else if (session) {
		document.getElementById("navUsername").textContent = session.displayName;
	}
});

const menuToggle = document.getElementById("menuToggle");
const sideMenu = document.getElementById("sideMenu");
const menuBackdrop = document.getElementById("menuBackdrop");

function setMenu(open) {
	sideMenu.classList.toggle("open", open);
	menuBackdrop.classList.toggle("open", open);
	menuToggle.setAttribute("aria-expanded", open);
	sideMenu.setAttribute("aria-hidden", !open);
}

menuToggle.addEventListener("click", () => {
	setMenu(!sideMenu.classList.contains("open"));
});

menuBackdrop.addEventListener("click", () => setMenu(false));
sideMenu.querySelectorAll("a").forEach(link =>
	link.addEventListener("click", () => setMenu(false))
);

document.querySelectorAll('[data-action="logout"]').forEach(el =>
	el.addEventListener("click", event => {
		event.preventDefault();
		(inApp ? callNative("logout") : Promise.resolve()).then(() => {
			location.replace("../login-page/login.html");
		});
	})
);
document.addEventListener("keydown", e => {
	if (e.key === "Escape") setMenu(false);
});

const MENU_GAP = 20;

let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
let dragX = 0;
let tracking = false;
let opening = false;
let direction = null;

function onTouchStart(e) {
	if (e.touches.length !== 1 || document.body.classList.contains("modal-open")) return;
	touchStartX = e.touches[0].clientX;
	touchStartY = e.touches[0].clientY;
	touchStartTime = Date.now();
	dragX = 0;
	direction = null;
	opening = !sideMenu.classList.contains("open");
	tracking = true;
}

function onTouchMove(e) {
	if (!tracking) return;
	const dx = e.touches[0].clientX - touchStartX;
	const dy = e.touches[0].clientY - touchStartY;

	if (direction === null) {
		if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
		direction = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
		if (direction === "x" && (opening ? dx < 0 : dx > 0)) direction = "y";
		if (direction === "x") {
			sideMenu.style.transition = "none";
			menuBackdrop.style.transition = "none";
		}
	}
	if (direction !== "x") return;

	e.preventDefault();
	dragX = dx;
	const width = sideMenu.offsetWidth + MENU_GAP;
	const x = opening
		? Math.min(0, -width + Math.max(0, dx))
		: Math.max(-width, Math.min(0, dx));
	sideMenu.style.transform = `translateX(${x}px)`;
	menuBackdrop.style.opacity = 1 + x / width;
}

function onTouchEnd() {
	if (!tracking) return;
	tracking = false;
	if (direction !== "x") return;

	sideMenu.style.transition = "";
	menuBackdrop.style.transition = "";
	sideMenu.style.transform = "";
	menuBackdrop.style.opacity = "";

	const distance = opening ? dragX : -dragX;
	const speed = distance / Math.max(1, Date.now() - touchStartTime);
	if (distance > sideMenu.offsetWidth / 3 || (speed > 0.5 && distance > 30)) {
		setMenu(opening);
	}
}

document.addEventListener("touchstart", onTouchStart, { passive: true });
document.addEventListener("touchmove", onTouchMove, { passive: false });
document.addEventListener("touchend", onTouchEnd);
document.addEventListener("touchcancel", onTouchEnd);
