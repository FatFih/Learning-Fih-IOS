// Weekly timetable (like Kréta): pick a day in the week strip to see its classes,
// edit a day's classes, and attach files to subjects.
// `inApp` and `callNative` come from ../shared/menu.js

// When each class starts and ends (1st ... 9th)
const PERIOD_TIMES = {
	1: ["7:30", "8:10"],
	2: ["8:15", "9:00"],
	3: ["9:10", "9:55"],
	4: ["10:05", "10:50"],
	5: ["11:00", "11:45"],
	6: ["12:05", "12:50"],
	7: ["13:00", "13:45"],
	8: ["13:55", "14:35"],
	9: ["14:40", "15:20"],
};
const LAST_PERIOD = 9;

// Exam reminders go off every day from this many days before the exam
// (the Android side sets them; keep in sync with ExamReminders.kt).
// The time of day is set in Beállítások and arrives with the timetable (reminderTime).
const EXAM_REMINDER_DAYS = 3;

const DAY_NAMES = ["Hétfő", "Kedd", "Szerda", "Csütörtök", "Péntek", "Szombat", "Vasárnap"];
const DAY_SHORT = ["H", "K", "Sze", "Cs", "P", "Szo", "V"];
const MONTHS = ["január", "február", "március", "április", "május", "június",
	"július", "augusztus", "szeptember", "október", "november", "december"];

const weekLabel = document.getElementById("weekLabel");
const weekDays = document.getElementById("weekDays");
const dayTitle = document.getElementById("dayTitle");
const lessonList = document.getElementById("lessonList");

const editor = document.getElementById("editor");
const editorTitle = document.getElementById("editorTitle");
const firstPeriod = document.getElementById("firstPeriod");
const editRowsList = document.getElementById("editRows");
const addLessonBtn = document.getElementById("addLesson");
const addFreeBtn = document.getElementById("addFree");
const editorError = document.getElementById("editorError");
const saveEditBtn = document.getElementById("saveEdit");
const subjectList = document.getElementById("subjectList");

const details = document.getElementById("details");
const detailTime = document.getElementById("detailTime");
const detailSubject = document.getElementById("detailSubject");
const detailRoom = document.getElementById("detailRoom");
const fileList = document.getElementById("fileList");
const fileError = document.getElementById("fileError");
const uploadBtn = document.getElementById("uploadBtn");

const examView = document.getElementById("examView");
const examDetails = document.getElementById("examDetails");
const examReminder = document.getElementById("examReminder");
const examForm = document.getElementById("examForm");
const examInput = document.getElementById("examInput");
const examEmpty = document.getElementById("examEmpty");
const examError = document.getElementById("examError");
const saveExamBtn = document.getElementById("saveExam");

// In the app everything is stored by Android. In a desktop browser (Live Server)
// the timetable is kept in localStorage instead, so the page can still be tried out.
const PREVIEW_KEY = "previewTimetable";
const PREVIEW_EXAMS_KEY = "previewExams";

function readPreview(key = PREVIEW_KEY) {
	try {
		return JSON.parse(localStorage.getItem(key)) || [];
	} catch {
		return [];
	}
}

function writePreview(key, value) {
	try {
		localStorage.setItem(key, JSON.stringify(value));
		return true;
	} catch {
		return false;
	}
}

const backend = inApp ? {
	getTimetable: () => callNative("getTimetable"),
	saveDay: (day, lessons) => callNative("saveDay", day, JSON.stringify(lessons)),
	getFiles: subject => callNative("getFiles", subject),
	pickFile: subject => callNative("pickFile", subject),
	openFile: id => callNative("openFile", id),
	deleteFile: id => callNative("deleteFile", id),
	saveExam: (date, period, subject, details) => callNative("saveExam", date, period, subject, details),
	deleteExam: id => callNative("deleteExam", id),
} : {
	getTimetable: async () => ({
		lessons: readPreview(),
		fileCounts: {},
		exams: readPreview(PREVIEW_EXAMS_KEY),
		reminderTime: (() => {
			try {
				return localStorage.getItem("previewReminderTime") || "13:00";
			} catch {
				return "13:00";
			}
		})(),
	}),
	saveDay: async (day, lessons) => {
		const others = readPreview().filter(lesson => lesson.day !== day);
		return writePreview(PREVIEW_KEY, others.concat(lessons.map(l => ({ ...l, day }))));
	},
	saveExam: async (date, period, subject, details) => {
		const others = readPreview(PREVIEW_EXAMS_KEY).filter(e => e.date !== date || e.period !== period);
		return writePreview(PREVIEW_EXAMS_KEY, others.concat({ id: Date.now(), date, period, subject, details }));
	},
	deleteExam: async id => writePreview(PREVIEW_EXAMS_KEY, readPreview(PREVIEW_EXAMS_KEY).filter(e => e.id !== id)),
	getFiles: async () => [],
	pickFile: async () => ({ ok: false, error: "Fájlt csak az alkalmazásban lehet feltölteni." }),
	openFile: async () => false,
	deleteFile: async () => false,
};

