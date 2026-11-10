import AppKit
import SwiftUI

/// Settings, shown inside the panel like QuotaBar's: grouped cards of label ⟷ control rows.
struct SettingsView: View {
    @ObservedObject var model: AppModel

    @State private var budgetText = ""
    @State private var budgetNote: String?
    @State private var dataNote: String?

    private static let refreshChoices = [1, 2, 5, 10, 15, 30, 60]
    private static let trayChoices: [(value: String, label: String)] = [
        ("session", "Session Countdown"),
        ("hours", "Hours Left"),
        ("tokens", "Tokens Today"),
        ("cost", "Cost Today"),
        ("none", "Nothing"),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            group("General") {
                toggleRow("Start at Login", isOn: Binding(get: { model.startsAtLogin }, set: { model.setStartsAtLogin($0) }))
                RowDivider()
                toggleRow("Session Timer in Hours Card", isOn: Binding(get: { model.settings.showTimers }, set: { model.setShowTimers($0) }))
                RowDivider()
                row("Menu Bar Figure") {
                    Picker("Menu Bar Figure", selection: Binding(get: { model.settings.trayTitle }, set: { model.setTrayTitle($0) })) {
                        ForEach(Self.trayChoices, id: \.value) { choice in
                            Text(choice.label).tag(choice.value)
                        }
                    }
                    .labelsHidden()
                    .fixedSize()
                }
                RowDivider()
                row("Refresh Every") {
                    Picker("Refresh Every", selection: Binding(get: { model.settings.refreshMinutes }, set: { model.setRefreshMinutes($0) })) {
                        ForEach(choices, id: \.self) { minutes in
                            Text(minutes == 60 ? "1 hour" : "\(minutes) min").tag(minutes)
                        }
                    }
                    .labelsHidden()
                    .fixedSize()
                }
                RowDivider()
                row("Appearance") {
                    Picker("Appearance", selection: Binding(get: { model.settings.theme }, set: { model.setTheme($0) })) {
                        Text("System").tag("system")
                        Text("Dark").tag("dark")
                        Text("Light").tag("light")
                    }
                    .labelsHidden()
                    .fixedSize()
                }
            }
            group("Usage") {
                toggleRow("Show Project Grouping", isOn: Binding(get: { model.settings.showProjects }, set: { model.setShowProjects($0) }))
                RowDivider()
                toggleRow("Show 30-Day Trend", isOn: Binding(get: { model.settings.showHistory }, set: { model.setShowHistory($0) }))
                RowDivider()
                HStack(spacing: 8) {
                    Text("Monthly Ceiling").font(.system(size: Theme.label))
                    Spacer(minLength: 8)
                    Text("$").foregroundStyle(.secondary)
                    TextField("None", text: $budgetText)
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 76)
                        .multilineTextAlignment(.trailing)
                        .accessibilityLabel("Monthly ceiling in dollars")
                        .onSubmit { saveBudget() }
                    Button("Save") { saveBudget() }
                        .controlSize(.small)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 6)
                if let budgetNote {
                    Text(budgetNote)
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.notice)
                        .padding(.horizontal, 14)
                        .padding(.bottom, 6)
                }
            }
            group("Sources") {
                if let sources = model.snapshot?.sources, !sources.isEmpty {
                    ForEach(Array(sources.enumerated()), id: \.element.id) { index, source in
                        if index > 0 { RowDivider() }
                        sourceRow(source)
                    }
                } else {
                    Text("Sources appear after the first refresh.")
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                }
            }
            group("Updates") {
                row("GitHub Releases") {
                    Picker("Updates", selection: Binding(get: { model.settings.autoUpdate }, set: { model.setAutoUpdate($0) })) {
                        Text("Never Check").tag("off")
                        Text("Check Daily and Notify").tag("notify")
                        Text("Check Daily and Install").tag("auto")
                    }
                    .labelsHidden()
                    .fixedSize()
                }
                RowDivider()
                HStack(spacing: 8) {
                    updateStatus
                    Spacer(minLength: 8)
                    updateButton
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
            }
            if let error = model.settingsError {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.notice)
                    .padding(.horizontal, 4)
            }
            group("Data") {
                HStack(spacing: 8) {
                    Text(dataNote ?? "One row per local day with tokens, estimated cost and completeness.")
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 8)
                    Button("Copy CSV") { copyCSV() }
                        .controlSize(.small)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
            }
            group("About") {
                HStack(spacing: 10) {
                    Image(nsImage: NSApp.applicationIconImage)
                        .resizable()
                        .frame(width: 32, height: 32)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("FreeTokens \(model.isRelease ? "v" + model.version : "development build")")
                            .font(.system(size: Theme.label, weight: .semibold))
                        Text("Unofficial. Not affiliated with Freebuff or Codebuff.")
                            .font(.system(size: 11))
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                RowDivider()
                HStack(spacing: 14) {
                    Link("GitHub", destination: URL(string: "https://github.com/tverma101/FreeTokens")!)
                    Link("Report an Issue", destination: URL(string: "https://github.com/tverma101/FreeTokens/issues")!)
                    Spacer()
                    Button("Quit FreeTokens") { NSApp.terminate(nil) }
                        .controlSize(.small)
                }
                .font(.system(size: Theme.supporting))
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
            }
        }
        .onAppear {
            budgetText = model.settings.budgetUsd > 0 ? Format.number(model.settings.budgetUsd) : ""
        }
        .onChange(of: model.settings.budgetUsd) { value in
            budgetText = value > 0 ? Format.number(value) : ""
        }
    }

    private func saveBudget() {
        let cleaned = budgetText
            .trimmingCharacters(in: .whitespaces)
            .replacingOccurrences(of: "$", with: "")
            .replacingOccurrences(of: ",", with: "")
        if cleaned.isEmpty {
            budgetNote = nil
            model.setBudget(0)
            return
        }
        guard let amount = Double(cleaned), amount.isFinite, amount >= 0 else {
            budgetNote = "Enter a non-negative amount, or leave the field empty."
            return
        }
        budgetNote = nil
        model.setBudget(amount)
    }

    private func copyCSV() {
        Task {
            do {
                let csv = try await model.exportCSV()
                let board = NSPasteboard.general
                board.clearContents()
                board.setString(csv, forType: .string)
                dataNote = "Daily usage copied as CSV."
            } catch {
                dataNote = error.localizedDescription
            }
        }
    }

    private func sourceRow(_ source: SourceHealth) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Circle()
                .fill(tint(source.state))
                .frame(width: 6, height: 6)
                .padding(.top, 5)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 8) {
                    Text(source.name)
                        .font(.system(size: Theme.label, weight: .medium))
                    Spacer(minLength: 8)
                    Text(source.files > 0 ? "\(source.files) file\(source.files == 1 ? "" : "s")" : "none found")
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                }
                if let detail = source.detail {
                    Text(detail)
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let read = source.lastReadAt {
                    Text("Last read \(Format.ago(read))")
                        .font(.system(size: 10))
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 7)
    }

    private func tint(_ state: String) -> Color {
        switch state {
        case "ok": return Theme.positive
        case "partial", "cached": return Theme.notice
        case "error": return Color(nsColor: .systemRed)
        default: return Color.primary.opacity(0.25)
        }
    }

    private var choices: [Int] {
        Self.refreshChoices.contains(model.settings.refreshMinutes)
            ? Self.refreshChoices
            : (Self.refreshChoices + [model.settings.refreshMinutes]).sorted()
    }

    private var updateStatus: some View {
        let (text, tint) = updateText
        return Text(text)
            .font(.system(size: 11))
            .foregroundStyle(tint.map(AnyShapeStyle.init) ?? AnyShapeStyle(.secondary))
            .fixedSize(horizontal: false, vertical: true)
    }

    private var updateText: (String, Color?) {
        let text: String
        var tint: Color? = nil
        switch model.update {
        case .idle: text = model.settings.autoUpdate == "off" ? "FreeTokens never contacts GitHub unless you ask." : "Checks once a day."
        case .checking: text = "Checking…"
        case .upToDate: text = "FreeTokens is up to date."; tint = Theme.positive
        case let .available(version, _): text = "v\(version) is available."
        case let .installing(version): text = "Installing v\(version)…"
        case let .failed(message): text = message; tint = Theme.notice
        }
        return (text, tint)
    }

    @ViewBuilder
    private var updateButton: some View {
        switch model.update {
        case .available:
            Button("Install and Relaunch") { model.installUpdate() }
                .controlSize(.small)
        case .checking, .installing:
            ProgressView().controlSize(.small)
        default:
            Button("Check Now") { model.checkForUpdates() }
                .controlSize(.small)
                .disabled(!model.isRelease)
                .help(model.isRelease ? "Check GitHub Releases now" : "Development builds don't update")
        }
    }

    private func group<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            SectionHeader(title: title)
            VStack(spacing: 0) { content() }
                .padding(.vertical, 3)
                .cardSurface()
        }
    }

    private func row<Control: View>(_ title: String, @ViewBuilder control: () -> Control) -> some View {
        HStack {
            Text(title).font(.system(size: Theme.label))
            Spacer(minLength: 8)
            control().controlSize(.small)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 6)
    }

    private func toggleRow(_ title: String, isOn: Binding<Bool>) -> some View {
        row(title) {
            Toggle(title, isOn: isOn)
                .labelsHidden()
                .toggleStyle(.switch)
        }
    }
}
