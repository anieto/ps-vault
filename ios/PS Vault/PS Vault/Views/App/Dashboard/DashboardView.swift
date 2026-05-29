import SwiftUI

struct DashboardView: View {
    @Environment(AppState.self) private var appState
    @State private var switchSettings: SwitchSettings? = nil
    @State private var vaults: [Vault] = []
    @State private var beneficiaryCount: Int? = nil
    @State private var loadError = ""
    @State private var isCheckingIn = false
    @State private var isAborting = false
    @State private var isRevoking = false
    @State private var checkinError = ""
    @State private var revokeConfirm = false
    @State private var greeting = DashboardView.randomGreeting()

    private static func randomGreeting() -> String {
        let options = ["Welcome back", "Hey", "Hey there", "Hi", "Good to see you"]
        return options[Int.random(in: 0..<options.count)]
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    greetingSection

                    if let settings = switchSettings {
                        switchStatusSection(settings)
                        if !loadError.isEmpty {
                            Text(loadError).font(.caption).foregroundStyle(.red)
                        }
                        quickStatsSection
                        if !vaults.isEmpty {
                            vaultsSection
                        }
                    } else if !loadError.isEmpty {
                        Text(loadError).font(.caption).foregroundStyle(.red)
                    } else {
                        HStack { Spacer(); ProgressView(); Spacer() }.padding(.top, 40)
                    }
                }
                .padding(20)
            }
            .navigationTitle("Dashboard")
            .navigationBarTitleDisplayMode(.large)
            .refreshable { await load() }
            .background { AuthBackground() }
        }
        .onAppear { Task { await load() } }
        .confirmationDialog("Revoke all access?", isPresented: $revokeConfirm, titleVisibility: .visible) {
            Button("Revoke & reset", role: .destructive) { Task { await revoke() } }
        } message: {
            Text("This will invalidate all delivery links and restart your switch. Beneficiaries will lose portal access.")
        }
    }

    // MARK: - Status section (mirrors web SwitchStatusCard logic)

    @ViewBuilder
    private func switchStatusSection(_ sw: SwitchSettings) -> some View {
        switch sw.status {
        case "inactive":
            StatusBanner(
                icon: "exclamationmark.triangle.fill",
                title: "Your switch is not active",
                message: "Enable your Emergency Switch in Settings to protect your vault.",
                tint: .orange
            )

        case "paused":
            StatusBanner(
                icon: "pause.circle.fill",
                title: "Switch is paused",
                message: sw.pausedUntil.map { "Resumes \(formatDate($0))" } ?? "Paused indefinitely",
                tint: .secondary
            )

        case "triggered":
            let abortOpen = sw.abortDeadline.map { !isDeadlinePast($0) } ?? false
            StatusBanner(
                icon: "exclamationmark.triangle.fill",
                title: "Your switch has triggered",
                message: abortOpen
                    ? (sw.abortDeadline.map { "Abort window closes \(formatDate($0))" } ?? "Abort window is open.")
                    : "Delivery in progress — revoke to cut off access and reset your switch.",
                tint: .red,
                actionLabel: abortOpen
                    ? (isAborting ? nil : "I'm here")
                    : (isRevoking ? nil : "Revoke & reset"),
                actionRole: abortOpen ? .none : .destructive,
                isActionLoading: abortOpen ? isAborting : isRevoking,
                onAction: abortOpen
                    ? { Task { await abort() } }
                    : { revokeConfirm = true }
            )

        case "delivered":
            StatusBanner(
                icon: "checkmark.circle.fill",
                title: "Vault delivered",
                message: "Your vault was delivered to your beneficiaries. Revoke access to reset the switch.",
                tint: .red,
                actionLabel: isRevoking ? nil : "Revoke & reset",
                actionRole: .destructive,
                isActionLoading: isRevoking,
                onAction: { revokeConfirm = true }
            )

        default: // "active"
            let isOverdue = isDeadlinePast(sw.nextCheckinDeadline)
            let isUrgent = !isOverdue && hoursUntil(sw.nextCheckinDeadline).map { $0 < 24 } ?? false

            if isOverdue {
                StatusBanner(
                    icon: "exclamationmark.triangle.fill",
                    title: "Check-in overdue",
                    message: "Your check-in window has passed. Check in now to prevent vault delivery.",
                    tint: .red,
                    actionLabel: isCheckingIn ? nil : "Check in now",
                    isActionLoading: isCheckingIn,
                    onAction: { Task { await checkin() } }
                )
            } else {
                ActiveSwitchCard(
                    sw: sw,
                    isUrgent: isUrgent,
                    isCheckingIn: isCheckingIn,
                    checkinError: checkinError,
                    onCheckin: { Task { await checkin() } }
                )
            }
        }
    }

    // MARK: - Greeting

    @ViewBuilder
    private var greetingSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            let firstName = appState.user.map { u in
                let name = u.displayName.isEmpty ? u.email : u.displayName
                return name.components(separatedBy: " ").first ?? name
            } ?? "there"
            Text("\(greeting), \(firstName).")
                .font(.system(size: 26, weight: .bold))
            Text(subtitle)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .padding(.top, 8)
    }

    // MARK: - Quick stats

    @ViewBuilder
    private var quickStatsSection: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            StatCard(title: "Vaults", value: "\(vaults.count)", icon: "lock.fill", color: .accentColor)
            StatCard(title: "Beneficiaries", value: beneficiaryCount.map { "\($0)" } ?? "—", icon: "person.2.fill", color: .purple)
        }

        if let last = switchSettings?.lastCheckinAt {
            HStack(spacing: 6) {
                Image(systemName: "checkmark.circle").foregroundStyle(.secondary)
                Text("Last check-in: \(formatDate(last))").foregroundStyle(.secondary)
            }
            .font(.caption)
            .padding(.horizontal, 4)
        }
    }

    // MARK: - Vaults section

    @ViewBuilder
    private var vaultsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Your vaults")
                .font(.caption).fontWeight(.medium)
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
                .padding(.horizontal, 4)

            ForEach(Array(0..<min(vaults.count, 3)), id: \.self) { i in
                let vault = vaults[i]
                Button {
                    appState.selectedTab = "vaults"
                } label: {
                    HStack(spacing: 12) {
                        Text(vault.icon)
                            .font(.title3)
                        Text(vault.name)
                            .font(.subheadline)
                            .foregroundStyle(.primary)
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.caption).fontWeight(.semibold)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .vaultCardStyle(cornerRadius: 10, interactive: true)
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: - Subtitle

    private var subtitle: String {
        guard let sw = switchSettings else {
            return loadError.isEmpty ? "Loading..." : "Could not load status."
        }
        switch sw.status {
        case "active":
            if isDeadlinePast(sw.nextCheckinDeadline) {
                return "Your check-in is overdue — check in now."
            }
            let hrs = hoursUntil(sw.nextCheckinDeadline)
            if let hrs, hrs < 24 {
                return "Your check-in is coming up soon."
            }
            return "Everything looks good. Your vault is ready."
        case "paused": return "Your switch is currently paused."
        case "triggered":
            let abortOpen = sw.abortDeadline.map { !isDeadlinePast($0) } ?? false
            return abortOpen
                ? "Your vault is pending delivery — act now to cancel."
                : "Delivery is in progress."
        case "delivered": return "Your vault has been delivered to your beneficiaries."
        default: return "Let's get your vault set up."
        }
    }

    // MARK: - Helpers

    private func isDeadlinePast(_ iso: String?) -> Bool {
        guard let iso else { return false }
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = f.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) else { return false }
        return date < Date()
    }

    private func hoursUntil(_ iso: String?) -> Double? {
        guard let iso else { return nil }
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = f.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) else { return nil }
        return date.timeIntervalSinceNow / 3600
    }

    private func formatDate(_ iso: String) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = f.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) else { return iso }
        let rel = RelativeDateTimeFormatter()
        rel.unitsStyle = .full
        return rel.localizedString(for: date, relativeTo: Date())
    }

    // MARK: - Actions

    private func load() async {
        loadError = ""
        do {
            async let switchTask = APIService.shared.getSwitchSettings()
            async let vaultsTask = APIService.shared.listVaults()
            async let beneficiariesTask = APIService.shared.listBeneficiaries()
            let (settings, loadedVaults, beneficiaries) = try await (switchTask, vaultsTask, beneficiariesTask)
            switchSettings = settings
            vaults = loadedVaults
            beneficiaryCount = beneficiaries.count
        } catch let e as APIError {
            loadError = e.errorDescription ?? "Failed to load."
        } catch {
            loadError = error.localizedDescription
        }
    }

    private func checkin() async {
        checkinError = ""
        isCheckingIn = true
        defer { isCheckingIn = false }
        do {
            switchSettings = try await APIService.shared.checkin()
        } catch let e as APIError {
            checkinError = e.errorDescription ?? "Check-in failed."
        } catch {
            checkinError = error.localizedDescription
        }
    }

    private func abort() async {
        isAborting = true
        defer { isAborting = false }
        do { switchSettings = try await APIService.shared.abortTrigger() } catch {}
    }

    private func revoke() async {
        isRevoking = true
        defer { isRevoking = false }
        do {
            try await APIService.shared.revokeDeliveries()
            await load()
        } catch {}
    }
}

