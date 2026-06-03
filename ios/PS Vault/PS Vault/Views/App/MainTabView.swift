import SwiftUI

struct MainTabView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        @Bindable var appState = appState
        TabView(selection: $appState.selectedTab) {
            Tab("Dashboard", systemImage: "house.fill", value: "dashboard") {
                DashboardView()
            }
            Tab("Vaults", systemImage: "lock.fill", value: "vaults") {
                VaultListView()
            }
            Tab("Contacts", systemImage: "person.2.fill", value: "contacts") {
                ContactsView()
            }
            Tab("Settings", systemImage: "gearshape.fill", value: "settings") {
                SettingsView()
            }
        }
        .task {
            if let branding = try? await APIService.shared.getBranding() {
                appState.accentHex = branding.accentColor
                appState.loginCountsAsCheckin = branding.loginCountsAsCheckin != "false"
            }
        }
    }
}
