import SwiftUI

private struct EntryTypeOption: Identifiable {
    let id: String
    let label: String
    let icon: String
    let defaultFields: [EntryField]
}

private let entryTypes: [EntryTypeOption] = [
    EntryTypeOption(id: "contact", label: "Contact", icon: "👤", defaultFields: [
        EntryField(label: "Relationship / Role", value: "", sensitive: false),
        EntryField(label: "Phone number", value: "", sensitive: false),
        EntryField(label: "Email", value: "", sensitive: false),
        EntryField(label: "Address", value: "", sensitive: false),
    ]),
    EntryTypeOption(id: "login", label: "Login", icon: "🔑", defaultFields: [
        EntryField(label: "Username / Email", value: "", sensitive: false),
        EntryField(label: "Password", value: "", sensitive: true),
        EntryField(label: "Website URL", value: "", sensitive: false),
    ]),
    EntryTypeOption(id: "financial", label: "Financial Account", icon: "🏦", defaultFields: [
        EntryField(label: "Institution", value: "", sensitive: false),
        EntryField(label: "Account number", value: "", sensitive: true),
        EntryField(label: "Account type", value: "", sensitive: false),
        EntryField(label: "Routing number", value: "", sensitive: true),
        EntryField(label: "Online username / email", value: "", sensitive: false),
        EntryField(label: "Online password", value: "", sensitive: true),
    ]),
    EntryTypeOption(id: "card", label: "Card", icon: "💳", defaultFields: [
        EntryField(label: "Cardholder name", value: "", sensitive: false),
        EntryField(label: "Card number", value: "", sensitive: true),
        EntryField(label: "Expiration date", value: "", sensitive: false),
        EntryField(label: "CVV", value: "", sensitive: true),
        EntryField(label: "PIN", value: "", sensitive: true),
        EntryField(label: "Issuing bank", value: "", sensitive: false),
    ]),
    EntryTypeOption(id: "identity", label: "ID / Passport", icon: "🪪", defaultFields: [
        EntryField(label: "Document type", value: "", sensitive: false),
        EntryField(label: "Document number", value: "", sensitive: true),
        EntryField(label: "Issuing country / state", value: "", sensitive: false),
        EntryField(label: "Issue date", value: "", sensitive: false),
        EntryField(label: "Expiry date", value: "", sensitive: false),
    ]),
    EntryTypeOption(id: "crypto", label: "Crypto", icon: "🪙", defaultFields: [
        EntryField(label: "Wallet / Exchange", value: "", sensitive: false),
        EntryField(label: "Seed phrase", value: "", sensitive: true),
    ]),
    EntryTypeOption(id: "file", label: "Document", icon: "📎", defaultFields: [
        EntryField(label: "Description", value: "", sensitive: false),
    ]),
    EntryTypeOption(id: "note", label: "Note", icon: "📝", defaultFields: [
        EntryField(label: "Content", value: "", sensitive: false),
    ]),
    EntryTypeOption(id: "custom", label: "Custom", icon: "⚙️", defaultFields: [
        EntryField(label: "Category", value: "", sensitive: false),
        EntryField(label: "Details", value: "", sensitive: false),
    ]),
]

private enum FocusedField: Hashable {
    case title
    case value(Int)
    case notes
}

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
    @State private var showingAddField = false
    @State private var newFieldLabel = ""
    @FocusState private var focused: FocusedField?

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
                HStack {
                    Text(type.icon)
                    Text(type.label)
                        .foregroundStyle(.primary)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background { AuthBackground() }
        .navigationTitle("Entry Type")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var entryForm: some View {
        Form {
            Section("Title") {
                TextField("Entry title", text: $title)
                    .autocorrectionDisabled()
                    .focused($focused, equals: .title)
                    .submitLabel(.next)
                    .onSubmit { focused = fields.isEmpty ? .notes : .value(0) }
            }

            Section("Fields") {
                ForEach(fields.indices, id: \.self) { index in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(fields[index].label)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        HStack {
                            if fields[index].sensitive {
                                SecureField("Value", text: $fields[index].value)
                                    .focused($focused, equals: .value(index))
                                    .submitLabel(.next)
                                    .onSubmit { advanceFocus(from: index) }
                            } else {
                                TextField("Value", text: $fields[index].value)
                                    .focused($focused, equals: .value(index))
                                    .submitLabel(.next)
                                    .onSubmit { advanceFocus(from: index) }
                            }
                            Button {
                                fields[index].sensitive.toggle()
                            } label: {
                                Image(systemName: fields[index].sensitive ? "eye.slash" : "eye")
                                    .foregroundStyle(.secondary)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.vertical, 2)
                }
                .onDelete { fields.remove(atOffsets: $0) }
                .onMove { fields.move(fromOffsets: $0, toOffset: $1) }

                Button {
                    newFieldLabel = ""
                    showingAddField = true
                } label: {
                    Label("Add Field", systemImage: "plus.circle")
                }
            }

            Section("Notes") {
                TextField("Optional notes", text: $notes, axis: .vertical)
                    .lineLimit(3...)
                    .focused($focused, equals: .notes)
            }

            if !error.isEmpty {
                Section { Text(error).foregroundStyle(.red).font(.caption) }
            }
        }
        .scrollContentBackground(.hidden)
        .background { AuthBackground() }
        .navigationTitle(selectedType?.label ?? "New Entry")
        .navigationBarTitleDisplayMode(.inline)
        .alert("New Field", isPresented: $showingAddField) {
            TextField("Field name", text: $newFieldLabel)
            Button("Add") {
                let label = newFieldLabel.trimmingCharacters(in: .whitespaces)
                fields.append(EntryField(label: label, value: "", sensitive: false))
            }
            Button("Cancel", role: .cancel) { }
        }
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(action: {
                    if selectedType != nil { selectedType = nil } else { dismiss() }
                }) {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                            .fontWeight(.semibold)
                        Text("Back")
                    }
                }
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

    private func advanceFocus(from index: Int) {
        if index < fields.count - 1 {
            focused = .value(index + 1)
        } else {
            focused = .notes
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
