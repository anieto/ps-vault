import SwiftUI

extension Notification.Name {
    static let checkinCompleted = Notification.Name("checkinCompleted")
}

struct CheckinConfirmView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var status: Status = .idle
    @State private var errorMessage = ""

    enum Status { case idle, loading, done, error }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Spacer()
                switch status {
                case .idle:
                    idleView
                case .loading:
                    ProgressView()
                        .controlSize(.large)
                case .done:
                    doneView
                case .error:
                    errorView
                }
                Spacer()
            }
            .padding(.horizontal, 32)
            .navigationTitle("Check In")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Not now") { dismiss() }
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private var idleView: some View {
        VStack(spacing: 20) {
            Image(systemName: "checkmark.shield.fill")
                .font(.system(size: 56))
                .foregroundStyle(.tint)
            Text("Are you okay?")
                .font(.system(size: 26, weight: .bold))
            Text("Tap the button below to reset your check-in timer.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button {
                Task { await checkIn() }
            } label: {
                Text("I'm okay — reset my timer")
                    .fontWeight(.semibold)
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
            }
            .buttonStyle(.borderedProminent)
            .padding(.top, 8)
        }
    }

    private var doneView: some View {
        VStack(spacing: 16) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 56))
                .foregroundStyle(.green)
            Text("Check-in complete")
                .font(.system(size: 24, weight: .bold))
            Text("You're all set. Your check-in timer has been reset.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("Done") { dismiss() }
                .buttonStyle(.borderedProminent)
                .padding(.top, 8)
        }
    }

    private var errorView: some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 56))
                .foregroundStyle(.orange)
            Text("Something went wrong")
                .font(.system(size: 24, weight: .bold))
            Text(errorMessage)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("Try again") { status = .idle }
                .buttonStyle(.borderedProminent)
                .padding(.top, 8)
        }
    }

    private func checkIn() async {
        status = .loading
        do {
            _ = try await APIService.shared.checkin()
            status = .done
            NotificationCenter.default.post(name: .checkinCompleted, object: nil)
        } catch let e as APIError {
            errorMessage = e.errorDescription ?? "Check-in failed. Please try again."
            status = .error
        } catch {
            errorMessage = error.localizedDescription
            status = .error
        }
    }
}
