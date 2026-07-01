import SwiftUI
import UserNotifications

// MARK: - App Delegate (push token + notification handling)

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    var onPushToken: ((String) -> Void)?

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        onPushToken?(token)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // Push registration failed — not fatal
    }

    // Show notifications even when app is in foreground
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound])
    }
}

// MARK: - App

@main
struct PS_VaultApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var appState = AppState()
    @State private var vaultStore = VaultStore()
    @State private var backgroundedAt: Date? = nil
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("appColorScheme") private var colorSchemePreference: String = "system"

    private var resolvedColorScheme: ColorScheme? {
        switch colorSchemePreference {
        case "dark": return .dark
        case "light": return .light
        default: return nil
        }
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(appState)
                .environment(vaultStore)
                .preferredColorScheme(resolvedColorScheme)
                .onOpenURL { url in
                    appState.pendingDeepLinkURL = url
                }
                .overlay {
                    // Privacy screen: cover content whenever the app is not active
                    // (inactive = transitioning, background = in app switcher / phone locked).
                    // Prevents the last-opened page from being visible on resume.
                    if scenePhase != .active {
                        ZStack {
                            AuthBackground()
                                .ignoresSafeArea()
                            Image("AppLogo")
                                .resizable()
                                .scaledToFit()
                                .frame(width: 88, height: 88)
                                .clipShape(RoundedRectangle(cornerRadius: 20))
                                .shadow(color: .black.opacity(0.18), radius: 12, x: 0, y: 4)
                        }
                        .ignoresSafeArea()
                        .environment(appState)
                    }
                }
        }
        .onChange(of: scenePhase) { _, newPhase in
            switch newPhase {
            case .background:
                if appState.isAuthenticated && !appState.isLocked {
                    if appState.lockTimeoutSeconds == 0 {
                        vaultStore.clear()
                        appState.lock()
                    } else {
                        backgroundedAt = Date()
                    }
                }
            case .active:
                if let bg = backgroundedAt, appState.isAuthenticated && !appState.isLocked {
                    let elapsed = Date().timeIntervalSince(bg)
                    if elapsed >= Double(appState.lockTimeoutSeconds) {
                        vaultStore.clear()
                        appState.lock()
                    }
                }
                backgroundedAt = nil
            default:
                break
            }
        }
        .onChange(of: appState.isAuthenticated, initial: true) { _, authenticated in
            if authenticated {
                registerForPushNotifications()
            }
        }
    }

    private func registerForPushNotifications() {
        UNUserNotificationCenter.current().delegate = appDelegate
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            guard granted else { return }
            DispatchQueue.main.async {
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
        appDelegate.onPushToken = { token in
            Task {
                try? await APIService.shared.registerPushToken(token, platform: "apns")
            }
        }
    }
}
