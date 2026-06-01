import SwiftUI

struct VaultDetailView: View {
    @Environment(VaultStore.self) private var vaultStore
    let vault: Vault

    @State private var currentVault: Vault
    @State private var vaultBeneficiaries: [VaultBeneficiary] = []
    @State private var allBeneficiaries: [Beneficiary] = []
    @State private var showGrantSheet = false
    @State private var changeKeyVB: VaultBeneficiary? = nil
    @State private var expandedGroups: Set<String> = []

    // Access mode editing
    @State private var pendingAccessMode: String
    @State private var pendingCascadeWindow: Int
    @State private var pendingNotifyLocked: Bool
    @State private var isSavingAccessMode = false
    @State private var accessModeError = ""

    // Tier assignment
    @State private var tierTarget: VaultBeneficiary? = nil

    init(vault: Vault) {
        self.vault = vault
        _currentVault = State(initialValue: vault)
        _pendingAccessMode = State(initialValue: vault.accessMode)
        _pendingCascadeWindow = State(initialValue: max(1, vault.cascadeWindowDays))
        _pendingNotifyLocked = State(initialValue: vault.notifyLockedTiers)
    }

    var entries: [VaultEntry] { vaultStore.entries[vault.id] ?? [] }
    var cek: Data? { vaultStore.ceks[vault.id] }
    var isCascading: Bool { currentVault.accessMode == "cascading" }

    private var accessModeChanged: Bool {
        pendingAccessMode != currentVault.accessMode ||
        (pendingAccessMode == "cascading" && pendingCascadeWindow != currentVault.cascadeWindowDays)
    }

    var body: some View {
        List {
            contentsSection
            deliveryModeSection
            accessSection
        }
        .scrollContentBackground(.hidden)
        .background { AuthBackground() }
        .navigationTitle("\(vault.icon) \(vault.name)")
        .navigationBarTitleDisplayMode(.inline)
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
        .sheet(isPresented: Binding(
            get: { changeKeyVB != nil },
            set: { if !$0 { changeKeyVB = nil } }
        )) {
            if let vb = changeKeyVB, let cek {
                ChangeVaultKeySheet(vb: vb, cek: cek, onChanged: { await loadAccess() })
            }
        }
        .confirmationDialog(
            "Set tier for \(tierTarget?.beneficiaryName ?? "")",
            isPresented: Binding(get: { tierTarget != nil }, set: { if !$0 { tierTarget = nil } }),
            titleVisibility: .visible
        ) {
            Button("Primary") { Task { await setTier("primary") } }
            Button("Secondary") { Task { await setTier("secondary") } }
            Button("Tertiary") { Task { await setTier("tertiary") } }
            if tierTarget?.tier != nil {
                Button("Clear tier", role: .destructive) { Task { await setTier(nil) } }
            }
            Button("Cancel", role: .cancel) { tierTarget = nil }
        } message: {
            Text("Primary access is unlocked first. Secondary and tertiary unlock in sequence after the cascade window.")
        }
    }

    // MARK: - Contents section

