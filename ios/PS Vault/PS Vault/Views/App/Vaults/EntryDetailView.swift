import SwiftUI

struct EntryDetailView: View {
    @Environment(VaultStore.self) private var vaultStore
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    let vault: Vault
    let entry: VaultEntry

    @State private var entryData: EntryData? = nil
    @State private var decryptError = ""
    @State private var isDeleting = false
    @State private var showDeleteConfirm = false
    @State private var revealedFields: Set<String> = []
    @State private var copiedField: String? = nil
    @State private var clipboardCopyID = UUID()

    private var currentEntryUpdatedAt: String? {
        vaultStore.entries[vault.id]?.first(where: { $0.id == entry.id })?.updatedAt
    }

    var body: some View {
        Group {
            if let data = entryData {
                List {
                    if !data.fields.isEmpty {
                        Section("Fields") {
                            ForEach(data.fields) { field in
                                FieldRow(
                                    field: field,
                                    isRevealed: revealedFields.contains(field.label),
                                    isCopied: copiedField == field.label,
                                    onToggleReveal: {
                                        if revealedFields.contains(field.label) {
                                            revealedFields.remove(field.label)
                                        } else {
                                            revealedFields.insert(field.label)
                                        }
                                    },
                                    onCopy: { copyToClipboard(field.value, label: field.label) }
                                )
                            }
                        }
                    }
                    if let notes = data.notes, !notes.isEmpty {
                        Section("Notes") {
                            Text(notes)
                                .font(.body)
                                .textSelection(.enabled)
                        }
                    }
                    Section {
                        NavigationLink(value: EditEntryNavigation(vault: vault, entry: entry)) {
                            Label("Edit Entry", systemImage: "pencil")
                        }
                        Button {
                            Task { await toggleFavorite() }
                        } label: {
                            Label(entry.isFavorite ? "Remove from Favorites" : "Add to Favorites",
                                  systemImage: entry.isFavorite ? "star.slash" : "star")
                        }
                        Button(role: .destructive) {
                            showDeleteConfirm = true
                        } label: {
                            Label("Delete Entry", systemImage: "trash")
                        }
                    }
                }
                .scrollContentBackground(.hidden)
            } else if !decryptError.isEmpty {
                ContentUnavailableView {
                    Label("Cannot Decrypt", systemImage: "lock.trianglebadge.exclamationmark")
                } description: {
                    Text(decryptError)
                }
            } else {
                ProgressView("Decrypting…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background { AuthBackground() }
        .navigationTitle(entry.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {}
        .task(id: currentEntryUpdatedAt) { await decrypt() }
        .onDisappear { entryData = nil }
        .alert("Delete \"\(entry.title)\"?", isPresented: $showDeleteConfirm) {
            Button("Delete", role: .destructive) { Task { await deleteEntry() } }
            Button("Cancel", role: .cancel) {}
        }
    }

    private func decrypt() async {
        guard let cek = vaultStore.ceks[vault.id] else {
            decryptError = "Vault is locked. Re-open the app to decrypt."
            return
        }
        let currentEntry = vaultStore.entries[vault.id]?.first(where: { $0.id == entry.id }) ?? entry
        do {
            entryData = try CryptoService.decryptEntry(encryptedData: currentEntry.encryptedData, cek: cek)
            decryptError = ""
        } catch {
            decryptError = "Decryption failed: \(error.localizedDescription)"
        }
    }

    private func copyToClipboard(_ value: String, label: String) {
        let id = UUID()
        clipboardCopyID = id
        UIPasteboard.general.string = value
        copiedField = label
        let timeout = Double(appState.clipboardTimeoutSeconds)
        Task {
            try? await Task.sleep(for: .seconds(timeout))
            // Only clear if no subsequent copy has been made since this one.
            if clipboardCopyID == id {
                UIPasteboard.general.string = ""
                copiedField = nil
            }
        }
    }

    private func toggleFavorite() async {
        do {
            let updated = try await APIService.shared.updateEntry(
                vault.id, entryId: entry.id,
                isFavorite: !entry.isFavorite
            )
            vaultStore.updateEntry(updated, in: vault.id)
        } catch {}
    }

    private func deleteEntry() async {
        isDeleting = true
        do {
            try await APIService.shared.deleteEntry(vault.id, entryId: entry.id)
            vaultStore.removeEntry(id: entry.id, from: vault.id)
            dismiss()
        } catch {}
        isDeleting = false
    }
}

// MARK: - Field Row

private struct FieldRow: View {
    let field: EntryField
    let isRevealed: Bool
    let isCopied: Bool
    let onToggleReveal: () -> Void
    let onCopy: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(field.label)
                .font(.caption)
                .foregroundStyle(.secondary)
            HStack {
                if field.sensitive && !isRevealed {
                    Text(String(repeating: "•", count: 10))
                        .font(.system(.body, design: .monospaced))
                        .foregroundStyle(.primary)
                } else {
                    Text(field.value)
                        .font(.body)
                        .textSelection(.enabled)
                }
                Spacer()
                HStack(spacing: 12) {
                    if field.sensitive {
                        Button(action: onToggleReveal) {
                            Image(systemName: isRevealed ? "eye.slash" : "eye")
                                .foregroundStyle(.secondary)
                        }
                        .buttonStyle(.plain)
                    }
                    Button(action: onCopy) {
                        Image(systemName: isCopied ? "checkmark" : "doc.on.doc")
                            .foregroundStyle(isCopied ? .green : .secondary)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.vertical, 2)
    }
}

// MARK: - Edit Entry View

struct EditEntryView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(VaultStore.self) private var vaultStore
    let vault: Vault
    let entry: VaultEntry

    @State private var entryData: EntryData? = nil
    @State private var title = ""
    @State private var fields: [EntryField] = []
    @State private var notes = ""
    @State private var isSaving = false
    @State private var error = ""

    var body: some View {
        Form {
            if entryData == nil && error.isEmpty {
                ProgressView("Decrypting…")
            } else {
                Section("Title") {
                    TextField("Entry title", text: $title)
                        .autocorrectionDisabled()
                }
                Section("Fields") {
                    ForEach(fields.indices, id: \.self) { i in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(fields[i].label).font(.caption).foregroundStyle(.secondary)
                            TextField(fields[i].label, text: $fields[i].value, axis: .vertical)
                        }
                    }
                }
                Section("Notes") {
                    TextField("Notes", text: $notes, axis: .vertical)
                        .lineLimit(4...)
                }
                if !error.isEmpty {
                    Section { Text(error).foregroundStyle(.red).font(.caption) }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background { AuthBackground() }
        .navigationTitle("Edit Entry")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") { Task { await save() } }
                    .disabled(isSaving || entryData == nil || title.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .task { await loadEntry() }
    }

    private func loadEntry() async {
        guard let cek = vaultStore.ceks[vault.id] else {
            error = "Vault is locked."
            return
        }
        let currentEntry = vaultStore.entries[vault.id]?.first(where: { $0.id == entry.id }) ?? entry
        do {
            let data = try CryptoService.decryptEntry(encryptedData: currentEntry.encryptedData, cek: cek)
            entryData = data
            title = data.title
            fields = data.fields
            notes = data.notes ?? ""
        } catch {
            self.error = "Decryption failed: \(error.localizedDescription)"
        }
    }

    private func save() async {
        guard let cek = vaultStore.ceks[vault.id], var updated = entryData else {
            error = "Vault is locked."
            return
        }
        isSaving = true
        defer { isSaving = false }
        do {
            updated.title = title.trimmingCharacters(in: .whitespaces)
            updated.fields = fields
            updated.notes = notes.isEmpty ? nil : notes
            let encrypted = try CryptoService.encryptEntry(updated, cek: cek)
            let savedEntry = try await APIService.shared.updateEntry(
                vault.id, entryId: entry.id,
                title: updated.title,
                encryptedData: encrypted
            )
            vaultStore.updateEntry(savedEntry, in: vault.id)
            dismiss()
        } catch let e as APIError {
            error = e.errorDescription ?? "Failed to save."
        } catch {
            self.error = error.localizedDescription
        }
    }
}
