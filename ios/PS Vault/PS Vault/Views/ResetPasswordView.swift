import SwiftUI

struct ResetPasswordView: View {
    let token: String
    @Environment(\.dismiss) private var dismiss
    @State private var password = ""
    @State private var confirm = ""
    @State private var isLoading = false
    @State private var error = ""
    @State private var done = false

    var body: some View {
        NavigationStack {
            if done {
                VStack(spacing: 20) {
                    Spacer()
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 56))
                        .foregroundStyle(.green)
                    Text("Password reset")
                        .font(.system(size: 26, weight: .bold))
                    Text("Your password has been updated. Sign in with your new password.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                    Button("Done") { dismiss() }
                        .buttonStyle(.borderedProminent)
                    Spacer()
                }
                .padding(.horizontal, 32)
            } else {
                Form {
                    Section {
                        SecureField("New password (12+ characters)", text: $password)
                        SecureField("Confirm new password", text: $confirm)
                    }
                    if !error.isEmpty {
                        Section { Text(error).foregroundStyle(.red).font(.caption) }
                    }
                }
                .navigationTitle("Reset Password")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { dismiss() }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Reset") { Task { await reset() } }
                            .disabled(!canReset || isLoading)
                    }
                }
            }
        }
    }

    private var canReset: Bool {
        password.count >= 12 && password == confirm
    }

    private func reset() async {
        guard !token.isEmpty else { error = "Invalid reset link."; return }
        error = ""
        isLoading = true
        defer { isLoading = false }
        do {
            try await APIService.shared.resetPassword(token: token, password: password)
            done = true
        } catch let e as APIError {
            error = e.errorDescription ?? "Reset failed. Please try again."
        } catch {
            self.error = error.localizedDescription
        }
    }
}
