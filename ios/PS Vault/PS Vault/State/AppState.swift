import SwiftUI

@Observable
final class AppState {

    // MARK: - Persisted (UserDefaults)
    var serverURL: String {
        didSet { UserDefaults.standard.set(serverURL, forKey: "server_url") }
    }
    var lockTimeoutSeconds: Int {
        didSet { UserDefaults.standard.set(lockTimeoutSeconds, forKey: "lock_timeout") }
    }
    var biometricEnabled: Bool {
        didSet { UserDefaults.standard.set(biometricEnabled, forKey: "biometric_enabled") }
    }
    var clipboardTimeoutSeconds: Int {
        didSet { UserDefaults.standard.set(clipboardTimeoutSeconds, forKey: "clipboard_timeout") }
    }

    // MARK: - Auth state (in-memory)
    var isAuthenticated: Bool = false
    var isLocked: Bool = false
    var user: User? = nil
    var mek: Data? = nil          // Master Encryption Key — never persisted in plaintext
    var accessToken: String? = nil {
        didSet { APIService.shared.accessToken = accessToken }
    }

    // MARK: - Tab selection
    var selectedTab: String = "dashboard"

    // MARK: - Branding
    var accentHex: String = ""

    var brandColor: Color {
        var hex = accentHex
        guard !hex.isEmpty else { return .accentColor }
        if hex.hasPrefix("#") { hex = String(hex.dropFirst()) }
        guard hex.count == 6, let value = UInt64(hex, radix: 16) else { return .accentColor }
        let r = Double((value >> 16) & 0xFF) / 255
        let g = Double((value >> 8) & 0xFF) / 255
        let b = Double(value & 0xFF) / 255
        return Color(red: r, green: g, blue: b)
    }

    // MARK: - Deep link
    var pendingDeepLinkURL: URL? = nil

    // MARK: - Init
    init() {
        serverURL = UserDefaults.standard.string(forKey: "server_url") ?? ""
        lockTimeoutSeconds = UserDefaults.standard.object(forKey: "lock_timeout") as? Int ?? 300
        biometricEnabled = UserDefaults.standard.bool(forKey: "biometric_enabled")
        clipboardTimeoutSeconds = UserDefaults.standard.object(forKey: "clipboard_timeout") as? Int ?? 30
        APIService.shared.baseURL = serverURL
        // Restore authenticated+locked state if a session exists in Keychain.
        // The actual token refresh happens inside LockView when the user authenticates.
        let hasSession = Keychain.get(Keychain.Key.refreshToken) != nil
        if hasSession && !serverURL.isEmpty {
            isAuthenticated = true
            isLocked = true
        }
    }

    // MARK: - Crypto params (UserDefaults — not secret: MEK envelope is encrypted with password-derived key)

    /// Save MEK crypto params needed for password-based unlock and password change.
    func saveCryptoParams(mekSalt: String, mekEnvelope: String, argon2Params: String) {
        UserDefaults.standard.set(mekSalt, forKey: "mek_salt")
        UserDefaults.standard.set(mekEnvelope, forKey: "mek_envelope")
        UserDefaults.standard.set(argon2Params, forKey: "argon2_params")
    }

    var storedMekSalt: String { UserDefaults.standard.string(forKey: "mek_salt") ?? "" }
    var storedMekEnvelope: String { UserDefaults.standard.string(forKey: "mek_envelope") ?? "" }
    var storedArgon2Params: String { UserDefaults.standard.string(forKey: "argon2_params") ?? "" }

    // MARK: - Server

    func setServerURL(_ url: String) {
        let trimmed = url.trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        serverURL = trimmed
        APIService.shared.baseURL = trimmed
    }

    // MARK: - Auth

    func signIn(accessToken: String, refreshToken: String, user: User, mek: Data?) {
        self.accessToken = accessToken
        self.user = user
        self.mek = mek
        self.isAuthenticated = true
        self.isLocked = false
        Keychain.set(refreshToken, key: Keychain.Key.refreshToken)
        if let mek {
            Keychain.set(mek.base64EncodedString(), key: Keychain.Key.mek)
        }
    }

    func updateUser(_ user: User) {
        self.user = user
    }

    func signOut() {
        accessToken = nil
        mek = nil
        user = nil
        isAuthenticated = false
        isLocked = false
        Keychain.delete(Keychain.Key.refreshToken)
        Keychain.delete(Keychain.Key.mek)
        Keychain.delete(Keychain.Key.accessToken)
        UserDefaults.standard.removeObject(forKey: "mek_salt")
        UserDefaults.standard.removeObject(forKey: "mek_envelope")
        UserDefaults.standard.removeObject(forKey: "argon2_params")
    }

    func lock() {
        accessToken = nil
        mek = nil
        isLocked = true
    }

    func unlock(accessToken: String, mek: Data?, user: User? = nil) {
        self.accessToken = accessToken
        self.mek = mek
        if let user { self.user = user }
        self.isLocked = false
    }

    // MARK: - MEK Keychain helpers

    func loadMEKFromKeychain() -> Data? {
        guard let b64 = Keychain.get(Keychain.Key.mek) else { return nil }
        return Data(base64Encoded: b64)
    }
}
