import SwiftUI

struct VaultDetailView: View {
    @Environment(VaultStore.self) private var vaultStore
    let vault: Vault

    @State private var vaultBeneficiaries: [VaultBeneficiary] = []
    @State private var allBeneficiaries: [Beneficiary] = []
    @State private var showGrantSheet = false
    @State private var revokeLoadingId: String? = nil

    var entries: [VaultEntry] { vaultStore.entries[vault.id] ?? [] }
    var cek: Data? { vaultStore.ceks[vault.id] }

    var body: some View {
        List {
            // MARK: Entries
            if entries.isEmpty {
                ContentUnavailableView("No entries", systemImage: "tray", description: Text("Add your first entry."))
            } else {
                ForEach(groupedEntries, id: \.type) { group in
                    Section(header: Label(group.label, systemImage: group.icon)) {
                        ForEach(group.entries) { entry in
                            NavigationLink(destination: EntryDetailView(vault: vault, entry: entry)) {
                                HStack {
                                    if entry.isFavorite {
                                        Image(systemName: "star.fill")
                                            .font(.caption).foregroundStyle(.yellow)
                                    }
                                    Text(entry.title)
                                }
                            }
                        }
                    }
                }
            }

            // MARK: Access
            Section {
                if vaultBeneficiaries.isEmpty {
                    Text("No beneficiaries have access yet.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(vaultBeneficiaries, id: \.id) { vb in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(vb.beneficiaryName)
                                    .font(.body)
                                Text(vb.beneficiaryEmail)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Label(vb.emailConfirmed ? "Confirmed" : "Invited",
                                  systemImage: vb.emailConfirmed ? "checkmark.circle.fill" : "envelope")
                                .font(.caption)
                                .foregroundStyle(vb.emailConfirmed ? .green : .secondary)
                                .labelStyle(.iconOnly)
                            Button(role: .destructive) {
                                Task { await revoke(vb) }
                            } label: {
                                if revokeLoadingId == vb.id {
                                    ProgressView()
                                } else {
                                    Image(systemName: "trash")
                                        .foregroundStyle(.red)
                                }
                            }
                            .buttonStyle(.plain)
                        }
                        .padding(.vertical, 2)
                    }
                }

                if cek != nil {
                    Button {
                        showGrantSheet = true
                    } label: {
                        Label("Grant Access", systemImage: "person.badge.plus")
                    }
                }
            } header: {
                Text("Access (\(vaultBeneficiaries.count))")
            }
        }
        .navigationTitle("\(vault.icon) \(vault.name)")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                NavigationLink(destination: NewEntryView(vault: vault)) {
                    Image(systemName: "plus")
                }
            }
        }
        .task {
            async let _ = vaultStore.loadEntries(vaultId: vault.id)
            await loadAccess()
        }
        .refreshable {
            try? await vaultStore.loadEntries(vaultId: vault.id)
            await loadAccess()
        }
        .sheet(isPresented: $showGrantSheet) {
            GrantAccessSheet(
                available: availableBeneficiaries,
                allBeneficiaries: allBeneficiaries,
                onGrant: { beneficiaryId, accessKey in
                    try await grantAccess(beneficiaryId: beneficiaryId, accessKey: accessKey)
                },
                onCancel: { showGrantSheet = false }
            )
        }
    }

    // MARK: - Helpers

    private var availableBeneficiaries: [Beneficiary] {
        let assigned = Set(vaultBeneficiaries.map { $0.beneficiaryId })
        return allBeneficiaries.filter { !assigned.contains($0.id) }
    }

    // MARK: - Actions

    private func loadAccess() async {
        async let vbs = try? APIService.shared.getVaultBeneficiaries(vaultId: vault.id)
        async let bs = try? APIService.shared.listBeneficiaries()
        vaultBeneficiaries = await vbs ?? []
        allBeneficiaries = await bs ?? []
    }

    private func grantAccess(beneficiaryId: String, accessKey: String) async throws {
        guard let cek else { return }
        let envelope = try CryptoService.wrapCEKForBeneficiary(
            cek: cek,
            sharedSecret: accessKey.trimmingCharacters(in: .whitespaces)
        )
        try await APIService.shared.assignBeneficiary(
            vaultId: vault.id,
            beneficiaryId: beneficiaryId,
            cekEnvelope: envelope
        )
        showGrantSheet = false
        await loadAccess()
    }

    private func revoke(_ vb: VaultBeneficiary) async {
        revokeLoadingId = vb.id
        defer { revokeLoadingId = nil }
        do {
            try await APIService.shared.removeVaultBeneficiary(vaultId: vault.id, beneficiaryId: vb.beneficiaryId)
            await loadAccess()
        } catch {}
    }

    // MARK: - Grouped entries

    private var groupedEntries: [(type: String, label: String, icon: String, entries: [VaultEntry])] {
        let groups: [(type: String, label: String, icon: String)] = [
            ("contact", "Contacts", "person.fill"),
            ("login", "Logins", "key.fill"),
            ("financial", "Financial Accounts", "building.columns.fill"),
            ("card", "Cards", "creditcard.fill"),
            ("identity", "Identity Documents", "creditcard.and.123"),
            ("crypto", "Crypto", "bitcoinsign.circle.fill"),
            ("file", "Documents", "paperclip"),
            ("note", "Notes", "note.text"),
            ("custom", "Other", "square.grid.2x2.fill"),
        ]
        return groups.compactMap { g in
            let items = entries
                .filter { $0.entryType == g.type }
                .sorted {
                    if $0.isFavorite != $1.isFavorite { return $0.isFavorite }
                    return $0.sortOrder < $1.sortOrder
                }
            guard !items.isEmpty else { return nil }
            return (g.type, g.label, g.icon, items)
        }
    }
}

