import SwiftUI

enum UsageMetric: String, CaseIterable, Identifiable {
    case cost, tokens
    var id: String { rawValue }
    var title: String { self == .cost ? "Estimated Cost" : "Tokens" }
}

/// What the ring's slices represent: one model, one provider, or one workspace.
enum UsageGrouping: String, CaseIterable, Identifiable {
    case tool, provider, project
    var id: String { rawValue }
    var title: String {
        switch self {
        case .tool: return "By Model"
        case .provider: return "By Provider"
        case .project: return "By Project"
        }
    }
    var short: String {
        switch self {
        case .tool: return "Model"
        case .provider: return "Provider"
        case .project: return "Project"
        }
    }
}

enum UsageSplit: String, CaseIterable, Identifiable {
    case models, kinds
    var id: String { rawValue }
}

/// One ring slice, already grouped. `colorKey` is the model the color follows, so one provider keeps
/// a stable color while the panel switches groupings.
struct UsageSlice: Identifiable {
    var id: String
    var name: String
    var tokens: Int64
    var costUsd: Double?
    var costComplete: Bool
    var colorKey: String
}

/// Accumulates the rows of one provider or project.
private struct UsageBucket {
    var tokens: Int64 = 0
    var cost = 0.0
    var priced = false
    var complete = true
    var dominant = ""
    var dominantTokens: Int64 = -1
}

/// Today / Yesterday / Last 30 Days, as QuotaBar's Total Spend card: a capsule period picker over a
/// donut of each row's share, the total in the middle and a ranked legend beside it.
struct UsageSection: View {
    let snapshot: Snapshot?
    var budgetUsd: Double = 0
    var showProjects = false

    @AppStorage("usagePeriod") private var periodIndex = 0
    @AppStorage("usageMetric") private var metricRaw = UsageMetric.cost.rawValue
    @AppStorage("usageGrouping") private var groupingRaw = UsageGrouping.tool.rawValue
    @AppStorage("usageSplit") private var splitRaw = UsageSplit.models.rawValue
    @Namespace private var picker

    private var metric: UsageMetric { UsageMetric(rawValue: metricRaw) ?? .cost }
    private var periods: [Period] { snapshot?.periods ?? [] }
    private var period: Period? { periods.indices.contains(periodIndex) ? periods[periodIndex] : periods.first }

    private var availableGroupings: [UsageGrouping] {
        let models = period?.models ?? []
        var out: [UsageGrouping] = [.tool]
        if models.contains(where: { ($0.provider ?? "").isEmpty == false }) { out.append(.provider) }
        if showProjects, models.contains(where: { ($0.project ?? "").isEmpty == false }) { out.append(.project) }
        return out
    }

    private var grouping: UsageGrouping {
        let chosen = UsageGrouping(rawValue: groupingRaw) ?? .tool
        return availableGroupings.contains(chosen) ? chosen : .tool
    }

    /// Costs have no per-kind rates, so the kinds split only exists in token mode.
    private var split: UsageSplit {
        guard metric == .tokens, period?.kinds != nil else { return .models }
        return UsageSplit(rawValue: splitRaw) ?? .models
    }

