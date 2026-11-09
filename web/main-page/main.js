// `inApp`, `callNative` and `sessionReady` come from ../shared/menu.js
const MONTHS = ["január", "február", "március", "április", "május", "június",
	"július", "augusztus", "szeptember", "október", "november", "december"];
const DAY_NAMES = ["vasárnap", "hétfő", "kedd", "szerda", "csütörtök", "péntek", "szombat"]; // Date.getDay() order

sessionReady.then(session => {
	if (session) document.getElementById("welcomeMessage").textContent = `Üdv, ${session.displayName}!`;
});

function isoDate(date) {
	const pad = n => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function loadExams() {
	if (inApp) return (await callNative("getTimetable"))?.exams || [];
	// Live Server preview: the calendar page keeps its exams in localStorage
	try {
		return JSON.parse(localStorage.getItem("previewExams")) || [];
	} catch {
		return [];
	}
}

// Card for one exam. A lone card says "Következő dolgozat"; in the grid the countdown is enough.
function examCard(exam, single) {
	const [year, month, day] = exam.date.split("-").map(Number);
	const date = new Date(year, month - 1, day);
	const now = new Date();
	const daysLeft = Math.round((date - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);

	const card = document.createElement("a");
	card.className = "exam-card";
	card.href = `../calendar-page/calendar-page.html?date=${exam.date}`;

	const top = span("exam-card-top");
	if (single) top.append(span("exam-label", "Következő dolgozat"));
	top.append(span("exam-countdown", daysLeft === 0 ? "Ma" : daysLeft === 1 ? "Holnap" : `${daysLeft} nap múlva`));

	// "november 11., szerda · 1. óra" - the period goes on its own line in the grid (main.css)
	const when = span("exam-when", `${MONTHS[month - 1]} ${day}., ${DAY_NAMES[date.getDay()]}`);
	when.append(span("exam-period", `${exam.period}. óra`));

	card.append(top, span("exam-subject", exam.subject), when);
	if (exam.details) card.append(span("exam-details", exam.details));
	return card;
}

function span(className, text) {
	const element = document.createElement("span");
	element.className = className;
	if (text !== undefined) element.textContent = text;
	return element;
}

// Every exam from today on (today's included), nearest first:
// top left, top right, then the next row, and so on
async function showExams() {
	const today = isoDate(new Date());
	const upcoming = (await loadExams())
		.filter(exam => exam.date >= today)
		.sort((a, b) => a.date.localeCompare(b.date) || a.period - b.period);

	if (!upcoming.length) {
		document.getElementById("noExam").hidden = false;
		return;
	}

	const single = upcoming.length === 1;
	const grid = document.getElementById("examGrid");
	grid.classList.toggle("single", single);
	grid.replaceChildren(...upcoming.map(exam => examCard(exam, single)));
	grid.hidden = false;
	document.getElementById("examGridTitle").hidden = single;
}

showExams();
