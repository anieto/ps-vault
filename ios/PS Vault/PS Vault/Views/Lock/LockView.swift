import SwiftUI
import LocalAuthentication

struct LockView: View {
    @Environment(AppState.self) private var appState
    @State private var password = ""
    @State private var error = ""
    @State private var isLoading = false

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: 8) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 48))
                    .foregroundStyle(.tint)
                Text("Vault Locked")
                    .font(.system(size: 26, weight: .bold))
                Text("Authenticate to continue.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .padding(.bottom, 40)

            if appState.biometricEnabled {
                Button(action: { Task { await unlockBiometric() } }) {
                    Label("Use Face ID / Touch ID", systemImage: "faceid")
                        .frame(maxWidth: .infinity)
                        .frame(height: 50)
                }
                .buttonStyle(.borderedProminent)
                .padding(.horizontal, 32)

                Text("or enter your password")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 12)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Password")
                    .font(.caption).fontWeight(.medium).foregroundStyle(.secondary)
                SecureField("Password", text: $password)
                    .textFieldStyle(.roundedBorder)
                    .onSubmit { Task { await unlockWithPassword() } }
            }
            .padding(.horizontal, 32)

            if !error.isEmpty {
                Text(error)
                    .font(.caption).foregroundStyle(.red)
                    .padding(.horizontal, 32)
                    .padding(.top, 6)
            }

            Button(action: { Task { await unlockWithPassword() } }) {
                Group {
                    if isLoading { ProgressView().tint(.white) }
                    else { Text("Unlock").fontWeight(.semibold) }
                }
                .frame(maxWidth: .infinity).frame(height: 50)
            }
            .buttonStyle(.bordered)
            .padding(.horizontal, 32)
            .padding(.top, 12)
            .disabled(password.isEmpty || isLoading)

            Spacer()

            Button("Sign out", role: .destructive) { appState.signOut() }
                .font(.subheadline)
                .padding(.bottom, 32)
        }
        .task {
            if appState.biometricEnabled {
                await unlockBiometric()
            }
        }
    }

    private func unlockBiometric() async {
        let context = LAContext()
        var authError: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &authError) else { return }
        do {
            let success = try await context.evaluatePolicy(
                .deviceOwnerAuthenticationWithBiometrics,
                localizedReason: "Unlock P.S. Vault"
            )
            guard success else { return }
            guard let refreshToken = Keychain.get(Keychain.Key.refreshToken) else { return }
            let response = try await APIService.shared.refreshToken(refreshToken)
            guard let accessToken = response.accessToken else { return }
            if let newRefresh = response.refreshToken {
                Keychain.set(newRefresh, key: Keychain.Key.refreshToken)
            }
            let mek = appState.loadMEKFromKeychain()
            appState.unlock(accessToken: accessToken, mek: mek, user: response.user)
        } catch {
            // User cancelled or biometric failed — fall through to password
        }
    }

    private func unlockWithPassword() async {
        let mekSalt = appState.storedMekSalt
        let mekEnvelope = appState.storedMekEnvelope
        let argon2Params = appState.storedArgon2Params
        guard !mekSalt.isEmpty, !mekEnvelope.isEmpty, !argon2Params.isEmpty else {
            error = "Cannot unlock — stored credentials not found. Please sign out and sign in again."
            return
        }
        error = ""
        isLoading = true
        defer { isLoading = false }
        do {
            let kek = try CryptoService.deriveKEK(password: password, mekSaltHex: mekSalt, argon2ParamsJSON: argon2Params)
            let mek = try CryptoService.unwrapMEK(envelope: mekEnvelope, kek: kek)
            guard let refreshToken = Keychain.get(Keychain.Key.refreshToken) else {
                error = "Session expired. Please sign out and sign in again."
                return
            }
            let response = try await APIService.shared.refreshToken(refreshToken)
            guard let accessToken = response.accessToken else {
                error = "Failed to get access token."
                return
            }
            if let newRefresh = response.refreshToken {
                Keychain.set(newRefresh, key: Keychain.Key.refreshToken)
            }
            Keychain.set(mek.base64EncodedString(), key: Keychain.Key.mek)
            appState.unlock(accessToken: accessToken, mek: mek, user: response.user)
        } catch is CryptoError {
            error = "Incorrect password."
        } catch let e as APIError {
            error = e.errorDescription ?? "Unlock failed."
        } catch {
            self.error = error.localizedDescription
        }
    }
}
