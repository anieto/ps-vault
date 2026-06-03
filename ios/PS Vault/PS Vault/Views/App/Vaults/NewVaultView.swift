import SwiftUI

struct NewVaultView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var appState
    @Environment(VaultStore.self) private var vaultStore

    @State private var name = ""
    @State private var icon = ""
    @State private var isSaving = false
    @State private var error = ""

    private let emojiOptions = ["🔐", "🏦", "💼", "🏠", "❤️", "🌐", "💻", "📱", "🔑", "📋", "🗂️", "💰", "🛡️", "⭐"]

    var body: some View {
        NavigationStack {
            Form {
                Section("Vault Name") {
                    TextField("My Vault", text: $name)
                        .autocorrectionDisabled()
                }

                Section("Icon") {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 7), spacing: 12) {
                        ForEach(emojiOptions, id: \.self) { emoji in
                            Button {
                                icon = emoji
                            } label: {
                                Text(emoji)
                                    .font(.system(size: 28))
                                    .frame(width: 40, height: 40)
                                    .background(icon == emoji ? Color.accentColor.opacity(0.2) : Color.clear)
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.vertical, 4)

                    HStack {
                        Text("Custom emoji")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Spacer()
                        TextField("🔒", text: $icon)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 50)
                    }
                }

                if !error.isEmpty {
                    Section { Text(error).foregroundStyle(.red).font(.caption) }
                }
            }
            .scrollContentBackground(.hidden)
            .background { AuthBackground() }
            .navigationTitle("New Vault")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") { Task { await create() } }
                        .disabled(name.isEmpty || isSaving)
                }
            }
        }
        .onAppear {
            if icon.isEmpty { icon = emojiOptions.first ?? "🔐" }
        }
    }

    private func create() async {
        guard let mek = appState.mek else {
            error = "Vault is locked. Cannot create vault."
            return
        }
        error = ""
        isSaving = true
        defer { isSaving = false }
        do {
            // Generate a new CEK and wrap it with the MEK
            let cek = CryptoService.generateKey()
            let cekEnvelope = try CryptoService.wrapKey(cek, with: mek)
            let vault = try await APIService.shared.createVault(
                name: name,
                icon: icon.isEmpty ? "🔐" : icon,
                cekEnvelope: cekEnvelope
            )
            // Store the CEK and add the vault to the store
            vaultStore.storeCEK(cek, for: vault.id)
            vaultStore.vaults.append(vault)
            dismiss()
        } catch let e as APIError {
            error = e.errorDescription ?? "Failed to create vault."
        } catch {
            self.error = error.localizedDescription
        }
    }
}
