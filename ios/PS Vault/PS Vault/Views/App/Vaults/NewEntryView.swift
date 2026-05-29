import SwiftUI

private struct EntryTypeOption: Identifiable {
    let id: String
    let label: String
    let icon: String
    let defaultFields: [EntryField]
}

private let entryTypes: [EntryTypeOption] = [
    EntryTypeOption(id: "login", label: "Login", icon: "key.fill", defaultFields: [
        EntryField(label: "Username", value: "", sensitive: false),
        EntryField(label: "Password", value: "", sensitive: true),
        EntryField(label: "URL", value: "", sensitive: false),
    ]),
    EntryTypeOption(id: "financial", label: "Financial Account", icon: "building.columns.fill", defaultFields: [
        EntryField(label: "Institution", value: "", sensitive: false),
        EntryField(label: "Account Number", value: "", sensitive: true),
        EntryField(label: "Routing Number", value: "", sensitive: true),
    ]),
    EntryTypeOption(id: "card", label: "Card", icon: "creditcard.fill", defaultFields: [
        EntryField(label: "Card Number", value: "", sensitive: true),
        EntryField(label: "Expiry", value: "", sensitive: false),
        EntryField(label: "CVV", value: "", sensitive: true),
        EntryField(label: "Cardholder", value: "", sensitive: false),
    ]),
    EntryTypeOption(id: "identity", label: "Identity Document", icon: "creditcard.and.123", defaultFields: [
        EntryField(label: "Full Name", value: "", sensitive: false),
        EntryField(label: "Document Number", value: "", sensitive: true),
        EntryField(label: "Expiry", value: "", sensitive: false),
        EntryField(label: "Issuing Country", value: "", sensitive: false),
    ]),
    EntryTypeOption(id: "contact", label: "Contact", icon: "person.fill", defaultFields: [
        EntryField(label: "Name", value: "", sensitive: false),
        EntryField(label: "Phone", value: "", sensitive: false),
        EntryField(label: "Email", value: "", sensitive: false),
        EntryField(label: "Address", value: "", sensitive: false),
    ]),
    EntryTypeOption(id: "crypto", label: "Crypto Wallet", icon: "bitcoinsign.circle.fill", defaultFields: [
        EntryField(label: "Wallet Address", value: "", sensitive: false),
        EntryField(label: "Seed Phrase", value: "", sensitive: true),
        EntryField(label: "Exchange", value: "", sensitive: false),
    ]),
    EntryTypeOption(id: "note", label: "Secure Note", icon: "note.text", defaultFields: []),
    EntryTypeOption(id: "custom", label: "Custom", icon: "square.grid.2x2.fill", defaultFields: []),
]

struct NewEntryView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(VaultStore.self) private var vaultStore
    let vault: Vault

    @State private var selectedType: EntryTypeOption? = nil
    @State private var title = ""
    @State private var fields: [EntryField] = []
    @State private var notes = ""
    @State private var isSaving = false
    @State private var error = ""

    var body: some View {
        if selectedType == nil {
            typePicker
        } else {
            entryForm
        }
    }

    private var typePicker: some View {
        List(entryTypes) { type in
            Button {
                selectedType = type
                fields = type.defaultFields
            } label: {
                Label(type.label, systemImage: type.icon)
                    .foregroundStyle(.primary)
            }
        }
        .navigationTitle("Entry Type")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
        }
    }

    private var entryForm: some View {
        Form {
            Section("Title") {
                TextField("Entry title", text: $title)
                    .autocorrectionDisabled()
            }

            Section("Fields") {
                ForEach($fields) { $field in
                    VStack(alignment: .leading, spacing: 4) {
                        TextField("Label", text: $field.label)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        HStack {
                            if field.sensitive {
                                SecureField("Value", text: $field.value)
                            } else {
                                TextField("Value", text: $field.value, axis: .vertical)
                            }
                            Toggle("", isOn: $field.sensitive)
                                .labelsHidden()
                                .tint(.orange)
                        }
                    }
                    .padding(.vertical, 2)
                }
                .onDelete { fields.remove(atOffsets: $0) }
                .onMove { fields.move(fromOffsets: $0, toOffset: $1) }

                Button {
                    fields.append(EntryField(label: "", value: "", sensitive: false))
                } label: {
                    Label("Add Field", systemImage: "plus.circle")
                }
            }

            Section("Notes") {
                TextField("Optional notes", text: $notes, axis: .vertical)
                    .lineLimit(3...)
            }

            if !error.isEmpty {
                Section { Text(error).foregroundStyle(.red).font(.caption) }
            }
        }
        .navigationTitle(selectedType?.label ?? "New Entry")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Back") { selectedType = nil }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") { Task { await save() } }
                    .disabled(title.isEmpty || isSaving)
            }
            ToolbarItem(placement: .bottomBar) {
                EditButton()
            }
        }
    }

    private func save() async {
        guard let cek = vaultStore.ceks[vault.id] else {
            error = "Vault is locked. Cannot encrypt entry."
            return
        }
        guard let type = selectedType else { return }
        isSaving = true
        defer { isSaving = false }
        error = ""
        do {
            let data = EntryData(
                title: title,
                fields: fields,
                notes: notes.isEmpty ? nil : notes,
                isFavorite: false
            )
            let encrypted = try CryptoService.encryptEntry(data, cek: cek)
            let entry = try await APIService.shared.createEntry(
                vaultId: vault.id,
                entryType: type.id,
                title: title,
                encryptedData: encrypted
            )
            vaultStore.addEntry(entry, to: vault.id)
            dismiss()
        } catch let e as APIError {
            error = e.errorDescription ?? "Failed to create entry."
        } catch {
            self.error = error.localizedDescription
        }
    }
}
