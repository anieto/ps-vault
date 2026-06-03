import SwiftUI

extension View {
    func dismissKeyboardOnTap() -> some View {
        self.background(KeyboardDismissInstaller())
    }
}

/// Installs a window-level tap recognizer that dismisses the keyboard on any tap
/// that doesn't land on a UITextField or UITextView. Window-level placement ensures
/// the recognizer sees all taps, including taps on empty space inside a ScrollView.
private struct KeyboardDismissInstaller: UIViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> UIView {
        let v = UIView()
        v.isUserInteractionEnabled = false
        // Attach once the view is in the window hierarchy.
        DispatchQueue.main.async { context.coordinator.attach(from: v) }
        return v
    }

    func updateUIView(_ uiView: UIView, context: Context) {}

    static func dismantleUIView(_ uiView: UIView, coordinator: Coordinator) {
        coordinator.detach()
    }

    final class Coordinator: NSObject {
        private var recognizer: SmartDismissRecognizer?
        private weak var window: UIWindow?

        func attach(from view: UIView) {
            guard recognizer == nil, let w = view.window else { return }
            let tap = SmartDismissRecognizer(target: self, action: #selector(handleTap))
            tap.cancelsTouchesInView = false
            w.addGestureRecognizer(tap)
            recognizer = tap
            window = w
        }

        func detach() {
            if let r = recognizer { window?.removeGestureRecognizer(r) }
            recognizer = nil
        }

        @objc private func handleTap() {
            UIApplication.shared.sendAction(
                #selector(UIResponder.resignFirstResponder),
                to: nil, from: nil, for: nil
            )
        }
    }
}

/// Cancels itself when the touch began on a UITextField or UITextView so that
/// cursor repositioning and text selection work normally.
private final class SmartDismissRecognizer: UITapGestureRecognizer {
    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        var view = touches.first?.view
        while let v = view {
            if v is UITextField || v is UITextView { state = .failed; return }
            view = v.superview
        }
        super.touchesBegan(touches, with: event)
    }
}
