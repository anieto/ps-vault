import SwiftUI

struct SetupView: View {
    @Environment(AppState.self) private var appState
    @State private var urlInput = ""
    @State private var error = ""
    @State private var isChecking = false
    @State private var isSuccess = false
    @FocusState private var urlFocused: Bool

    private var isInsecure: Bool {
        urlInput.lowercased().hasPrefix("http://")
    }

    var body: some View {
        ZStack {
        AuthBackground()
        VStack(spacing: 0) {
            Spacer()

            // Branding
            VStack(spacing: 12) {
                Image("AppLogo")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 100, height: 100)
                    .clipShape(RoundedRectangle(cornerRadius: 22))
                    .shadow(color: .black.opacity(0.15), radius: 10, x: 0, y: 4)

                Text("P.S. Vault")
                    .font(.system(size: 34, weight: .bold))

                Text("Your final message, safely delivered.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 32)

            // Fixed gap between branding and form
            Spacer().frame(height: 48)

            // Form
            VStack(alignment: .leading, spacing: 10) {
                Text("Enter your server URL to get started.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)

                HStack(spacing: 10) {
                    Image(systemName: "server.rack")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(.secondary)
                    TextField("https://vault.example.com", text: $urlInput)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($urlFocused)
                        .onSubmit { Task { await connect() } }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 14)
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(
                            !error.isEmpty ? Color.red : isInsecure ? Color.orange : Color(.separator),
                            lineWidth: 1
                        )
                )
                .onChange(of: urlFocused) { _, focused in
                    if focused && urlInput.isEmpty {
                        urlInput = "https://"
                    }
                }
                .onAppear {
                    if urlInput.isEmpty {
                        let last = UserDefaults.standard.string(forKey: "last_server_url") ?? ""
                        if !last.isEmpty { urlInput = last }
                    }
                }

                if isInsecure {
                    Label("HTTPS is required. HTTP connections are not allowed.", systemImage: "exclamationmark.circle.fill")
                        .font(.caption)
                        .foregroundStyle(.red)
                } else if !error.isEmpty {
                    Label(error, systemImage: "exclamationmark.circle.fill")
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }
            .padding(.horizontal, 32)

            Button(action: { Task { await connect() } }) {
                Group {
                    if isSuccess {
                        Label("Connected", systemImage: "checkmark")
                            .fontWeight(.semibold)
                    } else if isChecking {
                        ProgressView().tint(.white)
                    } else {
                        Text("Connect").fontWeight(.semibold)
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 50)
            }
            .buttonStyle(.borderedProminent)
            .tint(isSuccess ? .green : .accentColor)
            .padding(.horizontal, 32)
            .padding(.top, 14)
            .disabled(urlInput.trimmingCharacters(in: .whitespaces).isEmpty || isInsecure || isChecking || isSuccess)

            Spacer()
        }
        .dismissKeyboardOnTap()
        } // ZStack
    }

    private func connect() async {
        error = ""
        isChecking = true
        var trimmed = urlInput
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if !trimmed.lowercased().hasPrefix("http://") && !trimmed.lowercased().hasPrefix("https://") {
            trimmed = "https://" + trimmed
        }
        // Verify the server is reachable before saving
        guard let pingURL = URL(string: "\(trimmed)/health") else {
            self.error = "Invalid URL format."
            isChecking = false
            return
        }
        do {
            var req = URLRequest(url: pingURL, timeoutInterval: 8)
            req.httpMethod = "GET"
            req.setValue("mobile", forHTTPHeaderField: "X-Client")
            let (_, response) = try await URLSession.shared.data(for: req)
            guard response is HTTPURLResponse else {
                self.error = "Couldn't reach that server. Check the URL and try again."
                isChecking = false
                return
            }
        } catch {
            self.error = "Couldn't reach that server. Check the URL and try again."
            isChecking = false
            return
        }
        isChecking = false
        withAnimation { isSuccess = true }
        try? await Task.sleep(nanoseconds: 900_000_000)
        appState.setServerURL(trimmed)
    }
}

#Preview {
    SetupView()
        .environment(AppState())
}