// MARK: - Grant Access Sheet
// Uses NavigationLink → List(items) for beneficiary selection to avoid
// ForEach([Beneficiary]) Binding<C> overload inference bug in iOS 26.
private struct GrantAccessSheet: View {
    let available: [Beneficiary]
    let allBeneficiaries: [Beneficiary]
    let onGrant: (String, String) async throws -> Void
    let onCancel: () -> Void

    @State private var selectedBeneficiary: Beneficiary? = nil
    @State private var keyText = ""
    @State private var isGranting = false
    @State private var grantError = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Beneficiary") {
                    if available.isEmpty {
                        Text(allBeneficiaries.isEmpty
                             ? "No beneficiaries yet. Add one from the Beneficiaries tab."
                             : "All beneficiaries already have access.")
                            .font(.caption).foregroundStyle(.secondary)
                    } else {
                        NavigationLink {
                            BeneficiarySelectionView(
                                options: available.map { BeneficiaryOption(beneficiaryId: $0.id, name: $0.name, email: $0.email) },
                                currentId: selectedBeneficiary?.id,
                                onSelect: { id in selectedBeneficiary = available.first { $0.id == id } }
                            )
                        } label: {
                            HStack {
                                Text("Select Beneficiary")
                                Spacer()
                                Text(selectedBeneficiary?.name ?? "None")
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                Section {
                    TextField("A word or phrase to share privately", text: $keyText)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } header: {
                    Text("Access Key")
                } footer: {
                    Text("Share this with your beneficiary in person or via a secure channel — it is never stored on the server.")
                }

                if !grantError.isEmpty {
                    Section {
                        Text(grantError).foregroundStyle(.red).font(.caption)
                    }
                }
            }
            .navigationTitle("Grant Access")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: onCancel)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Grant") {
                        Task {
                            isGranting = true
                            grantError = ""
                            defer { isGranting = false }
                            do {
                                guard let b = selectedBeneficiary else { return }
                                try await onGrant(b.id, keyText)
                            } catch let e as CryptoError {
                                grantError = e.errorDescription ?? "Encryption failed."
                            } catch let e as APIError {
                                grantError = e.errorDescription ?? "Failed to grant access."
                            } catch {
                                grantError = error.localizedDescription
                            }
                        }
                    }
                    .fontWeight(.semibold)
                    .disabled(selectedBeneficiary == nil || keyText.trimmingCharacters(in: .whitespaces).isEmpty || isGranting)
                }
            }
        }
    }
}