// ===== Helpers =====
function el(tag, className, text) {
	const element = document.createElement(tag);
	if (className) element.className = className;
	if (text !== undefined) element.textContent = text;
	return element;
}

function mondayOf(date) {
	const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
	return monday;
}

function addDays(date, days) {
	const result = new Date(date);
	result.setDate(result.getDate() + days);
	return result;
}

function sameDate(a, b) {
	return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// "2026-11-04" (local date, the format exams are stored with)
function isoDate(date) {
	const pad = n => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toMinutes(time) {
	const [hours, minutes] = time.split(":").map(Number);
	return hours * 60 + minutes;
}

function isNow(period, now) {
	const [start, end] = PERIOD_TIMES[period].map(toMinutes);
	const minutes = now.getHours() * 60 + now.getMinutes();
	return minutes >= start && minutes < end;
}

// Same as the Android side: files belong to the lowercased subject name
function subjectKey(subject) {
	return subject.trim().toLowerCase();
}

function formatSize(bytes) {
	if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

function showError(element, text) {
	element.textContent = text;
	element.hidden = false;
}

// Destructive buttons: the first tap asks, the second one does it
function confirmTwice(button, onConfirm) {
	const originalText = button.textContent;
	button.addEventListener("click", () => {
		if (!button.classList.contains("confirm")) {
			button.classList.add("confirm");
			button.textContent = "Biztos?";
			setTimeout(() => {
				button.classList.remove("confirm");
				button.textContent = originalText;
			}, 3000);
			return;
		}
		button.classList.remove("confirm");
		button.textContent = originalText;
		onConfirm();
	});
}

// ===== State =====
let timetable = { lessons: [], fileCounts: {}, exams: [] };
// calendar-page.html?date=2026-11-13 (the main page's exam card) opens that day
const startDate = (() => {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(new URLSearchParams(location.search).get("date") || "");
	return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date();
})();
let weekStart = mondayOf(startDate);              // Monday of the week shown
let selectedDay = (startDate.getDay() + 6) % 7;  // 0 = Monday ... 6 = Sunday

async function loadTimetable() {
	timetable = (await backend.getTimetable()) || { lessons: [], fileCounts: {}, exams: [] };
	render();
}

function examAt(date, period) {
	const iso = isoDate(date);
	return timetable.exams.find(exam => exam.date === iso && exam.period === period);
}

// The classes of one weekday (1..7) in order; gaps between them become free periods
function dayRows(day) {
	const lessons = timetable.lessons.filter(l => l.day === day).sort((a, b) => a.period - b.period);
	if (!lessons.length) return [];
	const rows = [];
	for (let period = lessons[0].period; period <= lessons[lessons.length - 1].period; period++) {
		rows.push(lessons.find(l => l.period === period) || { period, free: true });
	}
	return rows;
}

// ===== Week strip + lesson list =====
function render() {
	renderWeek();
	renderDay();
}

function renderWeek() {
	const end = addDays(weekStart, 6);
	weekLabel.textContent = weekStart.getMonth() === end.getMonth()
		? `${weekStart.getFullYear()}. ${MONTHS[weekStart.getMonth()]} ${weekStart.getDate()}–${end.getDate()}.`
		: `${MONTHS[weekStart.getMonth()]} ${weekStart.getDate()}. – ${MONTHS[end.getMonth()]} ${end.getDate()}.`;

	const today = new Date();
	weekDays.replaceChildren(...DAY_SHORT.map((short, i) => {
		const date = addDays(weekStart, i);
		const button = el("button", "day");
		button.type = "button";
		button.classList.toggle("today", sameDate(date, today));
		button.classList.toggle("selected", i === selectedDay);
		button.classList.toggle("has-lessons", timetable.lessons.some(l => l.day === i + 1));
		button.classList.toggle("has-exam", timetable.exams.some(exam => exam.date === isoDate(date)));
		button.setAttribute("aria-pressed", i === selectedDay);
		button.setAttribute("aria-label", `${DAY_NAMES[i]}, ${MONTHS[date.getMonth()]} ${date.getDate()}.`);
		button.append(el("span", "day-short", short), el("span", "day-num", date.getDate()));
		button.addEventListener("click", () => {
			selectedDay = i;
			render();
		});
		return button;
	}));
}

function renderDay() {
	const date = addDays(weekStart, selectedDay);
	dayTitle.textContent = `${DAY_NAMES[selectedDay]}, ${MONTHS[date.getMonth()]} ${date.getDate()}.`;

	const rows = dayRows(selectedDay + 1);
	if (!rows.length) {
		lessonList.replaceChildren(el("p", "card empty", "Erre a napra nincs óra."));
		return;
	}
	const now = new Date();
	const isToday = sameDate(date, now);
	lessonList.replaceChildren(...rows.map(row =>
		lessonCard(row, isToday && isNow(row.period, now), !row.free && examAt(date, row.period))));
}

function lessonCard(row, current, exam) {
	const card = el(row.free ? "div" : "button", row.free ? "lesson free" : "lesson");
	card.classList.toggle("current", current);

	const [start, end] = PERIOD_TIMES[row.period];
	const time = el("div", "lesson-time");
	const times = el("span", "times");
	times.append(el("span", "", start), el("span", "", end));
	time.append(el("span", "num", `${row.period}.`), times);

	const info = el("div", "lesson-info");
	info.append(el("span", "subject", row.free ? "Lyukasóra" : row.subject));
	if (!row.free && row.room) info.append(el("span", "room", row.room));
	card.append(time, info);

	if (!row.free) {
		card.type = "button";
		const count = timetable.fileCounts[subjectKey(row.subject)];
		if (count) card.append(el("span", "file-count", `📎 ${count}`));
		if (exam) {
			card.classList.add("has-exam");
			card.append(el("span", "exam-badge", "Dolgozat"));
		}
		card.addEventListener("click", () => openDetails(row));
	}
	return card;
}

document.getElementById("prevWeek").addEventListener("click", () => {
	weekStart = addDays(weekStart, -7);
	render();
});
document.getElementById("nextWeek").addEventListener("click", () => {
	weekStart = addDays(weekStart, 7);
	render();
});
// Tapping the date range jumps back to this week
weekLabel.addEventListener("click", () => {
	weekStart = mondayOf(new Date());
	selectedDay = (new Date().getDay() + 6) % 7;
	render();
});

// Keeps the "now" highlight on the right class
setInterval(renderDay, 60 * 1000);

// ===== Popups =====
// Opening a popup adds a history entry, so Android's back button closes the popup
// instead of leaving the page.
let openModal = null;

function showModal(modal) {
	openModal = modal;
	modal.hidden = false;
	document.body.classList.add("modal-open");
	history.pushState({ modal: true }, "");
}

function closeModal() {
	if (openModal) history.back();
}

window.addEventListener("popstate", () => {
	if (!openModal) return;
	openModal.hidden = true;
	openModal = null;
	document.body.classList.remove("modal-open");
});

document.addEventListener("keydown", e => {
	if (e.key === "Escape") closeModal();
});

// ===== Editor =====
let editRows = []; // { subject, room } or { free: true }, in the order they were entered

for (let period = 1; period <= LAST_PERIOD; period++) {
	firstPeriod.append(new Option(`${period}. óra (${PERIOD_TIMES[period][0]})`, period));
}

function openEditor() {
	const rows = dayRows(selectedDay + 1);
	firstPeriod.value = rows.length ? rows[0].period : 1;
	editRows = rows.map(row => row.free ? { free: true } : { subject: row.subject, room: row.room });
	if (!editRows.length) editRows.push({ subject: "", room: "" });

	editorTitle.textContent = `${DAY_NAMES[selectedDay]} órarendje`;
	editorError.hidden = true;
	const subjects = [...new Set(timetable.lessons.map(l => l.subject))].sort((a, b) => a.localeCompare(b, "hu"));
	subjectList.replaceChildren(...subjects.map(subject => new Option(subject)));

	renderEditRows();
	showModal(editor);
}

function textInput(placeholder, value, maxLength, onInput) {
	const input = el("input");
	input.type = "text";
	input.placeholder = placeholder;
	input.value = value;
	input.maxLength = maxLength;
	input.addEventListener("input", () => onInput(input.value));
	return input;
}

function toolButton(text, label, disabled, onClick) {
	const button = el("button", "icon-btn", text);
	button.type = "button";
	button.disabled = disabled;
	button.setAttribute("aria-label", label);
	button.addEventListener("click", onClick);
	return button;
}

function moveRow(index, step) {
	const [row] = editRows.splice(index, 1);
	editRows.splice(index + step, 0, row);
	renderEditRows();
}

function renderEditRows() {
	const first = Number(firstPeriod.value);
	editRowsList.replaceChildren(...editRows.map((row, i) => {
		const period = first + i;
		const li = el("li", row.free ? "edit-row free" : "edit-row");
		li.classList.toggle("too-late", period > LAST_PERIOD);

		const slot = el("div", "slot");
		slot.append(
			el("b", "", `${period}.`),
			el("small", "", PERIOD_TIMES[period] ? PERIOD_TIMES[period].join("–") : "nincs ilyen")
		);
		li.append(slot);

		if (row.free) {
			li.append(el("span", "free-label", "Lyukasóra"));
		} else {
			const fields = el("div", "fields");
			const subject = textInput("Tantárgy", row.subject, 60, value => row.subject = value);
			subject.setAttribute("list", "subjectList");
			const room = textInput("Terem", row.room, 20, value => row.room = value);
			room.classList.add("room-input");
			fields.append(subject, room);
			li.append(fields);
		}

		const tools = el("div", "row-tools");
		tools.append(
			toolButton("↑", "Feljebb", i === 0, () => moveRow(i, -1)),
			toolButton("↓", "Lejjebb", i === editRows.length - 1, () => moveRow(i, 1)),
			toolButton("✕", "Sor törlése", false, () => {
				editRows.splice(i, 1);
				renderEditRows();
			})
		);
		li.append(tools);
		return li;
	}));

	// No more rows once the 9th class is reached
	const full = first + editRows.length > LAST_PERIOD;
	addLessonBtn.disabled = full;
	addFreeBtn.disabled = full;
}

addLessonBtn.addEventListener("click", () => {
	editRows.push({ subject: "", room: "" });
	renderEditRows();
	editRowsList.lastElementChild.querySelector("input").focus();
});

addFreeBtn.addEventListener("click", () => {
	editRows.push({ free: true });
	renderEditRows();
});

firstPeriod.addEventListener("change", renderEditRows);

document.getElementById("cancelEdit").addEventListener("click", closeModal);

saveEditBtn.addEventListener("click", async () => {
	const first = Number(firstPeriod.value);
	// Free periods at the end don't matter
	const rows = editRows.slice();
	while (rows.length && rows[rows.length - 1].free) rows.pop();

	if (first + rows.length - 1 > LAST_PERIOD) {
		return showError(editorError, "Legfeljebb a 9. óráig lehet órákat megadni. Válassz korábbi első órát, vagy törölj egy sort.");
	}
	if (rows.some(row => !row.free && !row.subject.trim())) {
		return showError(editorError, "Minden órához írd be a tantárgyat (vagy töröld a sort).");
	}

	const lessons = rows
		.map((row, i) => row.free ? null : { period: first + i, subject: row.subject.trim(), room: row.room.trim() })
		.filter(Boolean);

	saveEditBtn.disabled = true;
	const saved = await backend.saveDay(selectedDay + 1, lessons);
	saveEditBtn.disabled = false;
	if (!saved) return showError(editorError, "Nem sikerült menteni. Próbáld újra.");

	await loadTimetable();
	closeModal();
});

document.getElementById("editDayBtn").addEventListener("click", openEditor);

// ===== Lesson details + files =====
let detailLesson = null;
let detailDate = null; // the date of the class that was tapped

function openDetails(lesson) {
	detailLesson = lesson;
	detailDate = addDays(weekStart, selectedDay);
	const [start, end] = PERIOD_TIMES[lesson.period];
	detailTime.textContent =
		`${DAY_NAMES[selectedDay]}, ${MONTHS[detailDate.getMonth()]} ${detailDate.getDate()}. · ${lesson.period}. óra · ${start}–${end}`;
	detailSubject.textContent = lesson.subject;
	detailRoom.textContent = lesson.room ? `Terem: ${lesson.room}` : "";
	detailRoom.hidden = !lesson.room;
	fileError.hidden = true;
	fileList.replaceChildren();
	renderExam();
	showModal(details);
	loadFiles();
}

// ===== Exam of the open class =====
// Lists the days the reminder will still go off (3, 2 and 1 day before, the passed ones left out)
function reminderText(date) {
	const now = new Date();
	const days = [];
	const [hours, minutes] = (timetable.reminderTime || "13:00").split(":").map(Number);
	for (let daysBefore = EXAM_REMINDER_DAYS; daysBefore >= 1; daysBefore--) {
		const at = addDays(date, -daysBefore);
		at.setHours(hours, minutes, 0, 0);
		if (at > now) days.push(`${MONTHS[at.getMonth()]} ${at.getDate()}.`);
	}
	if (!days.length) return "Nem lesz több emlékeztető, mert a dolgozatig már nincs hátra nap.";
	return `Emlékeztető ${hours}:${String(minutes).padStart(2, "0")}-kor: ${days.join(", ")}`;
}

// Shows the exam (or the "add" button) for the open class; editing = show the text box
function renderExam(editing = false) {
	const exam = examAt(detailDate, detailLesson.period);
	examError.hidden = true;
	examEmpty.hidden = editing || Boolean(exam);
	examView.hidden = editing || !exam;
	examForm.hidden = !editing;

	if (editing) {
		examInput.value = exam ? exam.details : "";
		examInput.focus();
	} else if (exam) {
		examDetails.textContent = exam.details || "Nincs megadva részlet.";
		examDetails.classList.toggle("muted", !exam.details);
		examReminder.textContent = reminderText(detailDate);
	}
}

document.getElementById("addExam").addEventListener("click", () => renderExam(true));
document.getElementById("editExam").addEventListener("click", () => renderExam(true));
document.getElementById("cancelExam").addEventListener("click", () => renderExam());

saveExamBtn.addEventListener("click", async () => {
	saveExamBtn.disabled = true;
	const saved = await backend.saveExam(
		isoDate(detailDate), detailLesson.period, detailLesson.subject, examInput.value.trim());
	saveExamBtn.disabled = false;
	if (!saved) return showError(examError, "Nem sikerült menteni a dolgozatot.");
	await loadTimetable();
	renderExam();
});

confirmTwice(document.getElementById("deleteExam"), async () => {
	const exam = examAt(detailDate, detailLesson.period);
	if (!exam || !await backend.deleteExam(exam.id)) {
		return showError(examError, "Nem sikerült törölni a dolgozatot.");
	}
	await loadTimetable();
	renderExam();
});

async function loadFiles() {
	const files = await backend.getFiles(detailLesson.subject);
	fileList.replaceChildren(...(files.length
		? files.map(fileRow)
		: [el("li", "hint", "Még nincs feltöltött fájl.")]));
}

function fileRow(file) {
	const li = el("li", "file");

	const open = el("button", "file-open");
	open.type = "button";
	open.append(el("span", "file-name", file.name), el("span", "file-size", formatSize(file.size)));
	open.addEventListener("click", async () => {
		fileError.hidden = true;
		if (!await backend.openFile(file.id)) {
			showError(fileError, "Nincs olyan alkalmazás a telefonon, amely meg tudja nyitni ezt a fájlt.");
		}
	});

	const remove = toolButton("✕", "Fájl törlése", false, () => {});
	confirmTwice(remove, async () => {
		if (await backend.deleteFile(file.id)) {
			await Promise.all([loadFiles(), loadTimetable()]);
		} else {
			showError(fileError, "Nem sikerült törölni a fájlt.");
		}
	});

	li.append(open, remove);
	return li;
}

uploadBtn.addEventListener("click", async () => {
	fileError.hidden = true;
	uploadBtn.disabled = true;
	const result = await backend.pickFile(detailLesson.subject);
	uploadBtn.disabled = false;

	if (result.ok) {
		await Promise.all([loadFiles(), loadTimetable()]);
	} else if (!result.cancelled) {
		showError(fileError, result.error || "Nem sikerült feltölteni a fájlt.");
	}
});

document.getElementById("closeDetails").addEventListener("click", closeModal);
// Tapping next to the details popup closes it
details.addEventListener("click", e => {
	if (e.target === details) closeModal();
});

render();
loadTimetable();
