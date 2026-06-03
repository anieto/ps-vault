import SwiftUI

struct AccountSettingsView: View {
    @Environment(AppState.self) private var appState
    @State private var displayName = ""
    @State private var isSaving = false
    @State private var saveError = ""
    @State private var saveSuccess = false
    @State private var showChangeEmail = false

    var body: some View {
        Form {
            Section("Profile") {
                if let user = appState.user {
                    LabeledContent("Email", value: user.email)
                    Button("Change email…") { showChangeEmail = true }
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text("Display name")
                        .font(.caption).foregroundStyle(.secondary)
                    TextField("Display name", text: $displayName)
                        .autocorrectionDisabled()
                }
            }

            if !saveError.isEmpty {
                Section {
                    Text(saveError).foregroundStyle(.red).font(.caption)
                }
            }
            if saveSuccess {
                Section {
                    Label("Saved successfully", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                        .font(.caption)
                }
            }

            Section {
                Button {
                    Task { await save() }
                } label: {
                    if isSaving {
                        ProgressView()
                    } else {
                        Text("Save Changes")
                    }
                }
                .disabled(displayName.isEmpty || isSaving)
            }
        }
        .scrollContentBackground(.hidden)
        .background { AuthBackground() }
        .navigationTitle("Account")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            displayName = appState.user?.displayName ?? ""
        }
        .sheet(isPresented: $showChangeEmail) {
            ChangeEmailView()
        }
    }

    private func save() async {
        saveError = ""
        saveSuccess = false
        isSaving = true
        defer { isSaving = false }
        do {
            let updated = try await APIService.shared.updateMe(displayName: displayName)
            appState.updateUser(updated)
            saveSuccess = true
        } catch let e as APIError {
            saveError = e.errorDescription ?? "Failed to save."
        } catch {
            saveError = error.localizedDescription
        }
    }
}

struct ChangeEmailView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var newEmail = ""
    @State private var password = ""
    @State private var isLoading = false
    @State private var error = ""
    @State private var sent = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("New email", text: $newEmail)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField("Current password", text: $password)
                }
                if !error.isEmpty {
                    Section { Text(error).foregroundStyle(.red).font(.caption) }
                }
                if sent {
                    Section {
                        Label("Verification email sent. Check your inbox.", systemImage: "envelope.badge.fill")
                            .foregroundStyle(.green)
                            .font(.caption)
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background { AuthBackground() }
            .navigationTitle("Change Email")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Send") { Task { await send() } }
                        .disabled(newEmail.isEmpty || password.isEmpty || isLoading || sent)
                }
            }
        }
    }

    private func send() async {
        error = ""
        isLoading = true
        defer { isLoading = false }
        do {
            try await APIService.shared.changeEmail(newEmail: newEmail, currentPassword: password)
            sent = true
        } catch let e as APIError {
            error = e.errorDescription ?? "Failed to change email."
        } catch {
            self.error = error.localizedDescription
        }
    }
}