    private var budgetOn: Bool { budgetUsd > 0 }
    private var monthly: Period? { periods.first { $0.label == "Last 30 Days" } }
    private var monthlyCost: Double? { budgetOn ? monthly?.costUsd : nil }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 5) {
                metricMenu
                if availableGroupings.count > 1 || (metric == .tokens && period?.kinds != nil) {
                    groupingMenu
                }
                Image(systemName: "info.circle")
                    .imageScale(.small)
                    .foregroundStyle(.secondary)
                    .help(mixNote)
                Spacer(minLength: 8)
            }
            .padding(.horizontal, 4)
            .padding(.vertical, 2)
            VStack(spacing: 12) {
                if periods.count > 1 { periodPicker }
                if let period, period.hasData, !(period.models ?? []).isEmpty {
                    UsageRing(rows: slices(period), metric: metric, costLowerBound: period.costLowerBound)
                    footnote(period)
                    if let kinds = period.kinds, split == .kinds { cacheLine(kinds) }
                    if budgetOn { budgetLine }
                } else {
                    Text(snapshot == nil ? "Loading…" : "No measured usage in this period")
                        .font(.system(size: Theme.supporting))
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 18)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity)
            .cardSurface()
            .animation(.spring(response: 0.35, dampingFraction: 0.86), value: periodIndex)
            .animation(.spring(response: 0.35, dampingFraction: 0.86), value: metricRaw)
            .animation(.spring(response: 0.35, dampingFraction: 0.86), value: groupingRaw)
            .animation(.spring(response: 0.35, dampingFraction: 0.86), value: splitRaw)
        }
    }

    private var mixNote: String {
        let note = "Shares use measured tokens. Cost mode multiplies them by published API rates, so a model with no public price counts as zero and the total is a lower bound. Model groups by the model that ran; Provider by who published it; Project by the workspace a run recorded."
        guard let source = snapshot?.sourceNote, !source.isEmpty else { return note }
        return note + "\n" + source
    }

    /// Rows for the ring in the current grouping, or the token kinds when that split is active.
    private func slices(_ period: Period) -> [UsageSlice] {
        if split == .kinds, let kinds = period.kinds {
            let parts: [(String, Int64)] = [
                ("Cache read", kinds.cacheRead),
                ("Input", kinds.input),
                ("Output", kinds.output),
                ("Cache write", kinds.cacheWrite),
            ]
            return parts.filter { $0.1 > 0 }.map {
                UsageSlice(id: "kind:" + $0.0, name: $0.0, tokens: $0.1, costUsd: nil, costComplete: true,
                           colorKey: "kind:" + $0.0)
            }
        }

        let models = period.models ?? []
        switch grouping {
        case .tool:
            return models.map {
                UsageSlice(id: $0.id, name: Format.modelName($0.name), tokens: $0.tokens, costUsd: $0.costUsd,
                           costComplete: $0.costComplete, colorKey: $0.name)
            }
        case .provider, .project:
            var buckets: [String: UsageBucket] = [:]
            for model in models {
                let key: String
                if grouping == .provider {
                    key = model.provider ?? "Other"
                } else {
                    key = (model.project ?? "").isEmpty ? "No project" : (model.project ?? "")
                }
                var bucket = buckets[key] ?? UsageBucket()
                bucket.tokens += model.tokens
                if let cost = model.costUsd {
                    bucket.cost += cost
                    bucket.priced = true
                }
                bucket.complete = bucket.complete && model.costComplete
                if model.tokens > bucket.dominantTokens {
                    bucket.dominant = model.name
                    bucket.dominantTokens = model.tokens
                }
                buckets[key] = bucket
            }
            return buckets.map { key, bucket in
                UsageSlice(id: key, name: key, tokens: bucket.tokens, costUsd: bucket.priced ? bucket.cost : nil,
                           costComplete: bucket.complete, colorKey: bucket.dominant)
            }
        }
    }

    /// The title doubles as the metric switch, a plain pull-down with no extra chrome.
    @ViewBuilder
    private var metricMenu: some View {
        let menu = Menu {
            ForEach(UsageMetric.allCases) { option in
                Button {
                    metricRaw = option.rawValue
                } label: {
                    if option == metric { Label(option.title, systemImage: "checkmark") } else { Text(option.title) }
                }
            }
        } label: {
            HStack(spacing: 4) {
                Text(metric.title)
                    .font(.system(size: Theme.header, weight: .semibold))
                    .foregroundStyle(.primary)
                Image(systemName: "chevron.down")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
        }
        .fixedSize()
        .accessibilityLabel("Usage metric")
        .accessibilityValue(metric.title)
        if #available(macOS 14, *) {
            menu.menuStyle(.button).buttonStyle(.plain).menuIndicator(.hidden)
        } else {
            menu.menuStyle(.borderlessButton)
        }
    }

    /// Grouping and the model / token-kind split in one pull-down, to keep the header short.
    @ViewBuilder
    private var groupingMenu: some View {
        let menu = Menu {
            Picker("Group by", selection: Binding(get: { grouping.rawValue }, set: { groupingRaw = $0 })) {
                ForEach(availableGroupings) { option in
                    Text(option.title).tag(option.rawValue)
                }
            }
            if metric == .tokens, period?.kinds != nil {
                Divider()
                Picker("Split", selection: Binding(get: { split.rawValue }, set: { splitRaw = $0 })) {
                    Text("By Model").tag(UsageSplit.models.rawValue)
                    Text("Token Kinds").tag(UsageSplit.kinds.rawValue)
                }
            }
        } label: {
            HStack(spacing: 3) {
                Text(split == .kinds ? "Kinds" : grouping.short)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.secondary)
                Image(systemName: "chevron.down")
                    .font(.system(size: 8, weight: .semibold))
                    .foregroundStyle(.tertiary)
            }
        }
        .fixedSize()
        .accessibilityLabel("Grouping")
        .accessibilityValue(split == .kinds ? "Token kinds" : grouping.title)
        if #available(macOS 14, *) {
            menu.menuStyle(.button).buttonStyle(.plain).menuIndicator(.hidden)
        } else {
            menu.menuStyle(.borderlessButton)
        }
    }

    private var periodPicker: some View {
        HStack(spacing: 2) {
            ForEach(Array(periods.enumerated()), id: \.offset) { index, candidate in
                let selected = index == periodIndex
                Button {
                    periodIndex = index
                } label: {
                    Text(shortLabel(candidate.label))
                        .font(.system(size: 11, weight: selected ? .semibold : .medium))
                        .foregroundStyle(selected ? AnyShapeStyle(.primary) : AnyShapeStyle(.secondary))
                        .padding(.vertical, 4)
                        .frame(maxWidth: .infinity)
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .background {
                    if selected {
                        Capsule()
                            .fill(Theme.selectedSegment)
                            .shadow(color: .black.opacity(0.14), radius: 2, y: 1)
                            .matchedGeometryEffect(id: "period", in: picker)
                    }
                }
            }
        }
        .padding(3)
        .background(Capsule().fill(Color.primary.opacity(0.06)))
    }

    private func shortLabel(_ label: String) -> String {
        label == "Last 30 Days" ? "30 Days" : label
    }

    private func footnote(_ period: Period) -> some View {
        let tokens = "\(Format.tokens(period.tokens)) tokens"
        let cost = period.costUsd.map { Format.usd($0, lowerBound: period.costLowerBound) }
        // Format.usd already marks a lower bound with "≥"; only an exact figure gets the "~".
        let estimate = cost.map { period.costLowerBound ? $0 : "~\($0)" } ?? "no price yet"
        var parts = [metric == .cost ? tokens : estimate]
        if period.partial { parts.append("some runs incomplete") }
        if let sources = period.sources, !sources.isEmpty {
            parts.append(sources.map(\.name).joined(separator: " · "))
        }
        return Text(parts.joined(separator: " · "))
            .font(.system(size: 11))
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .center)
    }

    /// Cache reads as a share of prompt tokens, the figure that explains a cheap high-token model.
    private func cacheLine(_ kinds: Kinds) -> some View {
        let prompt = kinds.cacheRead + kinds.input
        let share = prompt > 0 ? Double(kinds.cacheRead) / Double(prompt) : 0
        return Text("Cache hit \(Int((share * 100).rounded()))% · \(Format.tokens(kinds.cacheRead)) of \(Format.tokens(prompt)) prompt tokens")
            .font(.system(size: 11))
            .foregroundStyle(.secondary)
            .monospacedDigit()
            .frame(maxWidth: .infinity, alignment: .center)
    }

    private var budgetLine: some View {
        let cost = monthlyCost ?? 0
        let fraction = budgetUsd > 0 ? cost / budgetUsd : 0
        let over = cost > budgetUsd
        return VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 6) {
                Text("Monthly budget")
                    .font(.system(size: 11, weight: .medium))
                Spacer(minLength: 6)
                if monthlyCost != nil {
                    Text("\(Format.usd(cost)) of \(Format.usd(budgetUsd)) · \(Int((fraction * 100).rounded()))%")
                        .monospacedDigit()
                } else {
                    Text("no priced usage yet")
                }
            }
            .font(.system(size: 11))
            .foregroundStyle(.secondary)
            CapsuleMeter(fraction: min(max(fraction, 0), 1), color: over ? Theme.notice : Theme.positive, height: 4)
            if over {
                Text("Over by \(Format.usd(cost - budgetUsd)) in the last 30 days.")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.notice)
            }
        }
        .padding(.top, 2)
    }
}

