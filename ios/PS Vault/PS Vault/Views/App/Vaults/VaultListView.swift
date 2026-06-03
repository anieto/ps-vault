import SwiftUI

struct VaultListView: View {
    @Environment(AppState.self) private var appState
    @Environment(VaultStore.self) private var vaultStore
    @State private var showNewVault = false

    var body: some View {
        @Bindable var appState = appState
        NavigationStack(path: $appState.vaultNavigationPath) {
            ScrollView {
                if vaultStore.vaults.isEmpty && !vaultStore.isLoading {
                    ContentUnavailableView("No vaults", systemImage: "lock", description: Text("Create a vault to get started."))
                        .padding(.top, 60)
                } else {
                    VStack(spacing: 12) {
                        ForEach(vaultStore.vaults) { vault in
                            NavigationLink(value: vault) {
                                HStack(spacing: 14) {
                                    Text(vault.icon)
                                        .font(.system(size: 36))
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(vault.name)
                                            .font(.body).fontWeight(.semibold)
                                            .foregroundStyle(.primary)
                                        HStack(spacing: 4) {
                                            Text("\(vaultStore.entries[vault.id]?.count ?? 0) entries")
                                            if vaultStore.ceks[vault.id] != nil {
                                                Image(systemName: "lock.open.fill")
                                                    .font(.caption2)
                                                    .foregroundStyle(.green)
                                            } else {
                                                Image(systemName: "lock.fill")
                                                    .font(.caption2)
                                                    .foregroundStyle(.orange)
                                            }
                                        }
                                        .font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                        .font(.caption).fontWeight(.semibold)
                                        .foregroundStyle(.tertiary)
                                }
                                .padding(16)
                                .vaultCardStyle(cornerRadius: 16, interactive: true)
                            }
                            .buttonStyle(.plain)
                        }
                        Button { showNewVault = true } label: {
                            HStack {
                                Label("Add Vault", systemImage: "plus.circle")
                                    .font(.body).fontWeight(.medium)
                                    .foregroundStyle(appState.brandColor)
                                Spacer()
                            }
                            .padding(16)
                            .vaultCardStyle(cornerRadius: 16, interactive: true)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 20)
                }
            }
            .navigationTitle("Vaults")
            .background { AuthBackground() }
            .navigationDestination(for: Vault.self) { vault in
                VaultDetailView(vault: vault)
            }
            .navigationDestination(for: EntryNavigation.self) { nav in
                EntryDetailView(vault: nav.vault, entry: nav.entry)
            }
            .navigationDestination(for: NewEntryNavigation.self) { nav in
                NewEntryView(vault: nav.vault)
                    .environment(vaultStore)
            }
            .navigationDestination(for: EditEntryNavigation.self) { nav in
                EditEntryView(vault: nav.vault, entry: nav.entry)
                    .environment(vaultStore)
            }
            .toolbar {}
            .task { await vaultStore.loadVaults(mek: appState.mek) }
            .refreshable { await vaultStore.loadVaults(mek: appState.mek) }
            .sheet(isPresented: $showNewVault) {
                NewVaultView()
            }
        }
    }
}

#Preview {
    VaultListView()
        .environment(AppState())
        .environment(VaultStore())
}
