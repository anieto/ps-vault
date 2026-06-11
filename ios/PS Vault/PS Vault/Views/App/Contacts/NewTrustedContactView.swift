import SwiftUI
import PhotosUI

private struct CropTarget: Identifiable {
    let id = UUID()
    let image: UIImage
}

struct NewTrustedContactView: View {
    @Environment(\.dismiss) private var dismiss
    var onSave: () -> Void

    @State private var name = ""
    @State private var email = ""
    @State private var phone = ""
    @State private var photoData: String? = nil
    @State private var photoItem: PhotosPickerItem?
    @State private var cropTarget: CropTarget? = nil
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
                Section {
                    HStack {
                        Spacer()
                        PhotosPicker(selection: $photoItem, matching: .images) {
                            ZStack(alignment: .bottomTrailing) {
                                avatarView
                                    .frame(width: 72, height: 72)
                                Circle()
                                    .fill(Color(.systemBackground))
                                    .frame(width: 24, height: 24)
                                    .overlay(
                                        Image(systemName: "camera.fill")
                                            .font(.system(size: 11))
                                            .foregroundStyle(.secondary)
                                    )
                            }
                        }
                        Spacer()
                    }
                    .listRowBackground(Color.clear)
                    .padding(.vertical, 4)
                }

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
            .navigationBarTitleDisplayMode(.inline)
            .task { existingBeneficiaries = (try? await APIService.shared.listBeneficiaries()) ?? [] }
            .onChange(of: photoItem) { _, newItem in Task { await loadPhoto(newItem) } }
            .fullScreenCover(item: $cropTarget) { target in
                ImageCropView(image: target.image) {
                    cropTarget = nil
                } onCrop: { data in
                    photoData = "data:image/jpeg;base64," + data.base64EncodedString()
                    cropTarget = nil
                }
            }
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

    @ViewBuilder
    private var avatarView: some View {
        if let dataStr = photoData,
           let data = Data(base64Encoded: dataStr.dropPrefix("data:image/jpeg;base64,")),
           let uiImage = UIImage(data: data) {
            Image(uiImage: uiImage)
                .resizable().scaledToFill()
                .frame(width: 72, height: 72)
                .clipShape(Circle())
        } else {
            ZStack {
                Circle().fill(Color.accentColor.opacity(0.15))
                if name.isEmpty {
                    Image(systemName: "person.fill")
                        .font(.system(size: 28))
                        .foregroundStyle(Color.accentColor.opacity(0.6))
                } else {
                    Text(String(name.prefix(1)).uppercased())
                        .font(.system(size: 28, weight: .semibold))
                        .foregroundStyle(Color.accentColor)
                }
            }
            .frame(width: 72, height: 72)
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
        let trimmedPhone = phone.trimmingCharacters(in: .whitespaces)
        do {
            _ = try await APIService.shared.createTrustedContact(
                name: name.trimmingCharacters(in: .whitespaces),
                email: email.trimmingCharacters(in: .whitespaces),
                phone: trimmedPhone.isEmpty ? nil : trimmedPhone,
                photoData: photoData,
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

private extension String {
    func dropPrefix(_ prefix: String) -> String {
        hasPrefix(prefix) ? String(dropFirst(prefix.count)) : self
    }
}
