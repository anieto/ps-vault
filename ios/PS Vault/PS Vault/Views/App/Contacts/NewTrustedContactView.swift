import SwiftUI

struct NewTrustedContactView: View {
    @Environment(\.dismiss) private var dismiss
    var onSave: () -> Void

    @State private var name = ""
    @State private var email = ""
    @State private var phone = ""
    @State private var notifyOnFinalWarning = false
    @State private var canAbort = false
    @State private var canVerifyLife = false
    @State private var canCorroborateDeath = false
    @State private var isSaving = false
    @State private var error = ""
    @State private var existingBeneficiaries: [Beneficiary] = []

    private var alreadyBeneficiary: Bool {
        let lower = email.trimmingCharacters(in: .whitespaces).lowercased()
        guard lower.count > 4 else { return false }
        return existingBeneficiaries.contains { $0.email.lowercased() == lower }
    }

    private var isSaveDisabled: Bool {
        name.trimmingCharacters(in: .whitespaces).isEmpty ||
        email.trimmingCharacters(in: .whitespaces).isEmpty ||
        isSaving
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Contact") {
                    TextField("Full name", text: $name)
                    TextField("Email address", text: $email)
                        .keyboardType(.emailAddress)
                        .autocapitalization(.none)
                    TextField("Phone (optional)", text: $phone)
                        .keyboardType(.phonePad)
                }

                Section {
                    Toggle(isOn: $notifyOnFinalWarning) {
                        Label("Notify on final warning", systemImage: "bell.fill")
                    }
                    Toggle(isOn: $canAbort) {
                        Label("Can abort false alarm", systemImage: "hand.raised.fill")
                    }
                    Toggle(isOn: $canVerifyLife) {
                        Label("Can verify you're alive", systemImage: "heart.fill")
                    }
                    Toggle(isOn: $canCorroborateDeath) {
                        Label("Can confirm your passing", systemImage: "checkmark.shield.fill")
                    }
                } header: {
                    Text("Permissions")
                } footer: {
                    Text("You can change these at any time from the contact's detail screen.")
                }

                if alreadyBeneficiary {
                    Section {
                        Label("This person is already a beneficiary. You can add them as a trusted contact too — they're separate roles.", systemImage: "info.circle")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                if !error.isEmpty {
                    Section { Text(error).foregroundStyle(.red).font(.caption) }
                }
            }
            .scrollContentBackground(.hidden)
            .background { AuthBackground() }
            .navigationTitle("New Trusted Contact")
            .task { existingBeneficiaries = (try? await APIService.shared.listBeneficiaries()) ?? [] }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving {
                        ProgressView()
                    } else {
                        Button("Add") { Task { await save() } }
                            .disabled(isSaveDisabled)
                    }
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
            _ = try await APIService.shared.createTrustedContact(
                name: name.trimmingCharacters(in: .whitespaces),
                email: email.trimmingCharacters(in: .whitespaces),
                phone: trimmedPhone.isEmpty ? nil : trimmedPhone,
                notifyOnFinalWarning: notifyOnFinalWarning,
                canAbort: canAbort,
                canVerifyLife: canVerifyLife,
                canCorroborateDeath: canCorroborateDeath
            )
            onSave()
            dismiss()
        } catch let e as APIError {
            error = e.errorDescription ?? "Failed to add trusted contact."
        } catch {
            self.error = error.localizedDescription
        }
    }
}
