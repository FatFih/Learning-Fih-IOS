import Foundation
import UserNotifications

// Same reminders as on Android: every day from 3 days before the exam, at the time set in
// Beállítások: "3 Nap múlva DOLGOZAT LESZ <subject>-ból", then "2 Nap...", then "1 Nap...".
// iOS keeps scheduled notifications through restarts by itself.
enum ExamReminders {
    // Keep in sync with EXAM_REMINDER_DAYS in calendar-page.js
    private static let daysBefore = 3

    private static let months = [
        "január", "február", "március", "április", "május", "június",
        "július", "augusztus", "szeptember", "október", "november", "december",
    ]

    private static func identifier(examId: Int64, daysBefore: Int) -> String {
        "exam_reminder_\(examId)_\(daysBefore)"
    }

    // Asks once for notification permission (iOS shows the question only the first time)
    static func requestPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
    }

    // Saving an exam again replaces its old reminders. Days already passed are skipped.
    static func schedule(examId: Int64, date: String, period: Int, subject: String, details: String) {
        cancel(examId: examId)
        let center = UNUserNotificationCenter.current()
        let time = AppSettings.reminderTime
        for days in stride(from: daysBefore, through: 1, by: -1) {
            guard let fireDate = reminderDate(examDate: date, daysBefore: days, time: time), fireDate > Date() else {
                continue
            }
            let content = UNMutableNotificationContent()
            content.title = message(subject: subject, daysBefore: days)
            content.body = detailsText(date: date, period: period, details: details)
            content.sound = .default

            let components = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: fireDate)
            let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
            center.add(UNNotificationRequest(
                identifier: identifier(examId: examId, daysBefore: days),
                content: content,
                trigger: trigger
            ))
        }
    }

    static func cancel(examId: Int64) {
        let identifiers = (1...daysBefore).map { identifier(examId: examId, daysBefore: $0) }
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: identifiers)
    }

    // After the reminder time changes in Beállítások: every saved exam gets new reminders
    static func rescheduleAll() {
        for exam in Database.shared.query("SELECT id, date, period, subject, details FROM exams") {
            schedule(
                examId: exam["id"] as? Int64 ?? 0,
                date: exam["date"] as? String ?? "",
                period: Int(exam["period"] as? Int64 ?? 0),
                subject: exam["subject"] as? String ?? "",
                details: exam["details"] as? String ?? ""
            )
        }
    }

    // `daysBefore` days before the exam ("2026-11-13") at `time` ("13:00")
    private static func reminderDate(examDate: String, daysBefore: Int, time: String) -> Date? {
        let day = examDate.split(separator: "-").compactMap { Int($0) }
        let clock = time.split(separator: ":").compactMap { Int($0) }
        guard day.count == 3, clock.count == 2 else { return nil }
        let components = DateComponents(year: day[0], month: day[1], day: day[2], hour: clock[0], minute: clock[1])
        guard let examDay = Calendar.current.date(from: components) else { return nil }
        return Calendar.current.date(byAdding: .day, value: -daysBefore, to: examDay)
    }

    // "Matematika" -> "...Matematika-ból", "Történelem" -> "...Történelem-ből" (vowel harmony)
    static func message(subject: String, daysBefore: Int) -> String {
        let lastVowel = subject.lowercased().last(where: { "aáoóuúeéiíöőüű".contains($0) })
        let suffix = lastVowel.map { "aáoóuú".contains($0) } == true ? "ból" : "ből"
        return "\(daysBefore) Nap múlva DOLGOZAT LESZ \(subject)-\(suffix)"
    }

    // "november 6., 3. óra" + the details the user wrote
    private static func detailsText(date: String, period: Int, details: String) -> String {
        let parts = date.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, (1...12).contains(parts[1]) else { return details }
        let whenText = "\(months[parts[1] - 1]) \(parts[2])., \(period). óra"
        return details.trimmingCharacters(in: .whitespaces).isEmpty ? whenText : "\(whenText) – \(details)"
    }
}
