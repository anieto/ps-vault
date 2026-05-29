import SwiftUI
import PhotosUI

struct BeneficiaryDetailView: View {
    @Environment(\.dismiss) private var dismiss
    var beneficiary: Beneficiary
    var onUpdate: () -> Void = {}
    var onDelete: () -> Void = {}

    @State private var error = ""
    @State private var showDeleteConfirm = false
    @State private var showEdit = false
    @State private var isResending = false

    var body: some View {
        Form {
            // Avatar / photo header
            Section {
                HStack {
                    Spacer()
                    BeneficiaryAvatar(beneficiary: beneficiary, size: 110)
                    Spacer()
                }
                .listRowBackground(Color.clear)
                .padding(.vertical, 4)
            }

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

            if !error.isEmpty {
                Section { Text(error).foregroundStyle(.red).font(.caption) }
            }

            Section {
                Button {
                    Task { await resend() }
                } label: {
                    if isResending {
                        HStack {
                            ProgressView()
                            Text("Resending...")
                        }
                    } else {
                        Label("Resend invitation", systemImage: "envelope.arrow.triangle.branch")
                    }
                }
                .disabled(isResending)
            }

            Section {
                Button(role: .destructive) {
                    showDeleteConfirm = true
                } label: {
                    Label("Remove beneficiary", systemImage: "trash")
                }
            }
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
        .sheet(isPresented: $showEdit) {
            EditBeneficiaryView(beneficiary: beneficiary) {
                onUpdate()
            }
        }
        .confirmationDialog("Remove \(beneficiary.name)?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
            Button("Remove", role: .destructive) { Task { await delete() } }
        } message: {
            Text("They will no longer receive access to any vault when the switch triggers.")
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

// MARK: - Edit Sheet

struct EditBeneficiaryView: View {
    @Environment(\.dismiss) private var dismiss
    let beneficiary: Beneficiary
    var onSave: () -> Void

    @State private var name: String
    @State private var relationship: String
    @State private var secretQuestion: String
    @State private var photoData: String?
    @State private var photoItem: PhotosPickerItem?
    @State private var imageToCrop: UIImage? = nil
    @State private var showCropView = false
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
            .fullScreenCover(isPresented: $showCropView) {
                if let img = imageToCrop {
                    ImageCropView(image: img) {
                        showCropView = false
                    } onCrop: { data in
                        photoData = "data:image/jpeg;base64," + data.base64EncodedString()
                        showCropView = false
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
        imageToCrop = uiImage
        showCropView = true
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
