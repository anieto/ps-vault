import SwiftUI
import LocalAuthentication

struct LockView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.scenePhase) private var scenePhase
    @State private var password = ""
    @State private var error = ""
    @State private var isLoading = false
    @State private var biometricAttempted = false

    var body: some View {
        ZStack {
        AuthBackground()
        GeometryReader { geo in
            ScrollView {
                VStack(spacing: 0) {
                    Spacer().frame(minHeight: 40)

                    // Branding
                    VStack(spacing: 12) {
                        Image("AppLogo")
                            .resizable()
                            .scaledToFit()
                            .frame(width: 100, height: 100)
                            .clipShape(RoundedRectangle(cornerRadius: 22))
                            .shadow(color: .black.opacity(0.15), radius: 10, x: 0, y: 4)
                        Text("Vault Locked")
                            .font(.system(size: 28, weight: .bold))
                        Text("Authenticate to continue.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.horizontal, 32)

                    Spacer().frame(height: 48)

                    // Password field + unlock button
                    VStack(spacing: 12) {
                        AuthField {
                            Image(systemName: "lock")
                                .font(.system(size: 15, weight: .medium))
                                .foregroundStyle(.secondary)
                            SecureField("Password", text: $password)
                                .onSubmit { Task { await unlockWithPassword() } }
                        }

                        if !error.isEmpty {
                            Label(error, systemImage: "exclamationmark.circle.fill")
                                .font(.caption).foregroundStyle(.red)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }

                        Button(action: { Task { await unlockWithPassword() } }) {
                            Group {
                                if isLoading { ProgressView().tint(.white) }
                                else { Text("Unlock").fontWeight(.semibold) }
                            }
                            .frame(maxWidth: .infinity).frame(height: 50)
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(password.isEmpty || isLoading)

                        if appState.biometricEnabled {
                            Text("or")
                                .font(.caption)
                                .foregroundStyle(.secondary)

                            Button(action: { Task { await unlockBiometric() } }) {
                                Label("Use Face ID / Touch ID", systemImage: "faceid")
                                    .frame(maxWidth: .infinity)
                                    .frame(height: 50)
                            }
                            .buttonStyle(.borderedProminent)
                        }
                    }
                    .padding(.horizontal, 32)

                    Spacer().frame(minHeight: 40)

                    Button("Sign out", role: .destructive) { appState.signOut() }
                        .font(.subheadline)
                        .padding(.bottom, 32)
                }
                .frame(minHeight: geo.size.height)
            }
            .dismissKeyboardOnTap()
        }
        } // ZStack
        .task {
            // Only attempt biometric on initial appearance if scene is already active.
            // If the phone is locking (scenePhase == .background), skip — the
            // .onChange below will handle it when the user returns.
            if appState.biometricEnabled && scenePhase == .active {
                biometricAttempted = true
                await unlockBiometric()
            }
        }
        .onChange(of: scenePhase) { _, newPhase in
            switch newPhase {
            case .background:
                // User genuinely backgrounded — reset so we retry on next return.
                biometricAttempted = false
            case .active:
                // Face ID presentation causes inactive→active without a background
                // transition. Guard on biometricAttempted to avoid retrying Face ID
                // every time the system Face ID sheet dismisses.
                if appState.biometricEnabled && !biometricAttempted {
                    biometricAttempted = true
                    Task { await unlockBiometric() }
                }
            default:
                break
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
