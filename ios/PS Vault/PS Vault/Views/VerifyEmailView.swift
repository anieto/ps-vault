import SwiftUI

/// Deep link target for email verification: psvault://verify?token=xxx
/// The web app handles the actual verification — this screen confirms to the user
/// and directs them to sign in.
struct VerifyEmailView: View {
    let token: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Spacer()
                VStack(spacing: 20) {
                    Image(systemName: "envelope.badge.fill")
                        .font(.system(size: 56))
                        .foregroundStyle(.green)
                    Text("Email verified")
                        .font(.system(size: 26, weight: .bold))
                    Text("Your email address has been confirmed. You can now sign in.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                    Button("Done") { dismiss() }
                        .buttonStyle(.borderedProminent)
                        .padding(.top, 8)
                }
                Spacer()
            }
            .padding(.horizontal, 32)
            .navigationTitle("Email Verified")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }
}
