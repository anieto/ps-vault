import Foundation

@Observable
final class VaultStore {

    var vaults: [Vault] = []
    var entries: [String: [VaultEntry]] = [:]   // keyed by vault ID
    var ceks: [String: Data] = [:]              // decrypted CEKs, keyed by vault ID
    var isLoading: Bool = false

    // MARK: - Vaults

    func loadVaults(mek: Data? = nil) async {
        isLoading = true
        defer { isLoading = false }
        do {
            vaults = try await APIService.shared.listVaults()
            // Unwrap CEKs in parallel if MEK is available
            if let mek {
                await withTaskGroup(of: Void.self) { group in
                    for vault in vaults {
                        group.addTask { @MainActor [weak self] in
                            guard let self else { return }
                            let cek = try? CryptoService.unwrapCEK(envelope: vault.cekEnvelope, mek: mek)
                            if let cek {
                                self.ceks[vault.id] = cek
                            }
                        }
                    }
                }
            }
            // Load entry counts
            await withTaskGroup(of: Void.self) { group in
                for vault in vaults {
                    group.addTask { [weak self] in
                        guard let self else { return }
                        let fetched = try? await APIService.shared.listEntries(vaultId: vault.id)
                        if let fetched {
                            await MainActor.run { self.entries[vault.id] = fetched }
                        }
                    }
                }
            }
        } catch { }
    }

    // MARK: - Entries

    func loadEntries(vaultId: String) async throws {
        let fetched = try await APIService.shared.listEntries(vaultId: vaultId)
        entries[vaultId] = fetched
    }

    func addEntry(_ entry: VaultEntry, to vaultId: String) {
        entries[vaultId, default: []].append(entry)
    }

    func updateEntry(_ entry: VaultEntry, in vaultId: String) {
        guard var list = entries[vaultId],
              let idx = list.firstIndex(where: { $0.id == entry.id }) else { return }
        list[idx] = entry
        entries[vaultId] = list
    }

    func removeEntry(id: String, from vaultId: String) {
        entries[vaultId]?.removeAll { $0.id == id }
    }

    // MARK: - CEK

    func storeCEK(_ cek: Data, for vaultId: String) {
        ceks[vaultId] = cek
    }

    // MARK: - Clear (on lock / logout)

    func clear() {
        vaults = []
        entries = [:]
        ceks = [:]
    }
}
