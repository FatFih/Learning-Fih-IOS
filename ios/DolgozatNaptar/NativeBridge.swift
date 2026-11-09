import QuickLook
import UIKit
import UniformTypeIdentifiers
import WebKit

// The iOS version of WebAppInterface.kt. The pages call window.Android.<method>(callId, ...args);
// the shim in WebViewController turns that into a message here, and the answer goes back to the
// page through window.onNativeResult(callId, result) - the same protocol as on Android.
final class NativeBridge: NSObject, WKScriptMessageHandler, UIDocumentPickerDelegate, QLPreviewControllerDataSource {
    private weak var controller: WebViewController?
    private weak var webView: WKWebView?
    private let db = Database.shared

    // The file picker answers later, so remember who asked
    private var pendingPick: (callId: String, subject: String)?
    // The file shown by Quick Look
    private var previewItem: PreviewItem?

    private static let maxFileSize = 25 * 1024 * 1024
    private static let mimeTypes = [
        "pdf": "application/pdf",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "ppt": "application/vnd.ms-powerpoint",
        "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ]

    private lazy var filesFolder: URL = {
        let folder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("lesson-files")
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder
    }()

    init(controller: WebViewController, webView: WKWebView) {
        self.controller = controller
        self.webView = webView
        super.init()
    }

    // ===== Messages from the pages =====

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let method = body["method"] as? String else { return }
        let values = body["args"] as? [Any] ?? []

        // The only call without a callId: theme.js on every page
        if method == "setLightTheme" {
            controller?.lightTheme = Arguments(values).bool(0)
            return
        }

        guard let first = values.first else { return }
        let callId = first as? String ?? "\(first)"
        let args = Arguments(Array(values.dropFirst()))

        switch method {
        case "register": register(callId, args)
        case "login": login(callId, args)
        case "getSession": getSession(callId)
        case "logout": logout(callId)
        case "getTimetable": getTimetable(callId)
        case "saveDay": saveDay(callId, args)
        case "saveExam": saveExam(callId, args)
        case "deleteExam": deleteExam(callId, args)
        case "getFiles": getFiles(callId, args)
        case "pickFile": pickFile(callId, args)
        case "openFile": openFile(callId, args)
        case "deleteFile": deleteFile(callId, args)
        case "getSettings": reply(callId, ["reminderTime": AppSettings.reminderTime])
        case "setReminderTime": setReminderTime(callId, args)
        default: reply(callId, NSNull())
        }
    }

    // ===== Users =====

