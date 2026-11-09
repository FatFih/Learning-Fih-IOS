const message = document.getElementById("feedbackMessage");
const username = document.getElementById("username");
const password = document.getElementById("password");
const confirmPassword = document.getElementById("confirmPassword");
const registrationForm = document.getElementById("loginform");
const pending = new Map();
let nextCallId = 0;

// How long the "success" message stays on screen before we go to the login page
const REDIRECT_DELAY_MS = 2000;

// true while a registration is being sent / after it succeeded, so the form can't be submitted twice
let busy = false;

message.hidden = true;

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

// Always replaces the old message, so the text and color always match the latest attempt
function showMessage(text, color) {
    message.hidden = false;
    message.style.color = color;
    message.textContent = text;
}

registrationForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;

    if (password.value !== confirmPassword.value) {
        showMessage("A két jelszó nem egyezik.", "red");
        return;
    }

    busy = true;
    const created = await callNative("register", username.value, password.value);

    if (!created) {
        showMessage("Ez a felhasználónév már foglalt.", "red");
        busy = false;
        return;
    }

    showMessage("Sikeres regisztráció. Most bejelentkezhetsz.", "green");

    // Lock the form while the message is shown, then go to the login page
    registrationForm.querySelectorAll("input, button").forEach(element => {
        element.disabled = true;
    });
    setTimeout(() => location.replace("../login-page/login.html"), REDIRECT_DELAY_MS);
});

// Keep the field being typed in visible above the on-screen keyboard.
// The WebView shrinks when the keyboard opens, so wait a moment, then scroll the field to the middle.
function keepFocusedFieldVisible() {
    const active = document.activeElement;
    if (active && active.tagName === "INPUT") {
        active.scrollIntoView({ block: "center", behavior: "smooth" });
    }
}

document.querySelectorAll("input").forEach(input => {
    input.addEventListener("focus", () => setTimeout(keepFocusedFieldVisible, 300));
});

// The viewport height changes when the keyboard appears/disappears
window.addEventListener("resize", () => setTimeout(keepFocusedFieldVisible, 100));