import SwiftUI

/// Daily bars for the last 30 days. Hovering a bar shows that day.
struct TrendSection: View {
    let days: [Day]
    var slots: [Slot]?
    @AppStorage("usageMetric") private var metricRaw = UsageMetric.cost.rawValue
    @State private var hovered: String?

    private static let weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

    private var metric: UsageMetric { UsageMetric(rawValue: metricRaw) ?? .cost }

    /// The last 30 calendar days, oldest first, with empty days filled in.
    private var series: [(key: String, day: Day?)] {
        let byKey = Dictionary(days.map { ($0.date, $0) }, uniquingKeysWith: { a, _ in a })
        let calendar = Calendar.current
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.dateFormat = "yyyy-MM-dd"
        let today = calendar.startOfDay(for: Date())
        return (0..<30).reversed().compactMap { offset in
            guard let date = calendar.date(byAdding: .day, value: -offset, to: today) else { return nil }
            let key = formatter.string(from: date)
            return (key, byKey[key])
        }
    }

    private func amount(_ day: Day?) -> Double {
        guard let day else { return 0 }
        return metric == .cost ? (day.costUsd ?? 0) : Double(day.tokens)
    }

    var body: some View {
        let points = series
        let peak = max(points.map { amount($0.day) }.max() ?? 0, .leastNonzeroMagnitude)
        VStack(alignment: .leading, spacing: 6) {
            SectionHeader(title: "Last 30 Days")
            VStack(alignment: .leading, spacing: 8) {
                Text(caption(points))
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
                    .lineLimit(1)
                HStack(alignment: .bottom, spacing: 2) {
                    ForEach(points, id: \.key) { point in
                        let value = amount(point.day)
                        RoundedRectangle(cornerRadius: 1.5, style: .continuous)
                            .fill(point.key == hovered ? Color(nsColor: .controlAccentColor) : Color(nsColor: .systemBlue).opacity(value > 0 ? 0.75 : 0.18))
                            .frame(height: value > 0 ? max(3, 38 * value / peak) : 2)
                            .frame(maxWidth: .infinity, maxHeight: 38, alignment: .bottom)
                            .contentShape(Rectangle())
                            .onHover { inside in
                                if inside { hovered = point.key } else if hovered == point.key { hovered = nil }
                            }
                    }
                }
                .frame(height: 38)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .cardSurface()

            // Measured usage by weekday and hour: "when do I burn this", which bars per day cannot
            // answer. Only sources that dated their turns contribute, so a flat grid stays hidden.
            if let slots, slots.count >= 168,
               let peak = slots.map(slotValue).max(), peak > 0 {
                SectionHeader(title: "By Hour")
                VStack(alignment: .leading, spacing: 6) {
                    Text(busiest(slots))
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                    VStack(spacing: 2) {
                        ForEach(0..<7, id: \.self) { weekday in
                            HStack(spacing: 2) {
                                Text(Self.weekdays[weekday])
                                    .font(.system(size: 9))
                                    .foregroundStyle(.tertiary)
                                    .frame(width: 24, alignment: .leading)
                                ForEach(0..<24, id: \.self) { hour in
                                    let slot = slots[weekday * 24 + hour]
                                    let amount = slotValue(slot)
                                    RoundedRectangle(cornerRadius: 1.5, style: .continuous)
                                        .fill(amount > 0
                                              ? Color(nsColor: .controlAccentColor).opacity(0.2 + 0.8 * amount / peak)
                                              : Color.primary.opacity(0.08))
                                        .frame(height: 8)
                                        .help("\(Self.weekdays[weekday]) \(hourLabel(hour)): \(slotDetail(slot))")
                                }
                            }
                        }
                    }
                    HStack {
                        Text("12am")
                        Spacer(minLength: 2)
                        Text("6am")
                        Spacer(minLength: 2)
                        Text("noon")
                        Spacer(minLength: 2)
                        Text("6pm")
                        Spacer(minLength: 2)
                        Text("11pm")
                    }
                    .font(.system(size: 9))
                    .foregroundStyle(.tertiary)
                    .padding(.leading, 26)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .cardSurface()
            }
        }
    }

    private func slotValue(_ slot: Slot) -> Double {
        metric == .cost ? (slot.costUsd ?? 0) : Double(slot.tokens)
    }

    private func slotDetail(_ slot: Slot) -> String {
        metric == .cost ? Format.usd(slot.costUsd ?? 0, lowerBound: !slot.costComplete) : "\(Format.tokens(slot.tokens)) tokens"
    }

    private func hourLabel(_ hour: Int) -> String {
        if hour == 0 { return "12am" }
        if hour == 12 { return "12pm" }
        return hour < 12 ? "\(hour)am" : "\(hour - 12)pm"
    }

    private func busiest(_ slots: [Slot]) -> String {
        let index = slots.indices.max { slotValue(slots[$0]) < slotValue(slots[$1]) } ?? 0
        return "Busiest \(Self.weekdays[index / 24]) \(hourLabel(index % 24)) · \(slotDetail(slots[index]))"
    }

    private func caption(_ points: [(key: String, day: Day?)]) -> String {
        if let hovered, let point = points.first(where: { $0.key == hovered }) {
            let tokens = Format.tokens(point.day?.tokens ?? 0)
            let cost = point.day?.costUsd.map { " · ~\(Format.usd($0, lowerBound: !(point.day?.costComplete ?? true)))" } ?? ""
            return "\(Format.day(hovered)) · \(tokens) tokens\(cost)"
        }
        let active = points.filter { ($0.day?.tokens ?? 0) > 0 }.count
        return "\(active) active \(active == 1 ? "day" : "days") · hover a bar for details"
    }
}
