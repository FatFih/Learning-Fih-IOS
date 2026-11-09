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

// Shows the nearest exam from today on (today's included)
async function showNextExam() {
	const today = isoDate(new Date());
	const upcoming = (await loadExams())
		.filter(exam => exam.date >= today)
		.sort((a, b) => a.date.localeCompare(b.date) || a.period - b.period);

	if (!upcoming.length) {
		document.getElementById("noExam").hidden = false;
		return;
	}

	const exam = upcoming[0];
	const [year, month, day] = exam.date.split("-").map(Number);
	const date = new Date(year, month - 1, day);
	const now = new Date();
	const daysLeft = Math.round((date - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);

	document.getElementById("nextExamCountdown").textContent =
		daysLeft === 0 ? "Ma" : daysLeft === 1 ? "Holnap" : `${daysLeft} nap múlva`;
	document.getElementById("nextExamSubject").textContent = exam.subject;
	document.getElementById("nextExamWhen").textContent =
		`${MONTHS[month - 1]} ${day}., ${DAY_NAMES[date.getDay()]} · ${exam.period}. óra`;

	const details = document.getElementById("nextExamDetails");
	details.textContent = exam.details;
	details.hidden = !exam.details;

	const more = document.getElementById("nextExamMore");
	more.textContent = `+ még ${upcoming.length - 1} közelgő dolgozat`;
	more.hidden = upcoming.length < 2;

	const card = document.getElementById("nextExam");
	card.href = `../calendar-page/calendar-page.html?date=${exam.date}`;
	card.hidden = false;
}

showNextExam();
