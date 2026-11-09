const message = document.getElementById("feedbackMessage");
const username = document.getElementById("username");
const password = document.getElementById("password");
const loginForm = document.getElementById("loginform");
const pending = new Map();
let nextCallId = 0;

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

// Already logged in -> straight to the main page (the app answers asynchronously on iOS)
callNative("getSession").then(session => {
    if (session) location.replace("../main-page/main.html");
});

loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    const success = await callNative("login", username.value, password.value);
    message.hidden = false;
    message.style.color = success ? "green" : "red";
    message.textContent = success ? "Sikeres bejelentkezés!" : "Hibás felhasználónév vagy jelszó.";
    if (success) location.replace("../main-page/main.html");
});