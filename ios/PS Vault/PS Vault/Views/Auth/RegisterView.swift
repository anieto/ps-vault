import SwiftUI

struct RegisterView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var displayName = ""
    @State private var error = ""
    @State private var isLoading = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    AuthField {
                        Image(systemName: "person")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(.secondary)
                        TextField("Display name (optional)", text: $displayName)
                            .textInputAutocapitalization(.words)
                    }
                    AuthField {
                        Image(systemName: "envelope")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(.secondary)
                        TextField("Email", text: $email)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }
                    AuthField {
                        Image(systemName: "lock")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(.secondary)
                        SecureField("Password", text: $password)
                    }
                    AuthField {
                        Image(systemName: "lock")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(.secondary)
                        SecureField("Confirm password", text: $confirmPassword)
                            .onSubmit { Task { await register() } }
                    }
                    if !error.isEmpty {
                        Label(error, systemImage: "exclamationmark.circle.fill")
                            .font(.caption).foregroundStyle(.red)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    Button(action: { Task { await register() } }) {
                        Group {
                            if isLoading { ProgressView().tint(.white) }
                            else { Text("Create account").fontWeight(.semibold) }
                        }
                        .frame(maxWidth: .infinity).frame(height: 50)
                    }
                    .buttonStyle(.borderedProminent)
                    .padding(.top, 4)
                    .disabled(email.isEmpty || password.isEmpty || isLoading)
                }
                .padding(24)
            }
            .dismissKeyboardOnTap()
            .navigationTitle("Create account")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private func register() async {
        guard password == confirmPassword else { error = "Passwords don't match."; return }
        error = ""
        isLoading = true
        defer { isLoading = false }
        do {
            // Generate MEK and salt, derive KEK, wrap MEK
            let mek = CryptoService.generateKey()
            let saltData = CryptoService.generateSalt()
            let mekSaltHexStr = saltData.map { String(format: "%02x", $0) }.joined()
            let kek = try CryptoService.deriveKEK(
                password: password,
                mekSaltHex: mekSaltHexStr,
                argon2ParamsJSON: CryptoService.defaultArgon2ParamsJSON
            )
            let mekEnvelope = try CryptoService.wrapKey(mek, with: kek)

            let response = try await APIService.shared.register(
                email: email,
                password: password,
                displayName: displayName.isEmpty ? email : displayName,
                mekSalt: mekSaltHexStr,
                mekEnvelope: mekEnvelope
            )
            guard let accessToken = response.accessToken,
                  let refreshToken = response.refreshToken,
                  let user = response.user else {
                error = "Unexpected response from server."
                return
            }
            appState.signIn(accessToken: accessToken, refreshToken: refreshToken, user: user, mek: mek)
            // Persist crypto params for future password unlock
            appState.saveCryptoParams(
                mekSalt: mekSaltHexStr,
                mekEnvelope: mekEnvelope,
                argon2Params: CryptoService.defaultArgon2ParamsJSON
            )
            dismiss()
        } catch let e as APIError {
            error = e.errorDescription ?? "Registration failed."
        } catch {
            self.error = error.localizedDescription
        }
    }
}
