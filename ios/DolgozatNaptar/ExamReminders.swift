import Foundation
import UserNotifications

enum ExamReminders {
    private static let daysBefore = 3

    private static let months = [
        "január", "február", "március", "április", "május", "június",
        "július", "augusztus", "szeptember", "október", "november", "december",
    ]

    private static func identifier(examId: Int64, daysBefore: Int) -> String {
        "exam_reminder_\(examId)_\(daysBefore)"
    }

    static func requestPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
    }

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

    private static func reminderDate(examDate: String, daysBefore: Int, time: String) -> Date? {
        let day = examDate.split(separator: "-").compactMap { Int($0) }
        let clock = time.split(separator: ":").compactMap { Int($0) }
        guard day.count == 3, clock.count == 2 else { return nil }
        let components = DateComponents(year: day[0], month: day[1], day: day[2], hour: clock[0], minute: clock[1])
        guard let examDay = Calendar.current.date(from: components) else { return nil }
        return Calendar.current.date(byAdding: .day, value: -daysBefore, to: examDay)
    }

    static func message(subject: String, daysBefore: Int) -> String {
        let lastVowel = subject.lowercased().last(where: { "aáoóuúeéiíöőüű".contains($0) })
        let suffix = lastVowel.map { "aáoóuú".contains($0) } == true ? "ból" : "ből"
        return "\(daysBefore) Nap múlva DOLGOZAT LESZ \(subject)-\(suffix)"
    }

    private static func detailsText(date: String, period: Int, details: String) -> String {
        let parts = date.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, (1...12).contains(parts[1]) else { return details }
        let whenText = "\(months[parts[1] - 1]) \(parts[2])., \(period). óra"
        return details.trimmingCharacters(in: .whitespaces).isEmpty ? whenText : "\(whenText) – \(details)"
    }
}
