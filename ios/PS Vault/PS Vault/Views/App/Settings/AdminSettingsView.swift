import SwiftUI

struct AdminSettingsView: View {
    @Environment(AppState.self) private var appState
    @State private var config: [String: String] = [:]
    @State private var isLoading = true
    @State private var error: String? = nil

    private var adminURL: URL? {
        let base = appState.serverURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return URL(string: "\(base)/admin")
    }

    var body: some View {
        List {
            if isLoading {
                Section {
                    HStack {
                        Spacer()
                        ProgressView()
                        Spacer()
                    }
                }
            } else if let error {
                Section {
                    Text(error)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            } else {
                Section {
                    if let url = adminURL {
                        Link(destination: url) {
                            Label("Open Admin Panel", systemImage: "arrow.up.right.square")
                                .foregroundStyle(.tint)
                        }
                    }
                } footer: {
                    Text("Full configuration, user management, audit log, and email queue are available in the web admin panel.")
                }

                Section("General") {
                    AdminConfigRow(
                        label: "Registration",
                        value: {
                            switch config["registration_mode"] ?? "invite" {
                            case "open": return "Open"
                            case "closed": return "Closed"
                            default: return "Invite only"
                            }
                        }()
                    )
                    AdminConfigRow(
                        label: "Max upload size",
                        value: "\(config["max_file_size_mb"] ?? "100") MB"
                    )
                    AdminConfigRow(
                        label: "Login counts as check-in",
                        value: (config["login_counts_as_checkin"] ?? "true") == "false" ? "No" : "Yes"
                    )
                    AdminConfigRow(
                        label: "Downtime grace period",
                        value: "\(config["downtime_grace_threshold_hours"] ?? "1") hr"
                    )
                    AdminConfigRow(
                        label: "Cascade window default",
                        value: "\(config["cascade_window_default"] ?? "14") days"
                    )
                }

                Section("Storage") {
                    AdminConfigRow(
                        label: "Backend",
                        value: (config["storage_backend"] ?? "local") == "s3" ? "S3-compatible" : "Local disk"
                    )
                    if (config["storage_backend"] ?? "local") == "s3" {
                        if let bucket = config["s3_bucket"], !bucket.isEmpty {
                            AdminConfigRow(label: "S3 bucket", value: bucket)
                        }
                        if let region = config["s3_region"], !region.isEmpty {
                            AdminConfigRow(label: "S3 region", value: region)
                        }
                        if let endpoint = config["s3_endpoint"], !endpoint.isEmpty {
                            AdminConfigRow(label: "S3 endpoint", value: endpoint)
                        }
                    }
                }

                Section("SMTP") {
                    if let host = config["smtp_host_override"], !host.isEmpty {
                        let port = config["smtp_port_override"] ?? ""
                        AdminConfigRow(label: "Host", value: port.isEmpty ? host : "\(host):\(port)")
                        if let from = config["smtp_from_override"], !from.isEmpty {
                            AdminConfigRow(label: "From", value: from)
                        }
                        AdminConfigRow(label: "TLS mode", value: config["smtp_tls_override"] ?? "tls")
                    } else {
                        Text("Using environment defaults")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Branding") {
                    if let name = config["app_name_override"], !name.isEmpty {
                        AdminConfigRow(label: "App name", value: name)
                    } else {
                        AdminConfigRow(label: "App name", value: "Default (P.S. Vault)")
                    }
                    if let color = config["app_accent_color"], !color.isEmpty {
                        HStack {
                            Text("Accent color")
                                .font(.subheadline)
                            Spacer()
                            HStack(spacing: 6) {
                                Circle()
                                    .fill(hexColor(color))
                                    .frame(width: 14, height: 14)
                                Text(color)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    } else {
                        AdminConfigRow(label: "Accent color", value: "Default")
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background { AuthBackground() }
        .navigationTitle("Admin")
        .navigationBarTitleDisplayMode(.large)
        .task { await load() }
    }

    private func load() async {
        isLoading = true
        error = nil
        do {
            config = try await APIService.shared.getAdminConfig()
        } catch {
            self.error = "Could not load admin configuration."
        }
        isLoading = false
    }

    private func hexColor(_ hex: String) -> Color {
        let h = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        guard h.count == 6, let value = UInt64(h, radix: 16) else { return .accentColor }
        let r = Double((value >> 16) & 0xFF) / 255
        let g = Double((value >> 8) & 0xFF) / 255
        let b = Double(value & 0xFF) / 255
        return Color(red: r, green: g, blue: b)
    }
}

private struct AdminConfigRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label)
                .font(.subheadline)
            Spacer()
            Text(value)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }
}
