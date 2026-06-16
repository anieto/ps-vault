import SwiftUI
import LocalAuthentication

struct RootView: View {
    @Environment(AppState.self) private var appState
    @Environment(VaultStore.self) private var vaultStore

    var body: some View {
        Group {
            if appState.serverURL.isEmpty {
                SetupView()
            } else if !appState.isAuthenticated {
                LoginView()
            } else if appState.isLocked {
                LockView()
            } else {
                MainTabView()
            }
        }
        .animation(.easeInOut(duration: 0.2), value: appState.serverURL.isEmpty)
        .animation(.easeInOut(duration: 0.2), value: appState.isAuthenticated)
        .animation(.easeInOut(duration: 0.2), value: appState.isLocked)
        .sheet(isPresented: biometricPromptSheet) {
            BiometricSetupSheet()
                .environment(appState)
        }
        .sheet(isPresented: deepLinkCheckin) {
            CheckinConfirmView()
        }
        .sheet(item: deepLinkResetToken) { token in
            ResetPasswordView(token: token.value)
        }
        .sheet(item: deepLinkVerifyToken) { token in
            VerifyEmailView(token: token.value)
        }
    }

    // MARK: - Biometric prompt binding

    private var biometricPromptSheet: Binding<Bool> {
        Binding(
            get: {
                guard appState.pendingBiometricPrompt else { return false }
                let ctx = LAContext()
                var err: NSError?
                return ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &err)
            },
            set: { if !$0 { appState.pendingBiometricPrompt = false } }
        )
    }

    // MARK: - Deep link bindings

    private var deepLinkCheckin: Binding<Bool> {
        Binding(
            get: {
                guard let url = appState.pendingDeepLinkURL else { return false }
                return url.host == "checkin-confirm"
            },
            set: { if !$0 { appState.pendingDeepLinkURL = nil } }
        )
    }

    private var deepLinkResetToken: Binding<StringWrapper?> {
        Binding(
            get: {
                guard let url = appState.pendingDeepLinkURL,
                      url.host == "reset-password",
                      let token = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                        .queryItems?.first(where: { $0.name == "token" })?.value
                else { return nil }
                return StringWrapper(token)
            },
            set: { if $0 == nil { appState.pendingDeepLinkURL = nil } }
        )
    }

    private var deepLinkVerifyToken: Binding<StringWrapper?> {
        Binding(
            get: {
                guard let url = appState.pendingDeepLinkURL,
                      url.host == "verify",
                      let token = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                        .queryItems?.first(where: { $0.name == "token" })?.value
                else { return nil }
                return StringWrapper(token)
            },
            set: { if $0 == nil { appState.pendingDeepLinkURL = nil } }
        )
    }
}

/// Thin Identifiable wrapper so a String can drive `.sheet(item:)`.
struct StringWrapper: Identifiable {
    let id = UUID()
    let value: String
    init(_ value: String) { self.value = value }
}

private struct BiometricSetupSheet: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    private var biometryType: LABiometryType {
        let ctx = LAContext()
        var err: NSError?
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &err) else { return .none }
        return ctx.biometryType
    }

    private var biometryName: String {
        biometryType == .faceID ? "Face ID" : "Touch ID"
    }

    private var biometryIcon: String {
        biometryType == .faceID ? "faceid" : "touchid"
    }

    var body: some View {
        VStack(spacing: 24) {
            Spacer().frame(height: 8)
            Image(systemName: biometryIcon)
                .font(.system(size: 56))
                .foregroundStyle(.primary)
            VStack(spacing: 8) {
                Text("Enable \(biometryName)?")
                    .font(.title2.bold())
                Text("Unlock P.S. Vault quickly with \(biometryName) instead of entering your password each time.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
            VStack(spacing: 12) {
                Button("Enable \(biometryName)") {
                    appState.biometricEnabled = true
                    UserDefaults.standard.set(true, forKey: "has_prompted_biometrics")
                    appState.pendingBiometricPrompt = false
                    dismiss()
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .frame(maxWidth: .infinity)

                Button("Not Now") {
                    UserDefaults.standard.set(true, forKey: "has_prompted_biometrics")
                    appState.pendingBiometricPrompt = false
                    dismiss()
                }
                .foregroundStyle(.secondary)
                .controlSize(.large)
            }
            .padding(.horizontal)
            Spacer()
        }
        .padding(32)
        .presentationDetents([.medium])
    }
}
