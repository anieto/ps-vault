import SwiftUI
import PhotosUI

struct BeneficiaryDetailView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(VaultStore.self) private var vaultStore
    var beneficiary: Beneficiary
    var onUpdate: () -> Void = {}
    var onDelete: () -> Void = {}

    @State private var error = ""
    @State private var showDeleteConfirm = false
    @State private var showEdit = false
    @State private var isResending = false
    @State private var assignedVaults: [Vault] = []
    @State private var showAddToVault = false
    @State private var vaultAccessError = ""

    private var assignedVaultIDs: Set<String> {
        Set(assignedVaults.map(\.id))
    }

    private var hasAvailableVaultsToAssign: Bool {
        let assignedIDs = assignedVaultIDs
        return vaultStore.vaults.contains { vaultStore.ceks[$0.id] != nil && !assignedIDs.contains($0.id) }
    }

    var body: some View {
        Form {
            avatarSection
            contactSection
            vaultAccessSection
            if !vaultAccessError.isEmpty {
                Section { Text(vaultAccessError).foregroundStyle(.red).font(.caption) }
            }
            if !error.isEmpty {
                Section { Text(error).foregroundStyle(.red).font(.caption) }
            }
            resendSection
            deleteSection
        }
        .scrollContentBackground(.hidden)
        .background { AuthBackground() }
        .listSectionSpacing(.compact)
        .navigationTitle(beneficiary.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Edit") { showEdit = true }
            }
        }
        .task { await loadVaultAccess() }
        .sheet(isPresented: $showEdit) {
            EditBeneficiaryView(beneficiary: beneficiary) { onUpdate() }
        }
        .sheet(isPresented: $showAddToVault) {
            AddToVaultSheet(beneficiary: beneficiary, excludedIDs: assignedVaultIDs) {
                await loadVaultAccess()
            }
        }
        .confirmationDialog("Remove \(beneficiary.name)?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
            Button("Remove", role: .destructive) { Task { await delete() } }
        } message: {
            Text("They will no longer receive access to any vault when the switch triggers.")
        }
    }

    @ViewBuilder
    private var avatarSection: some View {
        Section {
            HStack {
                Spacer()
                BeneficiaryAvatar(beneficiary: beneficiary, size: 110)
                Spacer()
            }
            .listRowBackground(Color.clear)
            .padding(.vertical, 4)
        }
    }

    @ViewBuilder
    private var contactSection: some View {
        Section("Contact") {
            LabeledContent("Name", value: beneficiary.name)
            LabeledContent("Email", value: beneficiary.email)
            if let rel = beneficiary.relationship, !rel.isEmpty {
                LabeledContent("Relationship", value: rel)
            }
            if let hint = beneficiary.secretQuestion, !hint.isEmpty {
                LabeledContent("Access key hint", value: hint)
            }
        }
    }

    @ViewBuilder
    private var vaultAccessSection: some View {
        Section("Vault Access") {
            ForEach(assignedVaults) { vault in
                HStack(spacing: 10) {
                    Text(vault.icon).font(.title3)
                    Text(vault.name).font(.body).foregroundStyle(.primary)
                    Spacer()
                }
                .swipeActions(edge: .trailing) {
                    Button(role: .destructive) {
                        Task { await removeFromVault(vault) }
                    } label: {
                        Label("Remove", systemImage: "xmark")
                    }
                }
            }
            Button {
                showAddToVault = true
            } label: {
                Label("Add to vault...", systemImage: "plus")
            }
            .disabled(!hasAvailableVaultsToAssign)
        }
    }

    @ViewBuilder
    private var resendSection: some View {
        Section {
            Button {
                Task { await resend() }
            } label: {
                if isResending {
                    HStack { ProgressView(); Text("Resending...") }
                } else {
                    Label("Resend invitation", systemImage: "envelope.arrow.triangle.branch")
                }
            }
            .disabled(isResending)
        }
    }

    @ViewBuilder
    private var deleteSection: some View {
        Section {
            Button(role: .destructive) {
                showDeleteConfirm = true
            } label: {
                Label("Remove beneficiary", systemImage: "trash")
            }
        }
    }

    private func loadVaultAccess() async {
        do {
            assignedVaults = try await APIService.shared.getBeneficiaryVaults(beneficiary.id)
            vaultAccessError = ""
        } catch {
            vaultAccessError = "Could not load vault access."
        }
    }

    private func removeFromVault(_ vault: Vault) async {
        do {
            try await APIService.shared.removeVaultBeneficiary(vaultId: vault.id, beneficiaryId: beneficiary.id)
            await loadVaultAccess()
        } catch let e as APIError {
            vaultAccessError = e.errorDescription ?? "Failed to remove vault access."
        } catch {
            vaultAccessError = error.localizedDescription
        }
    }

    private func resend() async {
        isResending = true
        defer { isResending = false }
        do {
            try await APIService.shared.resendBeneficiaryConfirmation(beneficiary.id)
        } catch let e as APIError {
            error = e.errorDescription ?? "Failed to resend invitation."
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func delete() async {
        do {
            try await APIService.shared.deleteBeneficiary(beneficiary.id)
            onDelete()
            dismiss()
        } catch let e as APIError {
            error = e.errorDescription ?? "Failed to remove beneficiary."
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Add to Vault Sheet

private struct AddToVaultSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(VaultStore.self) private var vaultStore
    let beneficiary: Beneficiary
    let excludedIDs: Set<String>
    var onAssigned: () async -> Void

    @State private var selectedVault: Vault? = nil
    @State private var accessKey = ""
    @State private var isGranting = false
    @State private var error = ""

    private var availableVaults: [Vault] {
        vaultStore.vaults.filter { vaultStore.ceks[$0.id] != nil && !excludedIDs.contains($0.id) }
    }

    private var isGrantDisabled: Bool {
        let trimmed = accessKey.trimmingCharacters(in: .whitespaces)
        return selectedVault == nil || trimmed.isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                vaultPickerSection
                if selectedVault != nil { accessKeySection }
                if !error.isEmpty {
                    Section { Text(error).foregroundStyle(.red).font(.caption) }
                }
            }
            .scrollContentBackground(.hidden)
            .background { AuthBackground() }
            .navigationTitle("Add to Vault")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    grantButton
                }
            }
        }
    }

    @ViewBuilder
    private var vaultPickerSection: some View {
        Section("Select vault") {
            if availableVaults.isEmpty {
                Text("No unlocked vaults available. Open a vault to unlock it first.")
                    .font(.caption).foregroundStyle(.secondary)
            } else {
                ForEach(availableVaults) { vault in
                    vaultRow(vault)
                }
            }
        }
    }

    @ViewBuilder
    private func vaultRow(_ vault: Vault) -> some View {
        Button {
            selectedVault = vault
        } label: {
            HStack(spacing: 10) {
                Text(vault.icon).font(.title3)
                Text(vault.name).foregroundStyle(.primary)
                Spacer()
                if selectedVault?.id == vault.id {
                    Image(systemName: "checkmark").foregroundStyle(.accentColor)
                }
            }
        }
    }

    @ViewBuilder
    private var accessKeySection: some View {
        Section {
            SecureField("Access key", text: $accessKey)
        } header: {
            Text("Access key")
        } footer: {
            Text("The passphrase \(beneficiary.name) will use to unlock this vault.")
        }
    }

    @ViewBuilder
    private var grantButton: some View {
        if isGranting {
            ProgressView()
        } else {
            Button("Grant") { Task { await grant() } }
                .disabled(isGrantDisabled)
        }
    }

    private func grant() async {
        guard let vault = selectedVault, let cek = vaultStore.ceks[vault.id] else { return }
        isGranting = true
        error = ""
        defer { isGranting = false }
        do {
            let envelope = try CryptoService.wrapCEKForBeneficiary(cek: cek, sharedSecret: accessKey.trimmingCharacters(in: .whitespaces))
            try await APIService.shared.assignBeneficiary(vaultId: vault.id, beneficiaryId: beneficiary.id, cekEnvelope: envelope)
            await onAssigned()
            dismiss()
        } catch let e as APIError {
            error = e.errorDescription ?? "Failed to grant access."
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Edit Sheet

private struct CropTarget: Identifiable {
    let id = UUID()
    let image: UIImage
}

struct EditBeneficiaryView: View {
    @Environment(\.dismiss) private var dismiss
    let beneficiary: Beneficiary
    var onSave: () -> Void

    @State private var name: String
    @State private var relationship: String
    @State private var secretQuestion: String
    @State private var photoData: String?
    @State private var photoItem: PhotosPickerItem?
    @State private var cropTarget: CropTarget? = nil
    @State private var isSaving = false
    @State private var error = ""

    init(beneficiary: Beneficiary, onSave: @escaping () -> Void) {
        self.beneficiary = beneficiary
        self.onSave = onSave
        _name = State(initialValue: beneficiary.name)
        _relationship = State(initialValue: beneficiary.relationship ?? "")
        _secretQuestion = State(initialValue: beneficiary.secretQuestion ?? "")
        _photoData = State(initialValue: beneficiary.photoData)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        Spacer()
                        PhotosPicker(selection: $photoItem, matching: .images) {
                            ZStack(alignment: .bottomTrailing) {
                                avatarView
                                    .frame(width: 80, height: 80)
                                Circle()
                                    .fill(Color(.systemBackground))
                                    .frame(width: 26, height: 26)
                                    .overlay(
                                        Image(systemName: "camera.fill")
                                            .font(.system(size: 12))
                                            .foregroundStyle(.secondary)
                                    )
                            }
                        }
                        Spacer()
                    }
                    .listRowBackground(Color.clear)
                    .padding(.vertical, 8)
                }

                Section("Contact") {
                    TextField("Full name", text: $name)
                    TextField("Relationship", text: $relationship)
                        .foregroundStyle(.primary)
                }

                Section {
                    TextField("e.g. The name of our family dog", text: $secretQuestion)
                } header: {
                    Text("Access key hint")
                } footer: {
                    Text("Shown on the portal to remind them what access key to enter.")
                }

                if !error.isEmpty {
                    Section { Text(error).foregroundStyle(.red).font(.caption) }
                }
            }
            .scrollContentBackground(.hidden)
            .background { AuthBackground() }
            .navigationTitle("Edit Beneficiary")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(isSaving || name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onChange(of: photoItem) { _, newItem in
                Task { await loadPhoto(newItem) }
            }
            .fullScreenCover(item: $cropTarget) { target in
                ImageCropView(image: target.image) {
                    cropTarget = nil
                } onCrop: { data in
                    photoData = "data:image/jpeg;base64," + data.base64EncodedString()
                    cropTarget = nil
                }
            }
        }
    }

    @ViewBuilder
    private var avatarView: some View {
        if let dataStr = photoData,
           let data = Data(base64Encoded: dataStr.dropPrefix("data:image/jpeg;base64,")),
           let uiImage = UIImage(data: data) {
            Image(uiImage: uiImage)
                .resizable()
                .scaledToFill()
                .frame(width: 80, height: 80)
                .clipShape(Circle())
        } else {
            ZStack {
                Circle().fill(Color.accentColor.opacity(0.15))
                Text(String(name.prefix(1)).uppercased())
                    .font(.system(size: 32, weight: .semibold))
                    .foregroundStyle(Color.accentColor)
            }
            .frame(width: 80, height: 80)
        }
    }

    private func loadPhoto(_ item: PhotosPickerItem?) async {
        guard let item else { return }
        guard let data = try? await item.loadTransferable(type: Data.self),
              let uiImage = UIImage(data: data) else { return }
        cropTarget = CropTarget(image: uiImage)
    }

    private func save() async {
        isSaving = true
        error = ""
        defer { isSaving = false }
        do {
            _ = try await APIService.shared.updateBeneficiary(
                beneficiary.id,
                name: name.trimmingCharacters(in: .whitespaces),
                relationship: relationship.trimmingCharacters(in: .whitespaces).isEmpty ? nil : relationship.trimmingCharacters(in: .whitespaces),
                secretQuestion: secretQuestion.trimmingCharacters(in: .whitespaces).isEmpty ? nil : secretQuestion.trimmingCharacters(in: .whitespaces),
                photoData: photoData
            )
            onSave()
            dismiss()
        } catch let e as APIError {
            error = e.errorDescription ?? "Failed to save."
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private extension String {
    func dropPrefix(_ prefix: String) -> String {
        hasPrefix(prefix) ? String(dropFirst(prefix.count)) : self
    }
}
