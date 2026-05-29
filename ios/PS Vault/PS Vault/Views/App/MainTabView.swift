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
            Tab("Beneficiaries", systemImage: "person.2.fill", value: "beneficiaries") {
                BeneficiaryListView()
            }
            Tab("Settings", systemImage: "gearshape.fill", value: "settings") {
                SettingsView()
            }
        }
    }
}
