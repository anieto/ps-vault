import SwiftUI

struct SessionsSettingsView: View {
    @State private var sessions: [Session] = []
    @State private var isLoading = false
    @State private var error = ""
    @State private var revokeAllConfirm = false

    var body: some View {
        List {
            if !error.isEmpty {
                Section {
                    Text(error).foregroundStyle(.red).font(.caption)
                }
            }

            if sessions.isEmpty && !isLoading {
                ContentUnavailableView("No sessions", systemImage: "rectangle.connected.to.line.below")
            } else {
                ForEach(sessions) { session in
                    SessionRow(session: session) {
                        await revoke(session)
                    }
                }
            }

            Section {
                Button(role: .destructive) {
                    revokeAllConfirm = true
                } label: {
                    Label("Sign out all other sessions", systemImage: "xmark.circle")
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background { AuthBackground() }
        .navigationTitle("Sessions")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
        .confirmationDialog("Sign out all other sessions?", isPresented: $revokeAllConfirm, titleVisibility: .visible) {
            Button("Sign Out All", role: .destructive) { Task { await revokeAll() } }
        } message: {
            Text("This will end all sessions except the current one.")
        }
    }

    private func load() async {
        isLoading = true
        error = ""
        defer { isLoading = false }
        do {
            sessions = try await APIService.shared.listSessions()
        } catch let e as APIError {
            error = e.errorDescription ?? "Failed to load sessions."
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func revoke(_ session: Session) async {
        do {
            try await APIService.shared.revokeSession(session.id)
            sessions.removeAll { $0.id == session.id }
        } catch let e as APIError {
            error = e.errorDescription ?? "Failed to revoke session."
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func revokeAll() async {
        do {
            try await APIService.shared.revokeAllSessions()
            await load()
        } catch let e as APIError {
            error = e.errorDescription ?? "Failed to revoke sessions."
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct SessionRow: View {
    let session: Session
    let onRevoke: () async -> Void

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text(deviceLabel)
                    .font(.body).fontWeight(.medium)
                HStack(spacing: 4) {
                    Text(session.ipAddress)
                    Text("·")
                    Text("Last used \(formatDate(session.lastUsedAt))")
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            Spacer()
            Button {
                Task { await onRevoke() }
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 2)
    }

    private var deviceLabel: String {
        let info = session.deviceInfo
        if info.isEmpty { return "Unknown device" }
        // Trim long user-agent strings to something readable
        if info.count > 60 { return String(info.prefix(60)) + "…" }
        return info
    }

    private func formatDate(_ iso: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = formatter.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
        guard let date else { return iso }
        let rel = RelativeDateTimeFormatter()
        rel.unitsStyle = .abbreviated
        return rel.localizedString(for: date, relativeTo: Date())
    }
}
