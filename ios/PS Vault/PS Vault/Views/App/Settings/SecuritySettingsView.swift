import SwiftUI

struct SecuritySettingsView: View {
    @Environment(AppState.self) private var appState
    @State private var showMFASetup = false
    @State private var showMFADisable = false
    @State private var showChangePassword = false
    @State private var error = ""

    var body: some View {
        Form {
            Section("Two-Factor Authentication") {
                if let user = appState.user {
                    HStack {
                        Label(user.mfaEnabled ? "Enabled" : "Disabled",
                              systemImage: user.mfaEnabled ? "checkmark.shield.fill" : "shield.slash")
                            .foregroundStyle(user.mfaEnabled ? .green : .secondary)
                        Spacer()
                    }
                    if user.mfaEnabled {
                        Button(role: .destructive) {
                            showMFADisable = true
                        } label: {
                            Label("Disable 2FA", systemImage: "xmark.shield")
                        }
                    } else {
                        Button {
                            showMFASetup = true
                        } label: {
                            Label("Enable 2FA", systemImage: "plus.circle")
                        }
                    }
                }
            }

            Section("Password") {
                Button("Change Password…") { showChangePassword = true }
            }

            Section("App Lock") {
                @Bindable var state = appState
                Toggle("Biometric unlock", isOn: $state.biometricEnabled)
                Picker("Auto-lock", selection: $state.lockTimeoutSeconds) {
                    Text("Immediately").tag(0)
                    Text("30 seconds").tag(30)
                    Text("1 minute").tag(60)
                    Text("2 minutes").tag(120)
                    Text("5 minutes").tag(300)
                    Text("10 minutes").tag(600)
                    Text("15 minutes").tag(900)
                    Text("30 minutes").tag(1800)
                    Text("1 hour").tag(3600)
                }
            }

            Section("Clipboard") {
                @Bindable var state = appState
                Stepper("Clear after \(appState.clipboardTimeoutSeconds)s",
                        value: $state.clipboardTimeoutSeconds,
                        in: 10...300, step: 5)
            }

            if !error.isEmpty {
                Section { Text(error).foregroundStyle(.red).font(.caption) }
            }
        }
        .navigationTitle("Security")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showMFASetup) {
            MFASetupView { updatedUser in
                appState.updateUser(updatedUser)
            }
        }
        .sheet(isPresented: $showMFADisable) {
            MFADisableView { updatedUser in
                appState.updateUser(updatedUser)
            }
        }
        .sheet(isPresented: $showChangePassword) {
            ChangePasswordView()
        }
    }

}

// MARK: - MFA Setup Flow

struct MFASetupView: View {
    @Environment(\.dismiss) private var dismiss
    var onComplete: (User) -> Void

    @State private var setupResponse: TOTPSetupResponse? = nil
    @State private var code = ""
    @State private var isLoading = false
    @State private var error = ""
    @State private var backupCodes: [String] = []
    @State private var showBackupCodes = false

