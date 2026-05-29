import SwiftUI

struct SettingsView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        NavigationStack {
            List {
                Section("Emergency Switch") {
                    NavigationLink(destination: SwitchSettingsView()) {
                        Label("Switch Info", systemImage: "timer")
                    }
                }
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
                    NavigationLink(destination: AppearanceSettingsView()) {
                        Label("Appearance", systemImage: "circle.lefthalf.filled")
                    }
                    Link(destination: URL(string: "https://psvault.dev")!) {
                        Label("Support", systemImage: "questionmark.circle")
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
            .scrollContentBackground(.hidden)
            .background { AuthBackground() }
            .navigationTitle("Settings")
        }
    }
}
