import SwiftUI

struct AuthBackground: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(AppState.self) private var appState
    @AppStorage("useAccentGradient") private var useAccentGradient = false

    // Option 2 — Metallic/Steel
    private let points: [SIMD2<Float>] = [
        [0.0, 0.0], [0.5, 0.0], [1.0, 0.0],
        [0.0, 0.5], [0.55, 0.42], [1.0, 0.5],
        [0.0, 1.0], [0.38, 1.0], [1.0, 1.0]
    ]

    // Gunmetal dark steel — deep shadows with a bright off-center sheen
    private var darkColors: [Color] {[
        Color(red: 0.10, green: 0.12, blue: 0.15),
        Color(red: 0.20, green: 0.22, blue: 0.25),
        Color(red: 0.08, green: 0.10, blue: 0.13),
        Color(red: 0.14, green: 0.16, blue: 0.20),
        Color(red: 0.32, green: 0.34, blue: 0.38),
        Color(red: 0.11, green: 0.13, blue: 0.17),
        Color(red: 0.05, green: 0.06, blue: 0.08),
        Color(red: 0.12, green: 0.14, blue: 0.18),
        Color(red: 0.06, green: 0.07, blue: 0.10)
    ]}

    // Polished silver chrome — bright highlights with cool gray shadows
    private var lightColors: [Color] {[
        Color(red: 0.82, green: 0.84, blue: 0.88),
        Color(red: 0.94, green: 0.95, blue: 0.97),
        Color(red: 0.80, green: 0.82, blue: 0.86),
        Color(red: 0.86, green: 0.88, blue: 0.91),
        Color(red: 0.97, green: 0.97, blue: 0.98),
        Color(red: 0.79, green: 0.81, blue: 0.85),
        Color(red: 0.76, green: 0.78, blue: 0.82),
        Color(red: 0.88, green: 0.89, blue: 0.92),
        Color(red: 0.78, green: 0.80, blue: 0.84)
    ]}

    var body: some View {
        ZStack {
            MeshGradient(
                width: 3,
                height: 3,
                points: points,
                colors: colorScheme == .dark ? darkColors : lightColors
            )
            if useAccentGradient {
                LinearGradient(
                    colors: [appState.brandColor.opacity(colorScheme == .dark ? 0.25 : 0.18), Color.clear],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            }
        }
        .ignoresSafeArea()
    }
}

// MARK: - Shared card and button styles

extension View {
    /// Standard card style — Liquid Glass on iOS 26+, system material on earlier versions.
    /// Pass a tint for colored status cards (orange, red); nil for neutral cards.
    /// Pass interactive: true for tappable cards.
    @ViewBuilder
    func vaultCardStyle(cornerRadius: CGFloat = 16, tint: Color? = nil, interactive: Bool = false) -> some View {
        if #available(iOS 26, *) {
            if let tint {
                if interactive {
                    self.glassEffect(.regular.tint(tint).interactive(), in: .rect(cornerRadius: cornerRadius))
                } else {
                    self.glassEffect(.regular.tint(tint), in: .rect(cornerRadius: cornerRadius))
                }
            } else {
                if interactive {
                    self.glassEffect(.regular.interactive(), in: .rect(cornerRadius: cornerRadius))
                } else {
                    self.glassEffect(.regular, in: .rect(cornerRadius: cornerRadius))
                }
            }
        } else {
            self
                .background(tint.map { $0.opacity(0.08) } ?? Color(UIColor.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
                .overlay(RoundedRectangle(cornerRadius: cornerRadius).stroke(
                    tint.map { $0.opacity(0.25) } ?? Color(UIColor.separator), lineWidth: 1))
        }
    }

    /// Standard action button style — glass on iOS 26+, bordered on earlier versions.
    @ViewBuilder
    func vaultButtonStyle() -> some View {
        if #available(iOS 26, *) {
            self.buttonStyle(.glass)
        } else {
            self.buttonStyle(.bordered)
        }
    }
}
