import SwiftUI

private extension Color {
    var hexString: String? {
        let ui = UIColor(self)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        guard ui.getRed(&r, green: &g, blue: &b, alpha: &a) else { return nil }
        return String(format: "#%02X%02X%02X", Int(r * 255), Int(g * 255), Int(b * 255))
    }
}

struct AppearanceSettingsView: View {
    @Environment(AppState.self) private var appState
    @AppStorage("appColorScheme") private var colorSchemePreference: String = "system"
    @AppStorage("useAccentGradient") private var useAccentGradient = false
    @State private var accentColor: Color = .accentColor
    @State private var isSavingColor = false
    @State private var colorSaveError = ""
    @State private var colorSaveSuccess = false

    var body: some View {
        List {
            Section {
                Toggle(isOn: $useAccentGradient) {
                    Label("Accent color tint", systemImage: "paintpalette")
                }
            } header: {
                Text("Background")
            } footer: {
                Text("Applies your accent color as a subtle wash over the metallic background.")
            }

            Section("Theme") {
                Picker("Color scheme", selection: $colorSchemePreference) {
                    Label("Light", systemImage: "sun.max").tag("light")
                    Label("System", systemImage: "circle.lefthalf.filled").tag("system")
                    Label("Dark", systemImage: "moon").tag("dark")
                }
                .pickerStyle(.inline)
                .labelsHidden()
            }

            if appState.user?.role == "admin" {
                Section {
                    ColorPicker("Accent color", selection: $accentColor, supportsOpacity: false)
                    if !colorSaveError.isEmpty {
                        Text(colorSaveError)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                    Button {
                        Task { await saveAccentColor() }
                    } label: {
                        HStack {
                            if isSavingColor {
                                ProgressView()
                                    .tint(.accentColor)
                            } else if colorSaveSuccess {
                                Label("Saved", systemImage: "checkmark")
                                    .foregroundStyle(.green)
                            } else {
                                Text("Save accent color")
                            }
                        }
                    }
                    .disabled(isSavingColor)
                } header: {
                    Text("Accent Color")
                } footer: {
                    Text("This updates the accent color across the web app and all connected devices.")
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background { AuthBackground() }
        .navigationTitle("Appearance")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            accentColor = appState.brandColor
        }
    }

    private func saveAccentColor() async {
        colorSaveError = ""
        colorSaveSuccess = false
        guard let hex = accentColor.hexString else { return }
        isSavingColor = true
        defer { isSavingColor = false }
        do {
            try await APIService.shared.updateAccentColor(hex)
            appState.accentHex = hex
            colorSaveSuccess = true
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            colorSaveSuccess = false
        } catch {
            colorSaveError = "Failed to save. Try again."
        }
    }
}
