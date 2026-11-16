function applyTheme(theme) {
	const light = theme === "light";
	if (light) document.documentElement.dataset.theme = "light";
	else delete document.documentElement.dataset.theme;
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
