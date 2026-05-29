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
    @State private var showEdit = false
    @State private var revealedFields: Set<String> = []
    @State private var copiedField: String? = nil

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
                }
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
        .navigationTitle(entry.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        showEdit = true
                    } label: {
                        Label("Edit", systemImage: "pencil")
                    }
                    Button {
                        Task { await toggleFavorite() }
                    } label: {
                        Label(entry.isFavorite ? "Remove from Favorites" : "Add to Favorites",
                              systemImage: entry.isFavorite ? "star.slash" : "star")
                    }
                    Divider()
                    Button(role: .destructive) {
                        showDeleteConfirm = true
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .task { await decrypt() }
        .sheet(isPresented: $showEdit) {
            if let data = entryData {
                EditEntryView(vault: vault, entry: entry, entryData: data) { updated in
                    entryData = updated
                }
            }
        }
        .confirmationDialog("Delete \"\(entry.title)\"?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { Task { await deleteEntry() } }
        }
    }

    private func decrypt() async {
        guard let cek = vaultStore.ceks[vault.id] else {
            decryptError = "Vault is locked. Re-open the app to decrypt."
            return
        }
        do {
            entryData = try CryptoService.decryptEntry(encryptedData: entry.encryptedData, cek: cek)
        } catch {
            decryptError = "Decryption failed: \(error.localizedDescription)"
        }
    }

    private func copyToClipboard(_ value: String, label: String) {
        UIPasteboard.general.string = value
        copiedField = label
        // Clear clipboard after timeout
        let timeout = Double(appState.clipboardTimeoutSeconds)
        Task {
            try? await Task.sleep(for: .seconds(timeout))
            if UIPasteboard.general.string == value {
                UIPasteboard.general.string = ""
            }
            if copiedField == label {
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
    let entryData: EntryData
    var onSave: (EntryData) -> Void

    @State private var title: String
    @State private var fields: [EntryField]
    @State private var notes: String
    @State private var isSaving = false
    @State private var error = ""

    init(vault: Vault, entry: VaultEntry, entryData: EntryData, onSave: @escaping (EntryData) -> Void) {
        self.vault = vault
        self.entry = entry
        self.entryData = entryData
        self.onSave = onSave
        _title = State(initialValue: entryData.title)
        _fields = State(initialValue: entryData.fields)
        _notes = State(initialValue: entryData.notes ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
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
            .navigationTitle("Edit Entry")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(isSaving || title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private func save() async {
        guard let cek = vaultStore.ceks[vault.id] else {
            error = "Vault is locked."
            return
        }
        isSaving = true
        defer { isSaving = false }
        do {
            var updated = entryData
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
            onSave(updated)
            dismiss()
        } catch let e as APIError {
            error = e.errorDescription ?? "Failed to save."
        } catch {
            self.error = error.localizedDescription
        }
    }
}
