import AppKit
import SwiftUI

/// One theme's colours, spelled as hex like the popover's `themes.ts` so both apps paint the same
/// palette. A preset fills every field; a custom theme derives them from four user-picked colours.
struct ThemePalette: Equatable {
    var shell: String
    var panel: String
    var raisedHover: String
    var line: String
    var track: String
    var ink: String
    var muted: String
    var faint: String
    var brand: String
    var brandStrong: String
    var warn: String
    var danger: String
    var success: String
    /// Stable model colours, keyed by name hash, in the order the ring draws them.
    var models: [String]
}

/// The presets, plus the derivation a custom theme uses. Kept in one place so the two apps cannot
/// drift: these are the same values `cmd/freetokens/web/src/lib/themes.ts` ships.
enum Themes {
    static let ids = ["system", "dark", "light", "sand", "custom"]

    static func name(_ id: String) -> String {
        switch id {
        case "dark": return "Dark"
        case "light": return "Light"
        case "sand": return "Sand"
        case "custom": return "Custom"
        default: return "System"
        }
    }

    /// The concrete palette for a theme id, with "system" resolved against the current appearance.
    static func palette(_ id: String, colors: ThemeColors) -> ThemePalette {
        switch id {
        case "light": return light
        case "sand": return sand
        case "custom": return custom(colors)
        case "system":
            let followsLight = NSApp?.effectiveAppearance.bestMatch(from: [.aqua, .darkAqua]) == .aqua
            return followsLight ? light : graphite
        default: return graphite
        }
    }

    /// A custom theme is light or dark by its background; the caller uses that for the window chrome.
    static func isLight(_ colors: ThemeColors) -> Bool {
        isLightBackground(colors.value(.background))
    }

    private static let graphite = ThemePalette(
        shell: "#151517",
        panel: "#242427",
        raisedHover: "#3d3d40",
        line: "#3a3a3d",
        track: "#3a3a3d",
        ink: "#f5f5f7",
        muted: "#b9b9be",
        faint: "#909096",
        brand: "#0a84ff",
        brandStrong: "#4da3ff",
        warn: "#ff9f0a",
        danger: "#ff453a",
        success: "#34d399",
        models: ["#22d3ee", "#3b82f6", "#0a84ff", "#a855f7", "#f5f5f7", "#909096", "#f472b6", "#34d399"]
    )

    private static let light = ThemePalette(
        shell: "#f2f2f4",
        panel: "#ffffff",
        raisedHover: "#e2e2e6",
        line: "#dcdce0",
        track: "#e6e6ea",
        ink: "#111114",
        muted: "#55555c",
        faint: "#73737b",
        brand: "#0a84ff",
        brandStrong: "#0066cc",
        warn: "#a35a00",
        danger: "#c22a20",
        success: "#047857",
        models: ["#0891b2", "#2563eb", "#0a84ff", "#7c3aed", "#4b5563", "#6b7280", "#be185d", "#047857"]
    )

    private static let sand = ThemePalette(
        shell: "#161512",
        panel: "#1e1c19",
        raisedHover: "#332f29",
        line: "#3a352e",
        track: "#2f2b26",
        ink: "#f2ede6",
        muted: "#b8afa1",
        faint: "#9a9184",
        brand: "#4cc38a",
        brandStrong: "#7ad8a9",
        warn: "#e8b45c",
        danger: "#f08a72",
        success: "#4cc38a",
        models: ["#c9a97b", "#34b27f", "#5b9dff", "#ee7458", "#efede8", "#9aa3a8", "#a78bfa", "#e07ab0"]
    )

    /// Chart colours for a custom theme, so a ring is never monochrome when the accent repeats.
    private static let customCharts = ["#22d3ee", "#a855f7", "#f472b6", "#fbbf24", "#34d399", "#60a5fa", "#f87171"]

    private static func custom(_ colors: ThemeColors) -> ThemePalette {
        let accent = colors.value(.accent)
        let background = colors.value(.background)
        let card = colors.value(.card)
        let text = colors.value(.text)
        let lightSurface = isLightBackground(background)
        return ThemePalette(
            shell: background,
            panel: card,
            raisedHover: mix(card, text, 0.16),
            line: mix(card, text, lightSurface ? 0.16 : 0.2),
            track: mix(card, text, 0.14),
            ink: text,
            // Secondary text keeps a fixed distance from the body colour, so it stays readable
            // without a per-colour contrast pass.
            muted: mix(text, card, 0.3),
            faint: mix(text, card, 0.45),
            brand: accent,
            brandStrong: lightSurface ? mix(accent, "#000000", 0.2) : mix(accent, "#ffffff", 0.25),
            warn: lightSurface ? "#a35a00" : "#ff9f0a",
            danger: lightSurface ? "#c22a20" : "#ff453a",
            success: lightSurface ? "#047857" : "#34d399",
            models: [accent] + customCharts
        )
    }

    /// Whether a stored colour is one this palette can paint; anything else falls back.
    static func isHex(_ hex: String) -> Bool {
        rgb(hex) != nil
    }

    /// Blends `amount` of `b` into `a`, the same mix the popover uses.
    static func mix(_ a: String, _ b: String, _ amount: Double) -> String {
        guard let left = rgb(a), let right = rgb(b) else { return a }
        let t = min(max(amount, 0), 1)
        return hex((
            left.0 + (right.0 - left.0) * t,
            left.1 + (right.1 - left.1) * t,
            left.2 + (right.2 - left.2) * t
        ))
    }

