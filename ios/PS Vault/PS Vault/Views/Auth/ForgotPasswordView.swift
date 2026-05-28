import SwiftUI

struct ForgotPasswordView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var sent = false
    @State private var error = ""
    @State private var isLoading = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                if sent {
                    VStack(spacing: 8) {
                        Image(systemName: "envelope.circle.fill")
                            .font(.system(size: 56))
                            .foregroundStyle(.tint)
                            .padding(.top, 24)
                        Text("Check your email")
                            .font(.title2).fontWeight(.bold)
                        Text("If an account exists for \(email), a reset link has been sent.")
                            .font(.subheadline).foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    Spacer()
                    Button("Done") { dismiss() }
                        .buttonStyle(.borderedProminent)
                        .frame(maxWidth: .infinity).frame(height: 50)
                } else {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Email")
                            .font(.caption).fontWeight(.medium).foregroundStyle(.secondary)
                        TextField("you@example.com", text: $email)
                            .textFieldStyle(.roundedBorder)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .onSubmit { Task { await submit() } }
                    }
                    if !error.isEmpty {
                        Text(error).font(.caption).foregroundStyle(.red)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    Button(action: { Task { await submit() } }) {
                        Group {
                            if isLoading { ProgressView().tint(.white) }
                            else { Text("Send reset link").fontWeight(.semibold) }
                        }
                        .frame(maxWidth: .infinity).frame(height: 50)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(email.isEmpty || isLoading)
                    Spacer()
                }
            }
            .padding(24)
            .navigationTitle("Reset password")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private func submit() async {
        error = ""
        isLoading = true
        defer { isLoading = false }
        do {
            try await APIService.shared.forgotPassword(email: email)
            sent = true
        } catch let e as APIError {
            error = e.errorDescription ?? "Failed to send reset email."
        } catch {
            self.error = error.localizedDescription
        }
    }
}