// MARK: - Status Banner

private struct StatusBanner: View {
    let icon: String
    let title: String
    let message: String
    let tint: Color
    var actionLabel: String? = nil
    var actionRole: ButtonRole? = nil
    var isActionLoading: Bool = false
    var onAction: (() -> Void)? = nil

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(tint)

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.subheadline).fontWeight(.semibold)
                    .foregroundStyle(tint)
                Text(message)
                    .font(.caption)
                    .foregroundStyle(tint == Color.secondary ? .secondary : tint.opacity(0.8))
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 8)

            if isActionLoading {
                ProgressView().tint(tint)
            } else if let label = actionLabel, let action = onAction {
                Button(role: actionRole, action: action) {
                    Text(label)
                        .font(.subheadline).fontWeight(.medium)
                        .fixedSize()
                }
                .vaultButtonStyle()
                .tint(tint)
            }
        }
        .padding(14)
        .background(tint == Color.secondary ? Color(.secondarySystemBackground) : tint.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(tint == Color.secondary ? Color(.separator) : tint.opacity(0.25), lineWidth: 1))
    }
}

// MARK: - Active Switch Card (healthy + urgent states)

private struct ActiveSwitchCard: View {
    let sw: SwitchSettings
    let isUrgent: Bool
    let isCheckingIn: Bool
    let checkinError: String
    let onCheckin: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Image(systemName: isUrgent ? "exclamationmark.triangle.fill" : "checkmark.shield.fill")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(isUrgent ? Color.orange : Color.accentColor)