    static func isLightBackground(_ hex: String) -> Bool {
        guard let color = rgb(hex) else { return false }
        func channel(_ value: Double) -> Double {
            let part = value / 255
            return part <= 0.03928 ? part / 12.92 : pow((part + 0.055) / 1.055, 2.4)
        }
        let luminance = 0.2126 * channel(color.0) + 0.7152 * channel(color.1) + 0.0722 * channel(color.2)
        return luminance > 0.4
    }

    private static func rgb(_ hex: String) -> (Double, Double, Double)? {
        var value = hex.trimmingCharacters(in: .whitespaces)
        if value.count == 4, value.hasPrefix("#") {
            let digits = Array(value.dropFirst())
            value = "#" + digits.map { "\($0)\($0)" }.joined()
        }
        guard value.count == 7, value.hasPrefix("#") else { return nil }
        let digits = Array(value.dropFirst())
        var parts: [Double] = []
        for index in stride(from: 0, to: 6, by: 2) {
            let pair = String(digits[index...index + 1])
            guard let part = Double(Int(pair, radix: 16) ?? -1), part >= 0 else { return nil }
            parts.append(part)
        }
        return (parts[0], parts[1], parts[2])
    }

    private static func hex(_ rgb: (Double, Double, Double)) -> String {
        let parts = [rgb.0, rgb.1, rgb.2].map { part -> String in
            String(format: "%02x", Int(part.rounded()))
        }
        return "#" + parts.joined()
    }
}

/// The panel look: an opaque page ("tray") with borderless grouped cards lifted off it by a subtle
/// fill, and one corner radius. Every colour comes from the active palette, so a theme repaints the
/// whole panel the way the popover's CSS variables do.
enum Theme {
    /// The palette the views read; `apply` replaces it when the settings load or the system flips.
    /// Until then it follows the OS appearance, so the first frame is never the wrong shade.
    private(set) static var palette = Themes.palette("system", colors: ThemeColors())

    static func apply(theme: String, colors: ThemeColors) {
        palette = Themes.palette(theme, colors: colors)
    }

    static var tray: Color { color(palette.shell) }
    /// The grouped-card fill.
    static var cardFill: Color { color(palette.panel) }
    /// The selected segment of a capsule picker.
    static var selectedSegment: Color { color(palette.raisedHover) }
    static var line: Color { color(palette.line) }
    static var track: Color { color(palette.track) }
    static var ink: Color { color(palette.ink) }
    static var muted: Color { color(palette.muted) }
    static var faint: Color { color(palette.faint) }
    static var brand: Color { color(palette.brand) }
    static var brandStrong: Color { color(palette.brandStrong) }
    static var notice: Color { color(palette.warn) }
    static var positive: Color { color(palette.success) }
    static var danger: Color { color(palette.danger) }

    static let cornerRadius: CGFloat = 12
    static var cardShape: RoundedRectangle { RoundedRectangle(cornerRadius: cornerRadius, style: .continuous) }

    enum Severity { case normal, warning, critical }

    /// Battery-style traffic light on how much is left.
    static func severity(remaining fraction: Double) -> Severity {
        if fraction <= 0.1 { return .critical }
        if fraction <= 0.25 { return .warning }
        return .normal
    }

    static func meter(_ severity: Severity) -> Color {
        switch severity {
        case .normal: return brand
        case .warning: return notice
        case .critical: return danger
        }
    }

    // Font sizes (QuotaBar's default density).
    static let label: CGFloat = 13
    static let supporting: CGFloat = 12
    static let header: CGFloat = 14

    /// Stable per-model colors for the usage ring, keyed by the route so a model keeps its colour.
    static func modelColor(_ name: String) -> Color {
        let palette = Theme.palette.models
        guard !palette.isEmpty else { return brand }
        let hash = name.unicodeScalars.reduce(UInt32(5381)) { ($0 &* 33) &+ $1.value }
        return color(palette[Int(hash % UInt32(palette.count))])
    }

    private static func color(_ hex: String) -> Color {
        Color(nsColor: NSColor(hex: hex) ?? .black)
    }
}

extension NSColor {
    /// Parses `#rgb` or `#rrggbb`; anything else is nil rather than a guess.
    convenience init?(hex: String) {
        var value = hex.trimmingCharacters(in: .whitespaces)
        if value.count == 4, value.hasPrefix("#") {
            let digits = Array(value.dropFirst())
            value = "#" + digits.map { "\($0)\($0)" }.joined()
        }
        guard value.count == 7, value.hasPrefix("#"),
              let number = Int(value.dropFirst(), radix: 16) else { return nil }
        self.init(
            srgbRed: CGFloat((number >> 16) & 0xff) / 255,
            green: CGFloat((number >> 8) & 0xff) / 255,
            blue: CGFloat(number & 0xff) / 255,
            alpha: 1
        )
    }
}

extension Color {
    /// The sRGB `#rrggbb` a picker handed back, as the config stores it.
    var hexString: String {
        guard let srgb = NSColor(self).usingColorSpace(.sRGB) else { return "#000000" }
        let parts = [srgb.redComponent, srgb.greenComponent, srgb.blueComponent].map { part -> String in
            String(format: "%02x", Int((min(max(part, 0), 1) * 255).rounded()))
        }
        return "#" + parts.joined()
    }
}

extension View {
    func cardSurface() -> some View {
        background(Theme.cardShape.fill(Theme.cardFill))
    }
}
