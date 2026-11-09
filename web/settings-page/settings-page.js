// Beállítások: theme (dark / light) and the time of the exam reminders.
// `inApp` and `callNative` come from ../shared/menu.js, `applyTheme` / `savedTheme` from ../shared/theme.js

// ===== Theme =====
const themeButtons = document.querySelectorAll("[data-theme-choice]");

function showThemeChoice(theme) {
	themeButtons.forEach(button => {
		button.setAttribute("aria-checked", button.dataset.themeChoice === theme);
	});
}

themeButtons.forEach(button => {
	button.addEventListener("click", () => {
		const theme = button.dataset.themeChoice;
		try {
			localStorage.setItem("theme", theme);
		} catch {
			// not saved, but still applied on this page
		}
		applyTheme(theme);
		showThemeChoice(theme);
	});
});

showThemeChoice(savedTheme());

// ===== Exam reminder time =====
// In a desktop browser (Live Server) the time is kept in localStorage instead
const PREVIEW_REMINDER_KEY = "previewReminderTime";

const hourSelect = document.getElementById("reminderHour");
const minuteSelect = document.getElementById("reminderMinute");

// Always 24-hour: 00-23 and 00-59
const pad = n => String(n).padStart(2, "0");
for (let hour = 0; hour < 24; hour++) hourSelect.append(new Option(pad(hour), pad(hour)));
for (let minute = 0; minute < 60; minute++) minuteSelect.append(new Option(pad(minute), pad(minute)));

const reminderSaved = document.getElementById("reminderSaved");

async function loadReminderTime() {
	if (inApp) return (await callNative("getSettings")).reminderTime;
	try {
		return localStorage.getItem(PREVIEW_REMINDER_KEY) || "13:00";
	} catch {
		return "13:00";
	}
}

async function saveReminderTime(time) {
	if (inApp) return callNative("setReminderTime", time);
	try {
		localStorage.setItem(PREVIEW_REMINDER_KEY, time);
		return true;
	} catch {
		return false;
	}
}

async function onTimeChange() {
	const time = `${hourSelect.value}:${minuteSelect.value}`; // "HH:MM"
	const saved = await saveReminderTime(time);
	reminderSaved.hidden = false;
	reminderSaved.classList.toggle("failed", !saved);
	reminderSaved.textContent = saved
		? `Mentve: az emlékeztetők mostantól ${time.replace(/^0/, "")}-kor jönnek (a már felvett dolgozatoknál is).`
		: "Nem sikerült menteni. Próbáld újra.";
}

hourSelect.addEventListener("change", onTimeChange);
minuteSelect.addEventListener("change", onTimeChange);

loadReminderTime().then(time => {
	[hourSelect.value, minuteSelect.value] = time.split(":");
});