    @ViewBuilder
    private var contentsSection: some View {
        Section(header: Text("Contents (\(entries.count))")) {
            if entries.isEmpty {
                Text("Add your first entry.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(groupedEntries, id: \.type) { group in
                    HStack {
                        Text(group.icon)
                        Text(group.label).foregroundStyle(.primary)
                        Text("\(group.entries.count)")
                            .font(.caption).foregroundStyle(.secondary)
                            .padding(.horizontal, 6).padding(.vertical, 1)
                            .background(Color(.systemFill))
                            .clipShape(Capsule())
                        Spacer()
                        Image(systemName: expandedGroups.contains(group.type) ? "chevron.down" : "chevron.right")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    .contentShape(Rectangle())
                    .onTapGesture {
                        if expandedGroups.contains(group.type) {
                            expandedGroups.remove(group.type)
                        } else {
                            expandedGroups.insert(group.type)
                        }
                    }

                    if expandedGroups.contains(group.type) {
                        ForEach(group.entries) { entry in
                            NavigationLink(value: EntryNavigation(vault: vault, entry: entry)) {
                                HStack {
                                    if entry.isFavorite {
                                        Image(systemName: "star.fill")
                                            .font(.caption).foregroundStyle(.yellow)
                                    }
                                    Text(entry.title)
                                }
                            }
                            .padding(.leading, 8)
                        }
                    }
                }
            }
            NavigationLink(value: NewEntryNavigation(vault: vault)) {
                Label("Add Entry", systemImage: "plus.circle")
            }
        }
    }

    // MARK: - Delivery mode section

    @ViewBuilder
    private var deliveryModeSection: some View {
        Section {
            Picker("Mode", selection: $pendingAccessMode) {
                Text("Simultaneous").tag("simultaneous")
                Text("Cascading").tag("cascading")
            }
            .pickerStyle(.segmented)
            .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 10, trailing: 16))

            if pendingAccessMode == "cascading" {
                Stepper(
                    "Cascade window: \(pendingCascadeWindow) day\(pendingCascadeWindow == 1 ? "" : "s")",
                    value: $pendingCascadeWindow, in: 1...90
                )
            }

            if pendingAccessMode == "cascading" {
                Toggle(isOn: $pendingNotifyLocked) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Notify secondary & tertiary on trigger")
                            .font(.body)
                        Text("Send a heads-up when the switch fires — no access link, just awareness that their turn is coming.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .onChange(of: pendingNotifyLocked) { _, newValue in
                    Task { await saveNotifyLocked(newValue) }
                }
            }

            if accessModeChanged {
                Button {
                    Task { await saveAccessMode() }
                } label: {
                    if isSavingAccessMode {
                        HStack { ProgressView(); Text("Saving...") }
                    } else {
                        Text("Save changes")
                    }
                }
                .disabled(isSavingAccessMode)
            }

            if !accessModeError.isEmpty {
                Text(accessModeError).font(.caption).foregroundStyle(.red)
            }
        } header: {
            Text("Delivery Mode")
        } footer: {
            if pendingAccessMode == "cascading" {
                Text("Tiers unlock in sequence. Primary beneficiaries first, then secondary after \(pendingCascadeWindow) day\(pendingCascadeWindow == 1 ? "" : "s"), then tertiary.")
            } else {
                Text("All beneficiaries receive access at the same time when the switch triggers.")
            }
        }
    }

    // MARK: - Access section

    @ViewBuilder
    private var accessSection: some View {
        Section {
            if vaultBeneficiaries.isEmpty {
                Text("No beneficiaries have access yet.")
                    .font(.subheadline).foregroundStyle(.secondary)
            } else {
                ForEach(vaultBeneficiaries, id: \.id) { vb in
                    beneficiaryRow(vb)
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
        } footer: {
            if !vaultBeneficiaries.isEmpty {
                if isCascading {
                    Text("Tap a beneficiary to assign their tier · Swipe right to change key · Swipe left to remove")
                } else if cek != nil {
                    Text("Swipe right to change a beneficiary's access key · Swipe left to remove")
                }
            }
        }
    }

    @ViewBuilder
    private func beneficiaryRow(_ vb: VaultBeneficiary) -> some View {
        HStack(spacing: 12) {
            VaultBeneficiaryAvatar(name: vb.beneficiaryName, photoData: vb.beneficiaryPhotoData, size: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(vb.beneficiaryName).font(.body)
                Text(vb.beneficiaryEmail).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            if isCascading {
                tierBadge(vb.tier, unlocked: vb.tierUnlockedAt != nil)
            }
            Label(vb.emailConfirmed ? "Confirmed" : "Invited",
                  systemImage: vb.emailConfirmed ? "checkmark.circle.fill" : "envelope")
                .font(.caption)
                .foregroundStyle(vb.emailConfirmed ? .green : .secondary)
                .labelStyle(.iconOnly)
        }
        .padding(.vertical, 2)
        .contentShape(Rectangle())
        .onTapGesture {
            if isCascading { tierTarget = vb }
        }
        .swipeActions(edge: .leading) {
            if cek != nil {
                Button { changeKeyVB = vb } label: {
                    Label("Change key", systemImage: "key")
                }
                .tint(.blue)
            }
        }
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) {
                Task { await revoke(vb) }
            } label: {
                Label("Remove", systemImage: "xmark")
            }
        }
    }

    @ViewBuilder
    private func tierBadge(_ tier: String?, unlocked: Bool) -> some View {
        let (label, color) = tierInfo(tier)
        HStack(spacing: 3) {
            if unlocked {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 9))
            }
            Text(label)
                .font(.system(size: 10, weight: .semibold))
        }
        .foregroundStyle(color)
        .padding(.horizontal, 7)
        .padding(.vertical, 3)
        .background(color.opacity(0.15))
        .clipShape(Capsule())
    }

    private func tierInfo(_ tier: String?) -> (String, Color) {
        switch tier {
        case "primary":   return ("Primary",   .orange)
        case "secondary": return ("Secondary", .blue)
        case "tertiary":  return ("Tertiary",  .purple)
        default:          return ("No tier",   Color(.secondaryLabel))
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
        do {
            try await APIService.shared.removeVaultBeneficiary(vaultId: vault.id, beneficiaryId: vb.beneficiaryId)
            await loadAccess()
        } catch {}
    }

    private func saveNotifyLocked(_ value: Bool) async {
        do {
            let updated = try await APIService.shared.updateVault(vault.id, notifyLockedTiers: value)
            currentVault = updated
        } catch {
            // revert toggle on failure
            pendingNotifyLocked = !value
        }
    }

    private func saveAccessMode() async {
        isSavingAccessMode = true
        accessModeError = ""
        defer { isSavingAccessMode = false }
        do {
            let updated = try await APIService.shared.updateVault(
                vault.id,
                accessMode: pendingAccessMode,
                cascadeWindowDays: pendingAccessMode == "cascading" ? pendingCascadeWindow : nil
            )
            currentVault = updated
            pendingAccessMode = updated.accessMode
            pendingCascadeWindow = max(1, updated.cascadeWindowDays)
            pendingNotifyLocked = updated.notifyLockedTiers
        } catch let e as APIError {
            accessModeError = e.errorDescription ?? "Failed to save."
        } catch {
            accessModeError = error.localizedDescription
        }
    }

    private func setTier(_ tier: String?) async {
        guard let vb = tierTarget else { return }
        tierTarget = nil
        do {
            try await APIService.shared.setBeneficiaryTier(
                vaultId: vault.id,
                beneficiaryId: vb.beneficiaryId,
                tier: tier
            )
            await loadAccess()
        } catch {}
    }

    // MARK: - Grouped entries

    private var groupedEntries: [(type: String, label: String, icon: String, entries: [VaultEntry])] {
        let groups: [(type: String, label: String, icon: String)] = [
            ("contact",   "Contacts",           "👤"),
            ("login",     "Logins",             "🔑"),
            ("financial", "Financial Accounts", "🏦"),
            ("card",      "Cards",              "💳"),
            ("identity",  "Identity Documents", "🪪"),
            ("crypto",    "Crypto",             "🪙"),
            ("file",      "Documents",          "📎"),
            ("note",      "Notes",              "📝"),
            ("custom",    "Other",              "⚙️"),
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

// MARK: - Vault Beneficiary Avatar

private struct VaultBeneficiaryAvatar: View {
    let name: String
    let photoData: String?
    var size: CGFloat = 36

    private var contactImage: UIImage? {
        guard let dataStr = photoData else { return nil }
        let raw = dataStr.hasPrefix("data:image/jpeg;base64,")
            ? String(dataStr.dropFirst("data:image/jpeg;base64,".count))
            : dataStr
        guard let data = Data(base64Encoded: raw, options: .ignoreUnknownCharacters) else { return nil }
        return UIImage(data: data)
    }

    var body: some View {
        Group {
            if let img = contactImage {
                Image(uiImage: img).resizable().scaledToFill()
            } else {
                ZStack {
                    Circle().fill(Color.accentColor.opacity(0.15))
                    Text(String(name.prefix(1)).uppercased())
                        .font(.system(size: size * 0.4, weight: .semibold))
                        .foregroundStyle(Color.accentColor)
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
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
                             ? "No beneficiaries yet. Add one from the Contacts tab."
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
                                Text(selectedBeneficiary?.name ?? "None").foregroundStyle(.secondary)
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
                    Section { Text(grantError).foregroundStyle(.red).font(.caption) }
                }
            }
            .scrollContentBackground(.hidden)
            .background { AuthBackground() }
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

// MARK: - Change Vault Key Sheet

private struct ChangeVaultKeySheet: View {
    @Environment(\.dismiss) private var dismiss
    let vb: VaultBeneficiary
    let cek: Data
    var onChanged: () async -> Void

    @State private var newKey = ""
    @State private var isSaving = false
    @State private var error = ""

    var body: some View {
        NavigationStack {
            Form {
                keySection
                if !error.isEmpty {
                    Section { Text(error).foregroundStyle(.red).font(.caption) }
                }
            }
            .scrollContentBackground(.hidden)
            .background { AuthBackground() }
            .navigationTitle("Change Access Key")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(isSaving || newKey.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    @ViewBuilder
    private var keySection: some View {
        Section {
            SecureField("New access key", text: $newKey)
        } header: {
            Text("New access key for \(vb.beneficiaryName)")
        } footer: {
            Text("Share this new key with \(vb.beneficiaryName) directly — it is never stored on the server.")
        }
    }

    private func save() async {
        isSaving = true
        error = ""
        defer { isSaving = false }
        do {
            let envelope = try CryptoService.wrapCEKForBeneficiary(
                cek: cek,
                sharedSecret: newKey.trimmingCharacters(in: .whitespaces)
            )
            try await APIService.shared.assignBeneficiary(
                vaultId: vb.vaultId,
                beneficiaryId: vb.beneficiaryId,
                cekEnvelope: envelope
            )
            await onChanged()
            dismiss()
        } catch let e as APIError {
            error = e.errorDescription ?? "Failed to update access key."
        } catch {
            self.error = error.localizedDescription
        }
    }
}
