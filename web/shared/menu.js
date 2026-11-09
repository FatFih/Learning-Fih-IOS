// Top bar + side menu shared by every page after login (main page, calendar, settings).
// Load it before the page's own script; the page scripts can use `inApp`, `callNative`
// and `sessionReady` (a Promise of the logged-in user, or null).

// The Android bridge only exists inside the app. In a desktop browser (Live Server)
// the Android calls are skipped, so the pages still work for previewing.
const inApp = typeof Android !== "undefined";

// ===== Talking to Android =====
// Android answers later through window.onNativeResult; callNative turns that into a Promise
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

// Who is logged in: {username, displayName} or null. On iOS the app answers later,
// so pages wait for this Promise instead of asking synchronously.
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

// Close when tapping outside, picking an option, or pressing Escape
menuBackdrop.addEventListener("click", () => setMenu(false));
sideMenu.querySelectorAll("a").forEach(link =>
	link.addEventListener("click", () => setMenu(false))
);

// Every element with data-action="logout" (menu item, page buttons) logs out
document.querySelectorAll('[data-action="logout"]').forEach(el =>
	el.addEventListener("click", event => {
		event.preventDefault();
		// Wait until the app has forgotten the session, or the login page would send us back
		(inApp ? callNative("logout") : Promise.resolve()).then(() => {
			location.replace("../login-page/login.html");
		});
	})
);
document.addEventListener("keydown", e => {
	if (e.key === "Escape") setMenu(false);
});

// Swipe gestures (phones):
//  - swipe right anywhere while the menu is closed to pull it out
//  - swipe left while it is open to push it back
// The panel follows the finger; letting go past a third of its width
// (or a quick flick) finishes the move, otherwise it springs back.
const MENU_GAP = 20; // matches the "calc(-100% - 20px)" hidden position in main.css

let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
let dragX = 0;
let tracking = false;
let opening = false;  // true = pulling the menu out, false = pushing it back
let direction = null; // "x" = swiping sideways, "y" = scrolling, null = not decided yet

function onTouchStart(e) {
	// Pages add "modal-open" to <body> while a popup is shown; no menu swipes then
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

	// Wait for a few pixels of movement to tell a sideways swipe from a scroll
	if (direction === null) {
		if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
		direction = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
		// Only react to swipes in the useful direction
		if (direction === "x" && (opening ? dx < 0 : dx > 0)) direction = "y";
		if (direction === "x") {
			// Follow the finger directly, without the CSS animation
			sideMenu.style.transition = "none";
			menuBackdrop.style.transition = "none";
		}
	}
	if (direction !== "x") return;

	e.preventDefault();
	dragX = dx;
	const width = sideMenu.offsetWidth + MENU_GAP;
	// Panel position: -width = fully hidden, 0 = fully open
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

	// Hand control back to the CSS classes; the transition animates from where the finger let go
	sideMenu.style.transition = "";
	menuBackdrop.style.transition = "";
	sideMenu.style.transform = "";
	menuBackdrop.style.opacity = "";

	const distance = opening ? dragX : -dragX;
	const speed = distance / Math.max(1, Date.now() - touchStartTime); // px per ms
	if (distance > sideMenu.offsetWidth / 3 || (speed > 0.5 && distance > 30)) {
		setMenu(opening);
	}
}

document.addEventListener("touchstart", onTouchStart, { passive: true });
document.addEventListener("touchmove", onTouchMove, { passive: false });
document.addEventListener("touchend", onTouchEnd);
document.addEventListener("touchcancel", onTouchEnd);
