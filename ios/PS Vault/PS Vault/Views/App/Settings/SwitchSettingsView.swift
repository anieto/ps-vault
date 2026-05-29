import SwiftUI

struct SwitchSettingsView: View {
    @State private var settings: SwitchSettings? = nil
    @State private var isLoading = false
    @State private var error = ""
    @State private var actionLoading = false
    @State private var showPauseSheet = false
    @State private var showTimingEdit = false
    @State private var checkinConfirm = false
    @State private var disableConfirm = false
    @State private var abortConfirm = false
    @State private var revokeConfirm = false

    var body: some View {
        Form {
            if let s = settings {
                statusSection(s)
                actionsSection(s)
                timingSection(s)
            } else if isLoading {
                Section {
                    HStack { Spacer(); ProgressView(); Spacer() }
                }
            } else if !error.isEmpty {
                Section { Text(error).foregroundStyle(.red).font(.caption) }
            }
        }
        .scrollContentBackground(.hidden)
        .background { AuthBackground() }
        .navigationTitle("Emergency Switch")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $showPauseSheet) {
            if let s = settings { PauseSwitchSheet(settings: s) { updated in settings = updated } }
        }
        .sheet(isPresented: $showTimingEdit) {
            if let s = settings { TimingEditSheet(settings: s) { updated in settings = updated } }
        }
        .confirmationDialog("Check in now?", isPresented: $checkinConfirm, titleVisibility: .visible) {
            Button("Check In") { Task { await checkin() } }
        } message: { Text("This will reset your check-in deadline.") }
        .confirmationDialog("Disable switch?", isPresented: $disableConfirm, titleVisibility: .visible) {
            Button("Disable", role: .destructive) { Task { await setActive(false) } }
        } message: { Text("Your beneficiaries will no longer receive your vaults if you stop checking in.") }
        .confirmationDialog("Cancel delivery?", isPresented: $abortConfirm, titleVisibility: .visible) {
            Button("I'm here — cancel delivery") { Task { await abort() } }
        } message: { Text("This will cancel the delivery and reset your check-in timer.") }
        .confirmationDialog("Revoke all access?", isPresented: $revokeConfirm, titleVisibility: .visible) {
            Button("Revoke & reset", role: .destructive) { Task { await revoke() } }
        } message: { Text("This will invalidate all active delivery links and restart your switch. Beneficiaries will lose portal access.") }
    }

    // MARK: - Sections

    @ViewBuilder
    private func statusSection(_ s: SwitchSettings) -> some View {
        Section("Status") {
            HStack {
                Label(statusLabel(s), systemImage: statusIcon(s))
                    .foregroundStyle(statusColor(s))
                Spacer()
                Text(settings?.isActive == true ? "Active" : "Inactive")
                    .font(.caption).fontWeight(.medium)
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(s.isActive ? Color.green.opacity(0.12) : Color.secondary.opacity(0.1))
                    .foregroundStyle(s.isActive ? .green : .secondary)
                    .clipShape(Capsule())
            }

            if s.status == "active", let deadline = s.nextCheckinDeadline {
                LabeledContent("Next check-in due") {
                    Text(formatDate(deadline)).foregroundStyle(.secondary)
                }
            }
            if let last = s.lastCheckinAt {
                LabeledContent("Last check-in") {
                    Text(formatDate(last)).foregroundStyle(.secondary)
                }
            }
            if s.status == "paused" {
                if let until = s.pausedUntil {
                    LabeledContent("Resumes") {
                        Text(formatDate(until)).foregroundStyle(.secondary)
                    }
                } else {
                    LabeledContent("Paused", value: "Indefinitely")
                }
            }
            if s.status == "triggered", let deadline = s.abortDeadline {
                HStack {
                    Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                    Text("Delivery will begin \(formatDate(deadline)) unless you abort.")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
            }
        }
    }

    @ViewBuilder
    private func actionsSection(_ s: SwitchSettings) -> some View {
        Section {
            switch s.status {
            case "active":
                Button { checkinConfirm = true } label: {
                    Label("Check In Now", systemImage: "checkmark.circle")
                }
                Button { showPauseSheet = true } label: {
                    Label("Pause Switch", systemImage: "pause.circle")
                }
                Button(role: .destructive) { disableConfirm = true } label: {
                    Label("Disable Switch", systemImage: "power")
                }
            case "paused":
                Button { Task { await resume() } } label: {
                    Label(actionLoading ? "Resuming…" : "Resume Switch", systemImage: "play.circle")
                }
                .disabled(actionLoading)
            case "inactive":
                Button { Task { await setActive(true) } } label: {
                    Label(actionLoading ? "Activating…" : "Activate Switch", systemImage: "power")
                }
                .disabled(actionLoading)
            case "triggered":
                let abortOpen = s.abortDeadline.map { ISO8601DateFormatter().date(from: $0).map { $0 > Date() } ?? false } ?? false
                if abortOpen {
                    Button { abortConfirm = true } label: {
                        Label("I'm here — abort delivery", systemImage: "hand.raised.fill")
                            .foregroundStyle(.orange)
                    }
                } else {
                    HStack {
                        Spacer()
                        Button(role: .destructive) { revokeConfirm = true } label: {
                            Text("Revoke & reset")
                                .font(.subheadline).fontWeight(.medium)
                        }
                        .buttonStyle(.bordered)
                        .tint(.red)
                        Spacer()
                    }
                }
            case "delivered":
                HStack {
                    Spacer()
                    Button(role: .destructive) { revokeConfirm = true } label: {
                        Text("Revoke access & reset")
                            .font(.subheadline).fontWeight(.medium)
                    }
                    .buttonStyle(.bordered)
                    .tint(.red)
                    Spacer()
                }
            default:
                EmptyView()
            }
        }
    }

    @ViewBuilder
    private func timingSection(_ s: SwitchSettings) -> some View {
        Section {
            LabeledContent("Check-in interval", value: "\(s.checkInIntervalDays) day\(s.checkInIntervalDays == 1 ? "" : "s")")
            LabeledContent("First reminder", value: "\(s.reminder1DaysBefore) day\(s.reminder1DaysBefore == 1 ? "" : "s") before")
            LabeledContent("Second reminder", value: "\(s.reminder2HoursBefore)h before")
            LabeledContent("Final warning", value: "\(s.finalWarningHoursBefore)h before")
            LabeledContent("Abort window", value: "\(s.abortWindowHours)h after trigger")
            if let hour = s.preferredCheckinHour {
                LabeledContent("Preferred time", value: formatHour(hour))
            }
            Button("Edit Timing…") { showTimingEdit = true }
        } header: {
            Text("Timing Configuration")
        }
    }

    // MARK: - Actions

    private func load() async {
        isLoading = true
        error = ""
        defer { isLoading = false }
        do {
            settings = try await APIService.shared.getSwitchSettings()
        } catch let e as APIError {
            error = e.errorDescription ?? "Failed to load switch settings."
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func checkin() async {
        do { settings = try await APIService.shared.checkin() } catch {}
    }

    private func setActive(_ active: Bool) async {
        actionLoading = true
        defer { actionLoading = false }
        do { settings = try await APIService.shared.updateSwitchSettings(isActive: active) } catch {}
    }

    private func resume() async {
        actionLoading = true
        defer { actionLoading = false }
        do { settings = try await APIService.shared.resumeSwitch() } catch {}
    }

    private func abort() async {
        actionLoading = true
        defer { actionLoading = false }
        do { settings = try await APIService.shared.abortTrigger() } catch {}
    }

    private func revoke() async {
        actionLoading = true
        defer { actionLoading = false }
        do {
            try await APIService.shared.revokeDeliveries()
            await load()
        } catch {}
    }

    // MARK: - Helpers

    private func statusLabel(_ s: SwitchSettings) -> String {
        switch s.status {
        case "active": return "Switch Active"
        case "paused": return "Switch Paused"
        case "triggered": return "Switch Triggered"
        case "delivered": return "Vault Delivered"
        default: return "Switch Disabled"
        }
    }

    private func statusIcon(_ s: SwitchSettings) -> String {
        switch s.status {
        case "active": return "checkmark.shield.fill"
        case "paused": return "pause.circle.fill"
        case "triggered": return "exclamationmark.triangle.fill"
        case "delivered": return "checkmark.circle.fill"
        default: return "shield.slash"
        }
    }

    private func statusColor(_ s: SwitchSettings) -> Color {
        switch s.status {
        case "active": return .accentColor
        case "paused": return .secondary
        case "triggered": return .orange
        case "delivered": return .red
        default: return .secondary
        }
    }

    private func formatDate(_ iso: String) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = f.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
        guard let date else { return iso }
        let rel = RelativeDateTimeFormatter()
        rel.unitsStyle = .full
        return rel.localizedString(for: date, relativeTo: Date())
    }

    private func formatHour(_ hour: Int) -> String {
        let period = hour < 12 ? "AM" : "PM"
        let h = hour % 12 == 0 ? 12 : hour % 12
        return "\(h):00 \(period)"
    }
}

// MARK: - Pause Sheet

private struct PauseSwitchSheet: View {
    let settings: SwitchSettings
    var onDone: (SwitchSettings) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var isLoading = false
    @State private var error = ""

    private let options: [(label: String, days: Int?)] = [
        ("1 week", 7), ("2 weeks", 14), ("1 month", 30), ("Indefinitely", nil)
    ]

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("No reminders or triggers will fire while the switch is paused. Use this during planned absences.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Section("Pause duration") {
                    ForEach(Array(0..<options.count), id: \.self) { i in
                        let opt = options[i]
                        Button {
                            Task { await pause(days: opt.days) }
                        } label: {
                            HStack {
                                Text(opt.label).foregroundStyle(.primary)
                                Spacer()
                                if isLoading { ProgressView() }
                            }
                        }
                        .disabled(isLoading)
                    }
                }
                if !error.isEmpty {
                    Section { Text(error).foregroundStyle(.red).font(.caption) }
                }
            }
            .scrollContentBackground(.hidden)
            .background { AuthBackground() }
            .navigationTitle("Pause Switch")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
    }

    private func pause(days: Int?) async {
        isLoading = true
        error = ""
        defer { isLoading = false }
        do {
            let resumeAt = days.map { Date().addingTimeInterval(Double($0) * 86400) }
            let updated = try await APIService.shared.pauseSwitch(resumeAt: resumeAt)
            onDone(updated)
            dismiss()
        } catch let e as APIError {
            error = e.errorDescription ?? "Failed to pause switch."
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Timing Edit Sheet

private struct TimingEditSheet: View {
    let settings: SwitchSettings
    var onDone: (SwitchSettings) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var appState

    @State private var intervalDays: Int
    @State private var abortHours: Int
    @State private var reminder1Days: Int
    @State private var reminder2Hours: Int
    @State private var finalWarningHours: Int
    @State private var preferredHour: Int
    @State private var usePreferredHour: Bool
    @State private var isSaving = false
    @State private var error = ""

    init(settings: SwitchSettings, onDone: @escaping (SwitchSettings) -> Void) {
        self.settings = settings
        self.onDone = onDone
        _intervalDays = State(initialValue: settings.checkInIntervalDays)
        _abortHours = State(initialValue: settings.abortWindowHours)
        _reminder1Days = State(initialValue: settings.reminder1DaysBefore)
        _reminder2Hours = State(initialValue: settings.reminder2HoursBefore)
        _finalWarningHours = State(initialValue: settings.finalWarningHoursBefore)
        _preferredHour = State(initialValue: settings.preferredCheckinHour ?? 9)
        _usePreferredHour = State(initialValue: settings.preferredCheckinHour != nil)
    }

    private var timingFooter: Text {
        guard !appState.serverURL.isEmpty, let url = URL(string: appState.serverURL) else {
            return Text("For more precise timing options, visit the full web app at your server.")
        }
        var base = AttributedString("For more precise timing options, visit the full web app at ")
        var link = AttributedString(appState.serverURL)
        link.link = url
        return Text(base + link + AttributedString("."))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Check-In Interval") {
                    Stepper("Every \(intervalDays) day\(intervalDays == 1 ? "" : "s")", value: $intervalDays, in: 1...365)
                }
                Section("Reminders") {
                    Stepper("First: \(reminder1Days) day\(reminder1Days == 1 ? "" : "s") before", value: $reminder1Days, in: 1...30)
                    Stepper("Second: \(reminder2Hours)h before", value: $reminder2Hours, in: 1...72)
                    Stepper("Final warning: \(finalWarningHours)h before", value: $finalWarningHours, in: 1...24)
                }
                Section("Abort Window") {
                    Stepper("\(abortHours)h after trigger", value: $abortHours, in: 0...72)
                }
                Section {
                    Toggle("Set preferred check-in time", isOn: $usePreferredHour)
                    if usePreferredHour {
                        Stepper(formatHour(preferredHour), value: $preferredHour, in: 0...23)
                    }
                } header: {
                    Text("Preferred Time")
                } footer: {
                    Text("Reminders will be sent around this time of day.")
                }
                Section {
                    EmptyView()
                } footer: {
                    timingFooter
                }
                if !error.isEmpty {
                    Section { Text(error).foregroundStyle(.red).font(.caption) }
                }
            }
            .scrollContentBackground(.hidden)
            .background { AuthBackground() }
            .navigationTitle("Timing Configuration")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(isSaving)
                }
            }
        }
    }

    private func save() async {
        isSaving = true
        error = ""
        defer { isSaving = false }
        do {
            let updated = try await APIService.shared.updateSwitchSettings(
                checkInIntervalDays: intervalDays,
                abortWindowHours: abortHours,
                reminder1DaysBefore: reminder1Days,
                reminder2HoursBefore: reminder2Hours,
                finalWarningHoursBefore: finalWarningHours,
                preferredCheckinHour: usePreferredHour ? preferredHour : nil,
                clearPreferredHour: usePreferredHour ? nil : true
            )
            onDone(updated)
            dismiss()
        } catch let e as APIError {
            error = e.errorDescription ?? "Failed to save settings."
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func formatHour(_ hour: Int) -> String {
        let period = hour < 12 ? "AM" : "PM"
        let h = hour % 12 == 0 ? 12 : hour % 12
        return "\(h):00 \(period)"
    }
}
