import SwiftUI

struct MainTabView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        TabView {
            Tab("Dashboard", systemImage: "house.fill") {
                DashboardView()
            }
            Tab("Vaults", systemImage: "lock.fill") {
                VaultListView()
            }
            Tab("Beneficiaries", systemImage: "person.2.fill") {
                BeneficiaryListView()
            }
            Tab("Settings", systemImage: "gearshape.fill") {
                SettingsView()
            }
        }
    }
}
