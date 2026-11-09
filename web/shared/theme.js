// Applies the theme chosen in Beállítások (dark is the default).
// Loaded WITHOUT defer in the <head> of every page, so light mode is set before
// anything is drawn (no dark flash). The styles are in theme.css.

function applyTheme(theme) {
	const light = theme === "light";
	if (light) document.documentElement.dataset.theme = "light";
	else delete document.documentElement.dataset.theme;
	// The phone's status / navigation bar area follows the theme too
	if (typeof Android !== "undefined" && typeof Android.setLightTheme === "function") {
		Android.setLightTheme(light);
	}
}

function savedTheme() {
	try {
		return localStorage.getItem("theme") === "light" ? "light" : "dark";
	} catch {
		return "dark";
	}
}

applyTheme(savedTheme());
