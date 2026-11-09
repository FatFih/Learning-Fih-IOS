import Foundation
import SQLite3

// SQLite's "copy the text now" marker for bound strings
private let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

// The app's database (same tables as Room on Android). One connection, used from the main thread only.
final class Database {
    static let shared = Database()

    private var db: OpaquePointer?

    private init() {
        let folder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let path = folder.appendingPathComponent("dolgozat-naptar.sqlite").path
        guard sqlite3_open(path, &db) == SQLITE_OK else { fatalError("Cannot open the database") }

        execute("""
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY NOT NULL,
                displayName TEXT NOT NULL,
                passwordSalt TEXT NOT NULL,
                passwordHash TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS lessons (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                day INTEGER NOT NULL,
                period INTEGER NOT NULL,
                subject TEXT NOT NULL,
                room TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS lesson_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                subjectKey TEXT NOT NULL,
                fileName TEXT NOT NULL,
                storedName TEXT NOT NULL,
                mimeType TEXT NOT NULL,
                size INTEGER NOT NULL,
                addedAt INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS exams (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                date TEXT NOT NULL,
                period INTEGER NOT NULL,
                subject TEXT NOT NULL,
                details TEXT NOT NULL);
            """)
    }

    private func execute(_ sql: String) {
        sqlite3_exec(db, sql, nil, nil, nil)
    }

    // Runs an INSERT / UPDATE / DELETE; `values` fill the ? marks in order.
    // False on failure (for example a username that is already taken).
    @discardableResult
    func run(_ sql: String, _ values: [Any?] = []) -> Bool {
        guard let statement = prepare(sql, values) else { return false }
        defer { sqlite3_finalize(statement) }
        return sqlite3_step(statement) == SQLITE_DONE
    }

    var lastInsertId: Int64 { sqlite3_last_insert_rowid(db) }

    // Rows as [column: value]; values are Int64, Double or String (NULL columns are left out)
    func query(_ sql: String, _ values: [Any?] = []) -> [[String: Any]] {
        guard let statement = prepare(sql, values) else { return [] }
        defer { sqlite3_finalize(statement) }

        var rows: [[String: Any]] = []
        while sqlite3_step(statement) == SQLITE_ROW {
            var row: [String: Any] = [:]
            for column in 0..<sqlite3_column_count(statement) {
                let name = String(cString: sqlite3_column_name(statement, column))
                switch sqlite3_column_type(statement, column) {
                case SQLITE_INTEGER:
                    row[name] = sqlite3_column_int64(statement, column)
                case SQLITE_FLOAT:
                    row[name] = sqlite3_column_double(statement, column)
                case SQLITE_TEXT:
                    if let text = sqlite3_column_text(statement, column) {
                        row[name] = String(cString: text)
                    }
                default:
                    break
                }
            }
            rows.append(row)
        }
        return rows
    }

    // Everything in `body` happens, or (if it returns false) nothing does
    func transaction(_ body: () -> Bool) -> Bool {
        execute("BEGIN")
        if body() {
            execute("COMMIT")
            return true
        }
        execute("ROLLBACK")
        return false
    }

    private func prepare(_ sql: String, _ values: [Any?]) -> OpaquePointer? {
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK else { return nil }
        for (index, value) in values.enumerated() {
            let position = Int32(index + 1)
            guard let value = value else {
                sqlite3_bind_null(statement, position)
                continue
            }
            switch value {
            case let text as String:
                sqlite3_bind_text(statement, position, text, -1, SQLITE_TRANSIENT)
            case let number as Int:
                sqlite3_bind_int64(statement, position, Int64(number))
            case let number as Int64:
                sqlite3_bind_int64(statement, position, number)
            case let number as Double:
                sqlite3_bind_double(statement, position, number)
            default:
                sqlite3_bind_null(statement, position)
            }
        }
        return statement
    }
}
