import SwiftUI

struct ServerSettingsView: View {
    @Environment(AppState.self) private var appState
    @State private var urlInput = ""

    var body: some View {
        Form {
            Section(header: Text("Server URL"), footer: Text("Changing this will sign you out.")) {
                TextField("https://vault.example.com", text: $urlInput)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                Button("Update") {
                    var url = urlInput.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
                    if !url.lowercased().hasPrefix("http://") && !url.lowercased().hasPrefix("https://") {
                        url = "https://" + url
                    }
                    appState.setServerURL(url)
                    appState.signOut()
                }
                .disabled(urlInput.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .scrollContentBackground(.hidden)
        .background { AuthBackground() }
        .navigationTitle("Server")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { urlInput = appState.serverURL }
    }
}
