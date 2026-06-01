import SwiftUI

struct TrustedContactDetailView: View {
    @Environment(\.dismiss) private var dismiss
    var contact: TrustedContact
    var onUpdate: () -> Void = {}
    var onDelete: () -> Void = {}

    @State private var notifyOnFinalWarning: Bool
    @State private var canAbort: Bool
    @State private var canVerifyLife: Bool
    @State private var canCorroborateDeath: Bool
    @State private var isSaving = false
    @State private var showEdit = false
    @State private var showDeleteConfirm = false
    @State private var error = ""

    init(contact: TrustedContact, onUpdate: @escaping () -> Void = {}, onDelete: @escaping () -> Void = {}) {
        self.contact = contact
        self.onUpdate = onUpdate
        self.onDelete = onDelete
        _notifyOnFinalWarning = State(initialValue: contact.notifyOnFinalWarning)
        _canAbort = State(initialValue: contact.canAbort)
        _canVerifyLife = State(initialValue: contact.canVerifyLife)
        _canCorroborateDeath = State(initialValue: contact.canCorroborateDeath)
    }

    var body: some View {
        Form {
            contactSection
            permissionsSection
            if !error.isEmpty {
                Section { Text(error).foregroundStyle(.red).font(.caption) }
            }
            actionsSection
        }
        .scrollContentBackground(.hidden)
        .background { AuthBackground() }
        .listSectionSpacing(.compact)
        .navigationTitle(contact.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {}
        .sheet(isPresented: $showEdit) {
            EditTrustedContactView(contact: contact) { onUpdate() }
        }
        .confirmationDialog("Remove \(contact.name)?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
            Button("Remove", role: .destructive) { Task { await delete() } }
        } message: {
            Text("They will no longer oversee your Emergency Switch.")
        }
    }

    @ViewBuilder
    private var contactSection: some View {
        Section("Contact") {
            LabeledContent("Name", value: contact.name)
            LabeledContent("Email", value: contact.email)
            if let phone = contact.phone, !phone.isEmpty {
                LabeledContent("Phone", value: phone)
            }
            Button { showEdit = true } label: {
                Label("Edit details", systemImage: "pencil")
            }
        }
    }

    @ViewBuilder
    private var permissionsSection: some View {
        Section {
            Toggle(isOn: $notifyOnFinalWarning) {
                Label("Notify on final warning", systemImage: "bell.fill")
            }
            .onChange(of: notifyOnFinalWarning) { _, _ in Task { await savePermissions() } }

            Toggle(isOn: $canAbort) {
                Label("Can abort false alarm", systemImage: "hand.raised.fill")
            }
            .onChange(of: canAbort) { _, _ in Task { await savePermissions() } }

            Toggle(isOn: $canVerifyLife) {
                Label("Can verify you're alive", systemImage: "heart.fill")
            }
            .onChange(of: canVerifyLife) { _, _ in Task { await savePermissions() } }

            Toggle(isOn: $canCorroborateDeath) {
                Label("Can confirm your passing", systemImage: "checkmark.shield.fill")
            }
            .onChange(of: canCorroborateDeath) { _, _ in Task { await savePermissions() } }
        } header: {
            Text("Permissions")
        } footer: {
            Text("Changes save automatically.")
        }
    }

    @ViewBuilder
    private var actionsSection: some View {
        Section {
            Button(role: .destructive) {
                showDeleteConfirm = true
            } label: {
                Label("Remove trusted contact", systemImage: "trash")
            }
        }
    }

    private func savePermissions() async {
        guard !isSaving else { return }
        isSaving = true
        error = ""
        defer { isSaving = false }
        do {
            _ = try await APIService.shared.updateTrustedContact(
                contact.id,
                notifyOnFinalWarning: notifyOnFinalWarning,
                canAbort: canAbort,
                canVerifyLife: canVerifyLife,
                canCorroborateDeath: canCorroborateDeath
            )
            onUpdate()
        } catch let e as APIError {
            error = e.errorDescription ?? "Failed to save permissions."
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func delete() async {
        do {
            try await APIService.shared.deleteTrustedContact(contact.id)
            onDelete()
            dismiss()
        } catch let e as APIError {
            error = e.errorDescription ?? "Failed to remove trusted contact."
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Edit Sheet

struct EditTrustedContactView: View {
    @Environment(\.dismiss) private var dismiss
    let contact: TrustedContact
    var onSave: () -> Void

    @State private var name: String
    @State private var phone: String
    @State private var isSaving = false
    @State private var error = ""

    init(contact: TrustedContact, onSave: @escaping () -> Void) {
        self.contact = contact
        self.onSave = onSave
        _name = State(initialValue: contact.name)
        _phone = State(initialValue: contact.phone ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Contact") {
                    TextField("Full name", text: $name)
                    TextField("Phone (optional)", text: $phone)
                        .keyboardType(.phonePad)
                }
                if !error.isEmpty {
                    Section { Text(error).foregroundStyle(.red).font(.caption) }
                }
            }
            .scrollContentBackground(.hidden)
            .background { AuthBackground() }
            .navigationTitle("Edit Contact")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(isSaving || name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private func save() async {
        isSaving = true
        error = ""
        defer { isSaving = false }
        let trimmedPhone = phone.trimmingCharacters(in: .whitespaces)
        do {
            _ = try await APIService.shared.updateTrustedContact(
                contact.id,
                name: name.trimmingCharacters(in: .whitespaces),
                phone: trimmedPhone.isEmpty ? nil : trimmedPhone
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
