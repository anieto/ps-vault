import SwiftUI

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
