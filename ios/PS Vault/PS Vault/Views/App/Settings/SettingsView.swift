import SwiftUI

struct SettingsView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        NavigationStack {
            List {
                Section("Account") {
                    NavigationLink(destination: AccountSettingsView()) {
                        Label("Account", systemImage: "person.circle")
                    }
                    NavigationLink(destination: SecuritySettingsView()) {
                        Label("Security", systemImage: "lock.shield")
                    }
                    NavigationLink(destination: SessionsSettingsView()) {
                        Label("Sessions", systemImage: "rectangle.connected.to.line.below")
                    }
                }
                Section("App") {
                    NavigationLink(destination: ServerSettingsView()) {
                        Label("Server", systemImage: "server.rack")
                    }
                    NavigationLink(destination: SwitchSettingsView()) {
                        Label("Emergency Switch", systemImage: "timer")
                    }
                }
                Section {
                    Button(role: .destructive) {
                        Task {
                            if let rt = Keychain.get(Keychain.Key.refreshToken) {
                                try? await APIService.shared.logout(refreshToken: rt)
                            }
                            appState.signOut()
                        }
                    } label: {
                        Label("Sign out", systemImage: "rectangle.portrait.and.arrow.right")
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Settings")
        }
    }
}