    private func normalize(_ username: String) -> String {
        username.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private func register(_ callId: String, _ args: Arguments) {
        let displayName = args.string(0).trimmingCharacters(in: .whitespacesAndNewlines)
        let username = normalize(displayName)
        let password = args.string(1)
        guard !username.isEmpty, !password.isEmpty else { return reply(callId, false) }

        // Hashing takes a moment, so not on the main thread
        DispatchQueue.global(qos: .userInitiated).async {
            let digest = PasswordUtil.createDigest(password)
            DispatchQueue.main.async {
                let created = self.db.run(
                    "INSERT INTO users (username, displayName, passwordSalt, passwordHash) VALUES (?, ?, ?, ?)",
                    [username, displayName, digest.salt, digest.hash]
                )
                self.reply(callId, created) // false = username already taken
            }
        }
    }

    private func login(_ callId: String, _ args: Arguments) {
        let username = normalize(args.string(0))
        let password = args.string(1)
        guard !username.isEmpty, !password.isEmpty,
              let user = db.query("SELECT * FROM users WHERE username = ? LIMIT 1", [username]).first,
              let salt = user["passwordSalt"] as? String,
              let hash = user["passwordHash"] as? String
        else { return reply(callId, false) }

        DispatchQueue.global(qos: .userInitiated).async {
            let valid = PasswordUtil.verify(password, salt: salt, hash: hash)
            DispatchQueue.main.async {
                if valid {
                    AppSettings.logIn(username: username, displayName: user["displayName"] as? String ?? username)
                }
                self.reply(callId, valid)
            }
        }
    }

    // {username, displayName} or null (iOS replacement for Android.isLoggedIn / getUsername)
    private func getSession(_ callId: String) {
        guard let username = AppSettings.username else { return reply(callId, NSNull()) }
        let displayName = AppSettings.displayName.flatMap { $0.isEmpty ? nil : $0 } ?? username
        reply(callId, ["username": username, "displayName": displayName])
    }

    private func logout(_ callId: String) {
        AppSettings.logOut()
        reply(callId, true)
    }

    // ===== Timetable =====

    private func subjectKey(_ subject: String) -> String {
        subject.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    // {"lessons": [...], "fileCounts": {...}, "exams": [...], "reminderTime": "13:00"}
    private func getTimetable(_ callId: String) {
        guard let user = AppSettings.username else { return reply(callId, NSNull()) }
        let lessons = db.query(
            "SELECT day, period, subject, room FROM lessons WHERE username = ? ORDER BY day, period", [user]
        )
        var fileCounts: [String: Any] = [:]
        for row in db.query(
            "SELECT subjectKey, COUNT(*) AS count FROM lesson_files WHERE username = ? GROUP BY subjectKey", [user]
        ) {
            if let key = row["subjectKey"] as? String { fileCounts[key] = row["count"] }
        }
        let exams = db.query(
            "SELECT id, date, period, subject, details FROM exams WHERE username = ? ORDER BY date, period", [user]
        )
        reply(callId, [
            "lessons": lessons,
            "fileCounts": fileCounts,
            "exams": exams,
            "reminderTime": AppSettings.reminderTime,
        ])
    }

    // args: day (1-7), lessons JSON [{period, subject, room}] - replaces everything on that day
    private func saveDay(_ callId: String, _ args: Arguments) {
        guard let user = AppSettings.username,
              let day = args.int(0), (1...7).contains(day),
              let data = args.string(1).data(using: .utf8),
              let items = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]]
        else { return reply(callId, false) }

        var lessons: [(period: Int, subject: String, room: String)] = []
        for item in items {
            let subject = String((item["subject"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines).prefix(60))
            let room = String((item["room"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines).prefix(20))
            guard let period = (item["period"] as? NSNumber)?.intValue, (1...9).contains(period), !subject.isEmpty else {
                return reply(callId, false)
            }
            lessons.append((period, subject, room))
        }
        guard Set(lessons.map { $0.period }).count == lessons.count else { return reply(callId, false) }

        let saved = db.transaction {
            guard db.run("DELETE FROM lessons WHERE username = ? AND day = ?", [user, day]) else { return false }
            for lesson in lessons {
                guard db.run(
                    "INSERT INTO lessons (username, day, period, subject, room) VALUES (?, ?, ?, ?, ?)",
                    [user, day, lesson.period, lesson.subject, lesson.room]
                ) else { return false }
            }
            return true
        }
        reply(callId, saved)
    }

    // ===== Exams =====

    // args: date ("2026-11-13"), period, subject, details. Adds the exam (or updates the one
    // already on that class that day) and schedules its reminders.
    private func saveExam(_ callId: String, _ args: Arguments) {
        let date = args.string(0)
        let subject = String(args.string(2).trimmingCharacters(in: .whitespacesAndNewlines).prefix(60))
        let details = String(args.string(3).trimmingCharacters(in: .whitespacesAndNewlines).prefix(500))
        guard let user = AppSettings.username,
              date.range(of: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$", options: .regularExpression) != nil,
              let period = args.int(1), (1...9).contains(period),
              !subject.isEmpty
        else { return reply(callId, false) }

        let examId: Int64
        if let existing = db.query(
            "SELECT id FROM exams WHERE username = ? AND date = ? AND period = ? LIMIT 1", [user, date, period]
        ).first?["id"] as? Int64 {
            guard db.run("UPDATE exams SET subject = ?, details = ? WHERE id = ?", [subject, details, existing]) else {
                return reply(callId, false)
            }
            examId = existing
        } else {
            guard db.run(
                "INSERT INTO exams (username, date, period, subject, details) VALUES (?, ?, ?, ?, ?)",
                [user, date, period, subject, details]
            ) else { return reply(callId, false) }
            examId = db.lastInsertId
        }

        // The reminders need notification permission
        ExamReminders.requestPermission()
        ExamReminders.schedule(examId: examId, date: date, period: period, subject: subject, details: details)
        reply(callId, true)
    }

    private func deleteExam(_ callId: String, _ args: Arguments) {
        guard let user = AppSettings.username, let id = args.int(0),
              !db.query("SELECT id FROM exams WHERE id = ? AND username = ?", [id, user]).isEmpty,
              db.run("DELETE FROM exams WHERE id = ?", [id])
        else { return reply(callId, false) }
        ExamReminders.cancel(examId: Int64(id))
        reply(callId, true)
    }

    private func setReminderTime(_ callId: String, _ args: Arguments) {
        let saved = AppSettings.setReminderTime(args.string(0))
        if saved { ExamReminders.rescheduleAll() }
        reply(callId, saved)
    }

    // ===== Files =====

    // [{id, name, size}] for one subject
    private func getFiles(_ callId: String, _ args: Arguments) {
        guard let user = AppSettings.username else { return reply(callId, [Any]()) }
        reply(callId, db.query(
            "SELECT id, fileName AS name, size FROM lesson_files WHERE username = ? AND subjectKey = ? ORDER BY addedAt",
            [user, subjectKey(args.string(0))]
        ))
    }

    // Opens the system file picker (PDF, DOCX, PPT, PPTX only). The answer is sent when a file is
    // picked: {"ok": true} / {"ok": false, "error": "..."} / {"ok": false, "cancelled": true}
    private func pickFile(_ callId: String, _ args: Arguments) {
        guard let controller = controller, AppSettings.username != nil else {
            return replyPick(callId, cancelled: true)
        }
        if let previous = pendingPick { replyPick(previous.callId, cancelled: true) }
        pendingPick = (callId, args.string(0))

        let types = Self.mimeTypes.keys.compactMap { UTType(filenameExtension: $0) }
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: types, asCopy: true)
        picker.delegate = self
        picker.allowsMultipleSelection = false
        controller.present(picker, animated: true)
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let pick = pendingPick else { return }
        pendingPick = nil
        guard let url = urls.first, let user = AppSettings.username else {
            return replyPick(pick.callId, cancelled: true)
        }
        if let error = importFile(url, user: user, subject: pick.subject) {
            replyPick(pick.callId, error: error)
        } else {
            replyPick(pick.callId)
        }
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        guard let pick = pendingPick else { return }
        pendingPick = nil
        replyPick(pick.callId, cancelled: true)
    }

    // Copies the picked file into the app's own folder; returns an error message or nil
    private func importFile(_ url: URL, user: String, subject: String) -> String? {
        let fileExtension = url.pathExtension.lowercased()
        // The picker filters the types, but some file providers ignore that, so check again
        guard let mimeType = Self.mimeTypes[fileExtension] else {
            return "Csak PDF, DOCX, PPT vagy PPTX fájl tölthető fel."
        }
        let accessing = url.startAccessingSecurityScopedResource()
        defer { if accessing { url.stopAccessingSecurityScopedResource() } }

        let size = (try? url.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0
        guard size <= Self.maxFileSize else { return "A fájl túl nagy (legfeljebb 25 MB)." }

        let storedName = "\(UUID().uuidString).\(fileExtension)"
        do {
            try FileManager.default.copyItem(at: url, to: filesFolder.appendingPathComponent(storedName))
        } catch {
            return "Nem sikerült beolvasni a fájlt."
        }
        db.run(
            "INSERT INTO lesson_files (username, subjectKey, fileName, storedName, mimeType, size, addedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [user, subjectKey(subject), url.lastPathComponent, storedName, mimeType, size, Int64(Date().timeIntervalSince1970 * 1000)]
        )
        return nil
    }

    private func replyPick(_ callId: String, error: String? = nil, cancelled: Bool = false) {
        var result: [String: Any] = ["ok": error == nil && !cancelled]
        if let error = error { result["error"] = error }
        if cancelled { result["cancelled"] = true }
        reply(callId, result)
    }

    // Shows the file with Quick Look (PDF, Word and PowerPoint files are all supported)
    private func openFile(_ callId: String, _ args: Arguments) {
        guard let user = AppSettings.username, let id = args.int(0), let controller = controller,
              let file = db.query(
                  "SELECT fileName, storedName FROM lesson_files WHERE id = ? AND username = ? LIMIT 1", [id, user]
              ).first,
              let storedName = file["storedName"] as? String
        else { return reply(callId, false) }

        let url = filesFolder.appendingPathComponent(storedName)
        guard QLPreviewController.canPreview(url as NSURL) else { return reply(callId, false) }
        previewItem = PreviewItem(url: url, title: file["fileName"] as? String)
        let preview = QLPreviewController()
        preview.dataSource = self
        controller.present(preview, animated: true)
        reply(callId, true)
    }

    private func deleteFile(_ callId: String, _ args: Arguments) {
        guard let user = AppSettings.username, let id = args.int(0),
              let file = db.query(
                  "SELECT storedName FROM lesson_files WHERE id = ? AND username = ? LIMIT 1", [id, user]
              ).first,
              let storedName = file["storedName"] as? String,
              db.run("DELETE FROM lesson_files WHERE id = ?", [id])
        else { return reply(callId, false) }
        try? FileManager.default.removeItem(at: filesFolder.appendingPathComponent(storedName))
        reply(callId, true)
    }

    func numberOfPreviewItems(in controller: QLPreviewController) -> Int {
        previewItem == nil ? 0 : 1
    }

    func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
        previewItem!
    }

    // ===== Answers to the page =====

    // value: Bool, NSNull, or arrays / dictionaries of strings and numbers
    private func reply(_ callId: String, _ value: Any) {
        guard callId.range(of: "^[0-9]{1,10}$", options: .regularExpression) != nil else { return }
        let json: String
        if let flag = value as? Bool {
            json = flag ? "true" : "false"
        } else if value is NSNull {
            json = "null"
        } else if JSONSerialization.isValidJSONObject(value),
                  let data = try? JSONSerialization.data(withJSONObject: value),
                  let text = String(data: data, encoding: .utf8) {
            json = text // JSON is valid JavaScript, so it can be passed in directly
        } else {
            json = "null"
        }
        webView?.evaluateJavaScript("window.onNativeResult(\(callId), \(json));", completionHandler: nil)
    }
}

// The arguments the page sent (strings, numbers and booleans from JavaScript)
private struct Arguments {
    let values: [Any]

    init(_ values: [Any]) {
        self.values = values
    }

    func string(_ index: Int) -> String {
        guard index < values.count else { return "" }
        return values[index] as? String ?? "\(values[index])"
    }

    func int(_ index: Int) -> Int? {
        guard index < values.count else { return nil }
        if let number = values[index] as? NSNumber { return number.intValue }
        return Int(string(index))
    }

    func bool(_ index: Int) -> Bool {
        guard index < values.count else { return false }
        return (values[index] as? NSNumber)?.boolValue ?? false
    }
}

// A file for Quick Look, shown with its original name instead of the stored one
private final class PreviewItem: NSObject, QLPreviewItem {
    let previewItemURL: URL?
    let previewItemTitle: String?

    init(url: URL, title: String?) {
        previewItemURL = url
        previewItemTitle = title
    }
}
