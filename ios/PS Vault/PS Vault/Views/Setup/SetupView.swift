import SwiftUI

struct SetupView: View {
    @Environment(AppState.self) private var appState
    @State private var urlInput = ""
    @State private var error = ""
    @State private var isChecking = false

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: 8) {
                Text("🔐")
                    .font(.system(size: 56))
                Text("P.S. Vault")
                    .font(.system(size: 32, weight: .bold))
                Text("Enter your server URL to get started.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding(.bottom, 40)

            VStack(alignment: .leading, spacing: 6) {
                Text("Server URL")
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundStyle(.secondary)
                TextField("https://vault.example.com", text: $urlInput)
                    .textFieldStyle(.roundedBorder)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .onSubmit { Task { await connect() } }
                if !error.isEmpty {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }
            .padding(.horizontal, 32)

            Button(action: { Task { await connect() } }) {
                Group {
                    if isChecking {
                        ProgressView()
                            .tint(.white)
                    } else {
                        Text("Connect")
                            .fontWeight(.semibold)
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 50)
            }
            .buttonStyle(.borderedProminent)
            .padding(.horizontal, 32)
            .padding(.top, 16)
            .disabled(urlInput.trimmingCharacters(in: .whitespaces).isEmpty || isChecking)

            Spacer()
        }
    }

    private func connect() async {
        error = ""
        isChecking = true
        defer { isChecking = false }
        var trimmed = urlInput
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if !trimmed.lowercased().hasPrefix("http://") && !trimmed.lowercased().hasPrefix("https://") {
            trimmed = "https://" + trimmed
        }
        // Verify the server is reachable before saving
        guard let pingURL = URL(string: "\(trimmed)/health") else {
            self.error = "Invalid URL format."
            return
        }
        do {
            var req = URLRequest(url: pingURL, timeoutInterval: 8)
            req.httpMethod = "GET"
            req.setValue("mobile", forHTTPHeaderField: "X-Client")
            let (_, response) = try await URLSession.shared.data(for: req)
            // Any HTTP response means the server is reachable
            guard response is HTTPURLResponse else {
                self.error = "Couldn't reach that server. Check the URL and try again."
                return
            }
        } catch {
            self.error = "Couldn't reach that server. Check the URL and try again."
            return
        }
        appState.setServerURL(trimmed)
    }
}

#Preview {
    SetupView()
        .environment(AppState())
}
