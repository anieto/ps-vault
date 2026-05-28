import SwiftUI
import PhotosUI

struct NewBeneficiaryView: View {
    @Environment(\.dismiss) private var dismiss
    var onSave: () -> Void = {}
    @State private var name = ""
    @State private var email = ""
    @State private var relationship = ""
    @State private var secretQuestion = ""
    @State private var photoData: String? = nil
    @State private var photoItem: PhotosPickerItem?
    @State private var error = ""
    @State private var isLoading = false

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

                Section {
                    TextField("Full name", text: $name)
                    TextField("Email", text: $email)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
                Section {
                    TextField("Relationship (optional)", text: $relationship)
                    TextField("Access key hint (optional)", text: $secretQuestion)
                } header: {
                    Text("Optional")
                } footer: {
                    Text("The access key hint helps your beneficiary remember how to unlock the vault.")
                }
                if !error.isEmpty {
                    Section {
                        Text(error).foregroundStyle(.red).font(.caption)
                    }
                }
            }
            .navigationTitle("New Beneficiary")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(name.isEmpty || email.isEmpty || isLoading)
                }
            }
            .onChange(of: photoItem) { _, newItem in
                Task { await loadPhoto(newItem) }
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
              let uiImage = UIImage(data: data),
              let compressed = compressToJPEG(uiImage, size: 256) else { return }
        photoData = "data:image/jpeg;base64," + compressed.base64EncodedString()
    }

    private func compressToJPEG(_ image: UIImage, size: CGFloat) -> Data? {
        let scale = max(size / image.size.width, size / image.size.height)
        let newSize = CGSize(width: size, height: size)
        let origin = CGPoint(
            x: (size - image.size.width * scale) / 2,
            y: (size - image.size.height * scale) / 2
        )
        let renderer = UIGraphicsImageRenderer(size: newSize)
        let cropped = renderer.image { _ in
            image.draw(in: CGRect(origin: origin, size: CGSize(width: image.size.width * scale, height: image.size.height * scale)))
        }
        return cropped.jpegData(compressionQuality: 0.8)
    }

    private func save() async {
        error = ""
        isLoading = true
        defer { isLoading = false }
        do {
            _ = try await APIService.shared.createBeneficiary(
                name: name,
                email: email,
                relationship: relationship.isEmpty ? nil : relationship,
                secretQuestion: secretQuestion.isEmpty ? nil : secretQuestion,
                photoData: photoData
            )
            onSave()
            dismiss()
        } catch let e as APIError {
            error = e.errorDescription ?? "Failed to create beneficiary."
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
