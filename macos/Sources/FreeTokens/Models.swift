import Foundation

/// `freetokens status --json`.
struct Snapshot: Decodable, Equatable {
    var refreshedAt: Date
    var quota: Quota?
    var quotaError: String?
    var quotaErrorCode: String?
    var historyWarning: String?
    var periods: [Period]?
    var days: [Day]?
    /// What each local reader found on the last refresh.
    var sources: [SourceHealth]?
    /// Usage by local weekday and hour, Sunday 00:00 first.
    var slots: [Slot]?
    var sourceNote: String?
}

/// How a row spent its measured tokens; reasoning sits inside output.
struct Kinds: Decodable, Equatable {
    var input: Int64
    var output: Int64
    var cacheRead: Int64
    var cacheWrite: Int64
    var reasoning: Int64?
}

struct SourceRow: Decodable, Equatable, Identifiable {
    var name: String
    var tokens: Int64
    var id: String { name }
}

struct SourceHealth: Decodable, Equatable, Identifiable {
    var name: String
    var files: Int
    var unreadable: Int
    var state: String
    var detail: String?
    var lastReadAt: Date?
    var id: String { name }
}

struct Slot: Decodable, Equatable {
    var tokens: Int64
    var costUsd: Double?
    var costComplete: Bool
}

struct Quota: Decodable, Equatable {
    var status: String
    var plan: String?
    var meters: [Meter]?
    var hoursBalance: Double?
    var monthlySpendUsd: Double?
    var activeSessions: [Date]?
    var warning: String?
}

struct Meter: Decodable, Equatable, Identifiable {
    var label: String
    var used: Double
    var limit: Double
    var unit: String
    var resetsAt: Date?
    var detail: String?

    var id: String { label }
    var remaining: Double { max(limit - used, 0) }
    /// Share of the limit still available, 0...1.
    var remainingFraction: Double { limit > 0 ? min(max(remaining / limit, 0), 1) : 0 }
}

struct Period: Decodable, Equatable {
    var label: String
    var tokens: Int64
    var costUsd: Double?
    var costLowerBound: Bool
    var partial: Bool
    var models: [ModelRow]?
    var sources: [SourceRow]?
    var kinds: Kinds?
    var hasData: Bool
}

struct ModelRow: Decodable, Equatable, Identifiable {
    var name: String
    var provider: String?
    var source: String?
    /// The workspace the run recorded, when its reader recorded one.
    var project: String?
    var tokens: Int64
    var costUsd: Double?
    var costComplete: Bool
    var kinds: Kinds?

    // Two projects can run the same model, so the name alone is not unique.
    var id: String { name + "\u{0}" + (project ?? "") }
}

struct Day: Decodable, Equatable, Identifiable {
    var date: String
    var tokens: Int64
    var costUsd: Double?
    var costComplete: Bool
    var partial: Bool
    var models: [ModelRow]?

    var id: String { date }
}

/// One of the four colours a custom theme is built from, named the way `config set` spells it.
enum ThemeColorField: String, CaseIterable {
    case accent, background, card, text

    var key: String { rawValue + "-color" }

    var label: String {
        switch self {
        case .accent: return "Accent"
        case .background: return "Background"
        case .card: return "Card"
        case .text: return "Text"
        }
    }

    /// The same starting colours the popover uses, so both apps look alike before a pick.
    var fallback: String {
        switch self {
        case .accent: return "#0a84ff"
        case .background: return "#0f0f11"
        case .card: return "#232326"
        case .text: return "#f5f5f7"
        }
    }
}

/// The colours a custom theme is built from; every other colour is derived in `Themes`.
struct ThemeColors: Decodable, Equatable {
    var accent: String?
    var background: String?
    var card: String?
    var text: String?

    func value(_ field: ThemeColorField) -> String {
        let stored: String?
        switch field {
        case .accent: stored = accent
        case .background: stored = background
        case .card: stored = card
        case .text: stored = text
        }
        let trimmed = (stored ?? "").trimmingCharacters(in: .whitespaces)
        return Themes.isHex(trimmed) ? trimmed : field.fallback
    }
}

/// `freetokens config get`.
struct EngineSettings: Decodable, Equatable {
    var autoUpdate: String = "off"
    var refreshMinutes: Int = 5
    var showTimers: Bool = true
    var showHistory: Bool = false
    var showProjects: Bool = false
    /// Monthly spending ceiling; 0 turns the budget line off.
    var budgetUsd: Double = 0
    var trayTitle: String = "session"
    var theme: String = "system"
    /// The colours a custom theme is built from, stored beside the choice.
    var customTheme: ThemeColors = ThemeColors()
}

/// `freetokens update --json`.
struct UpdateResult: Decodable, Equatable {
    var current: String?
    var latest: String?
    var available: Bool?
    var url: String?
    var installed: Bool?
    var skipped: String?
    var error: String?
}

extension JSONDecoder {
    /// Go writes RFC 3339 times with optional fractional seconds.
    static let engine: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let text = try decoder.singleValueContainer().decode(String.self)
            if let date = DateParsing.parse(text) { return date }
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Bad date \(text)"))
        }
        return decoder
    }()
}

enum DateParsing {
    static func parse(_ text: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: text) { return date }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return plain.date(from: text)
    }
}