/// The donut and its legend.
struct UsageRing: View {
    let rows: [UsageSlice]
    let metric: UsageMetric
    var costLowerBound = false

    private static let diameter: CGFloat = 104
    private static let minimumSliceShare = 0.025

    private struct Arc: Identifiable {
        let id: String
        let colorKey: String
        let start: Double
        let end: Double
    }

    private func amount(_ slice: UsageSlice) -> Double {
        metric == .cost ? (slice.costUsd ?? 0) : Double(slice.tokens)
    }

    private var slices: [UsageSlice] {
        rows.filter { amount($0) > 0 }.sorted { amount($0) > amount($1) }
    }

    private var total: Double { slices.reduce(0) { $0 + amount($1) } }

    private var arcs: [Arc] {
        let items = slices
        let sum = total
        guard sum > 0 else { return [] }
        let floored = items.map { max(amount($0) / sum, Self.minimumSliceShare) }
        let flooredSum = floored.reduce(0, +)
        var cursor = 0.0
        return zip(items, floored).map { slice, share in
            let width = share / flooredSum
            defer { cursor += width }
            return Arc(id: slice.id, colorKey: slice.colorKey, start: cursor, end: cursor + width)
        }
    }

    var body: some View {
        HStack(spacing: 16) {
            ZStack {
                if arcs.isEmpty {
                    Circle().stroke(Color.primary.opacity(0.08), lineWidth: Self.diameter * 0.19)
                        .padding(Self.diameter * 0.095)
                }
                ForEach(arcs) { arc in
                    RingSectorShape(startFraction: arc.start, endFraction: arc.end)
                        .fill(Theme.modelColor(arc.colorKey))
                }
                center
            }
            .frame(width: Self.diameter, height: Self.diameter)
            VStack(alignment: .leading, spacing: 8) {
                ForEach(slices.prefix(5)) { slice in
                    legendRow(slice)
                }
                if slices.count > 5 {
                    Text("+\(slices.count - 5) more")
                        .font(.system(size: 11))
                        .foregroundStyle(.tertiary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .combine)
    }

    private var center: some View {
        let primary: String
        let unit: String
        switch metric {
        case .cost:
            primary = total > 0 ? Format.usd(total, lowerBound: costLowerBound) : "—"
            unit = "est. cost"
        case .tokens:
            primary = Format.tokens(Int64(total))
            unit = "tokens"
        }
        return VStack(spacing: 1) {
            Text(primary)
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text(unit)
                .font(.system(size: 9, weight: .medium))
                .foregroundStyle(.tertiary)
        }
        .padding(.horizontal, 12)
        .help(costLowerBound ? "A lower bound: some tokens have no public price or no complete receipt yet." : "")
    }

    /// Two-line rows (name, then amount) so long Freebuff route names fit beside the ring.
    private func legendRow(_ slice: UsageSlice) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 7) {
            Circle()
                .fill(Theme.modelColor(slice.colorKey))
                .frame(width: 8, height: 8)
                .alignmentGuide(.firstTextBaseline) { $0[VerticalAlignment.center] + 4 }
            VStack(alignment: .leading, spacing: 1) {
                Text(slice.name)
                    .font(.system(size: Theme.supporting))
                    .lineLimit(1)
                    .truncationMode(.middle)
                    .help(slice.name)
                Text(value(slice))
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
                    .lineLimit(1)
            }
        }
    }

    private func value(_ slice: UsageSlice) -> String {
        switch metric {
        case .cost:
            guard let cost = slice.costUsd else { return "no price" }
            return Format.usd(cost, lowerBound: !slice.costComplete)
        case .tokens:
            return Format.tokens(slice.tokens)
        }
    }
}
