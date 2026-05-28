import SwiftUI

struct VaultListView: View {
    @Environment(AppState.self) private var appState
    @Environment(VaultStore.self) private var vaultStore
    @State private var showNewVault = false

    var body: some View {
        NavigationStack {
            Group {
                if vaultStore.vaults.isEmpty && !vaultStore.isLoading {
                    ContentUnavailableView("No vaults", systemImage: "lock", description: Text("Create a vault to get started."))
                } else {
                    List(vaultStore.vaults) { vault in
                        NavigationLink(destination: VaultDetailView(vault: vault)) {
                            HStack(spacing: 12) {
                                Text(vault.icon)
                                    .font(.system(size: 24))
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(vault.name)
                                        .font(.body).fontWeight(.medium)
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
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }
            }
            .navigationTitle("Vaults")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showNewVault = true } label: {
                        Image(systemName: "plus")
                    }
                }
            }
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