    var body: some View {
        NavigationStack {
            Group {
                if showBackupCodes {
                    backupCodesView
                } else if let setup = setupResponse {
                    confirmView(setup: setup)
                } else {
                    setupLoadingView
                }
            }
            .navigationTitle("Enable 2FA")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    if !showBackupCodes {
                        Button("Cancel") { dismiss() }
                    }
                }
            }
        }
        .task { await loadSetup() }
    }

    private var setupLoadingView: some View {
        VStack(spacing: 16) {
            if !error.isEmpty {
                Text(error).foregroundStyle(.red).font(.caption)
                Button("Retry") { Task { await loadSetup() } }
            } else {
                ProgressView("Loading…")
            }
        }
        .padding()
    }

    private func confirmView(setup: TOTPSetupResponse) -> some View {
        Form {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Scan this code in your authenticator app, or enter the secret manually.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }

            Section("Secret Key") {
                HStack {
                    Text(setup.secret)
                        .font(.system(.body, design: .monospaced))
                        .foregroundStyle(.primary)
                    Spacer()
                    Button {
                        UIPasteboard.general.string = setup.secret
                    } label: {
                        Image(systemName: "doc.on.doc")
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                }
            }

            Section("Verify") {
                TextField("6-digit code", text: $code)
                    .keyboardType(.numberPad)
                    .font(.system(.body, design: .monospaced))

                if !error.isEmpty {
                    Text(error).foregroundStyle(.red).font(.caption)
                }

                Button {
                    Task { await confirm(setup: setup) }
                } label: {
                    if isLoading { ProgressView() }
                    else { Text("Enable 2FA") }
                }
                .disabled(code.count < 6 || isLoading)
            }
        }
    }

    private var backupCodesView: some View {
        Form {
            Section {
                Text("Save these backup codes somewhere safe. Each can be used once to sign in if you lose your authenticator.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Section("Backup Codes") {
                ForEach(backupCodes, id: \.self) { code in
                    Text(code)
                        .font(.system(.body, design: .monospaced))
                }
            }
            Section {
                Button("Copy All Codes") {
                    UIPasteboard.general.string = backupCodes.joined(separator: "\n")
                }
                Button("Done") { dismiss() }
                    .fontWeight(.semibold)
            }
        }
    }

    private func loadSetup() async {
        isLoading = true
        error = ""
        defer { isLoading = false }
        do {
            setupResponse = try await APIService.shared.setupTOTP()
        } catch let e as APIError {
            error = e.errorDescription ?? "Failed to load setup."
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func confirm(setup: TOTPSetupResponse) async {
        error = ""
        isLoading = true
        defer { isLoading = false }
        do {
            try await APIService.shared.confirmTOTP(secret: setup.secret, code: code, backupCodes: setup.backupCodes)
            backupCodes = setup.backupCodes
            showBackupCodes = true
            let updatedUser = try await APIService.shared.getMe()
            onComplete(updatedUser)
        } catch let e as APIError {
            error = e.errorDescription ?? "Failed to enable 2FA."
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - MFA Disable

struct MFADisableView: View {
    @Environment(\.dismiss) private var dismiss
    var onComplete: (User) -> Void

    @State private var code = ""
    @State private var isLoading = false
    @State private var error = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Enter a 6-digit code from your authenticator app to disable 2FA.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Section("Authentication Code") {
                    TextField("000000", text: $code)
                        .keyboardType(.numberPad)
                        .font(.system(.body, design: .monospaced))
                    if !error.isEmpty {
                        Text(error).foregroundStyle(.red).font(.caption)
                    }
                }
            }
            .navigationTitle("Disable 2FA")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Disable") { Task { await disable() } }
                        .foregroundStyle(.red)
                        .disabled(code.count < 6 || isLoading)
                }
            }
        }
    }

    private func disable() async {
        error = ""
        isLoading = true
        defer { isLoading = false }
        do {
            try await APIService.shared.disableMFA(code: code)
            let updatedUser = try await APIService.shared.getMe()
            onComplete(updatedUser)
            dismiss()
        } catch let e as APIError {
            error = e.errorDescription ?? "Failed to disable 2FA."
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Change Password

struct ChangePasswordView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var appState
    @State private var current = ""
    @State private var newPass = ""
    @State private var confirm = ""
    @State private var isLoading = false
    @State private var error = ""
    @State private var success = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    SecureField("Current password", text: $current)
                    SecureField("New password (12+ chars)", text: $newPass)
                    SecureField("Confirm new password", text: $confirm)
                }
                if !error.isEmpty {
                    Section { Text(error).foregroundStyle(.red).font(.caption) }
                }
                if success {
                    Section {
                        Label("Password changed successfully.", systemImage: "checkmark.circle.fill")
                            .foregroundStyle(.green).font(.caption)
                    }
                }
            }
            .navigationTitle("Change Password")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await change() } }
                        .disabled(!canSave || isLoading)
                }
            }
        }
    }

    private var canSave: Bool {
        !current.isEmpty && newPass.count >= 12 && newPass == confirm
    }

    private func change() async {
        error = ""
        isLoading = true
        defer { isLoading = false }
        guard let mek = appState.mek else {
            error = "Vault is locked. Unlock the app first."
            return
        }
        let argon2Params = appState.storedArgon2Params.isEmpty
            ? CryptoService.defaultArgon2ParamsJSON
            : appState.storedArgon2Params
        do {
            // Generate new salt and derive new KEK from new password
            let newSaltData = CryptoService.generateSalt()
            let newSaltHex = newSaltData.map { String(format: "%02x", $0) }.joined()
            let newKEK = try CryptoService.deriveKEK(
                password: newPass,
                mekSaltHex: newSaltHex,
                argon2ParamsJSON: argon2Params
            )
            let newMEKEnvelope = try CryptoService.wrapKey(mek, with: newKEK)
            try await APIService.shared.changePassword(
                currentPassword: current,
                newPassword: newPass,
                newMEKEnvelope: newMEKEnvelope
            )
            // Update stored crypto params for future unlocks
            appState.saveCryptoParams(
                mekSalt: newSaltHex,
                mekEnvelope: newMEKEnvelope,
                argon2Params: argon2Params
            )
            success = true
        } catch is CryptoError {
            error = "Encryption error. Please try again."
        } catch let e as APIError {
            error = e.errorDescription ?? "Failed to change password."
        } catch {
            self.error = error.localizedDescription
        }
    }
}
