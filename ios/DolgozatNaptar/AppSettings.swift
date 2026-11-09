import Foundation

// Small values kept between launches (SharedPreferences on Android)
enum AppSettings {
    private static let defaults = UserDefaults.standard
    private static let defaultReminderTime = "13:00"

    // ===== Session =====

    // The logged-in user's key (lowercased username), nil when logged out
    static var username: String? { defaults.string(forKey: "logged_in_username") }

    // The username as it was typed at registration
    static var displayName: String? { defaults.string(forKey: "logged_in_display_name") }

    static func logIn(username: String, displayName: String) {
        defaults.set(username, forKey: "logged_in_username")
        defaults.set(displayName, forKey: "logged_in_display_name")
    }

    static func logOut() {
        defaults.removeObject(forKey: "logged_in_username")
        defaults.removeObject(forKey: "logged_in_display_name")
    }

    // ===== Beállítások =====

    // When exam reminders go off, "HH:MM"
    static var reminderTime: String { defaults.string(forKey: "reminder_time") ?? defaultReminderTime }

    // False if the value isn't a valid 24-hour "HH:MM"
    static func setReminderTime(_ value: String) -> Bool {
        guard value.range(of: "^([01][0-9]|2[0-3]):[0-5][0-9]$", options: .regularExpression) != nil else {
            return false
        }
        defaults.set(value, forKey: "reminder_time")
        return true
    }
}