            VStack(alignment: .leading, spacing: 3) {
                Text("Switch is active")
                    .font(.subheadline).fontWeight(.semibold)
                    .foregroundStyle(isUrgent ? Color.orange : Color.primary)
                Text(deadlineText)
                    .font(.caption)
                    .foregroundStyle(isUrgent ? Color.orange.opacity(0.8) : Color.secondary)
            }

            Spacer(minLength: 8)

            VStack(alignment: .trailing, spacing: 4) {
                if isCheckingIn {
                    ProgressView().tint(isUrgent ? .orange : .accentColor)
                } else {
                    Button(action: onCheckin) {
                        Text("Check in")
                            .font(.subheadline).fontWeight(.medium)
                            .fixedSize()
                    }
                    .vaultButtonStyle()
                    .tint(isUrgent ? .orange : .accentColor)
                }
                Text("Logging in also counts")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(14)
        .background(isUrgent ? Color.orange.opacity(0.08) : Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(isUrgent ? Color.orange.opacity(0.25) : Color(.separator), lineWidth: 1))

        if !checkinError.isEmpty {
            Text(checkinError).font(.caption).foregroundStyle(.red).padding(.horizontal, 4)
        }
    }

    private var deadlineText: String {
        guard let deadline = sw.nextCheckinDeadline else { return "Waiting for first check-in" }
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = f.date(from: deadline) ?? ISO8601DateFormatter().date(from: deadline) else { return deadline }
        let hours = date.timeIntervalSinceNow / 3600
        if isUrgent {
            if hours < 1 {
                return "Check in soon — due in less than an hour"
            } else {
                return "Check in soon — due in \(Int(hours))h"
            }
        } else {
            let days = Int(hours / 24)
            if days > 0 {
                return "Next check-in due in \(days) day\(days == 1 ? "" : "s")"
            } else {
                return "Next check-in due today"
            }
        }
    }
}

// MARK: - Stat Card

private struct StatCard: View {
    let title: String
    let value: String
    let icon: String
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Image(systemName: icon).font(.caption).foregroundStyle(color)
                Text(title).font(.caption).fontWeight(.medium).foregroundStyle(.secondary)
                    .textCase(.uppercase)
            }
            Text(value)
                .font(.system(size: 24, weight: .bold))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .vaultCardStyle(cornerRadius: 12)
    }
}

#Preview {
    DashboardView()
        .environment(AppState())
}
