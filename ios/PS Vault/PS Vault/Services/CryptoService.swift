import Foundation
import Sodium

/// Client-side cryptography for P.S. Vault.
///
/// Key hierarchy:
///   Password + mek_salt  →  Argon2id  →  KEK
///   KEK  →  XChaCha20-Poly1305 decrypt mek_envelope  →  MEK
///   MEK  →  XChaCha20-Poly1305 decrypt cek_envelope  →  CEK (per vault)
///   CEK  →  XChaCha20-Poly1305 encrypt/decrypt entry encrypted_data
///
/// Payload format (all levels): base64url( 24-byte nonce || ciphertext+tag )
enum CryptoService {

    nonisolated(unsafe) private static let sodium = Sodium()

    // MARK: - Argon2 params

    struct Argon2Params: Decodable {
        let memory: Int       // kibibytes
        let iterations: Int
        let parallelism: Int
        let key_length: Int
    }

    /// Default Argon2id parameters used at registration (must match server defaults).
    static let defaultArgon2ParamsJSON = "{\"memory\":65536,\"iterations\":3,\"parallelism\":1,\"key_length\":32}"

    // MARK: - Key / salt generation

    /// Generate a cryptographically random 32-byte key (for MEK or CEK).
    static func generateKey() -> Data {
        Data(sodium.randomBytes.buf(length: 32)!)
    }

    /// Generate a cryptographically random 16-byte salt (for mek_salt).
    static func generateSalt() -> Data {
        Data(sodium.randomBytes.buf(length: 16)!)
    }

    /// Wrap (encrypt) a raw key with a wrapping key — public interface for MEK/CEK wrapping.
    static func wrapKey(_ key: Data, with wrappingKey: Data) throws -> String {
        return try encryptToEnvelope(key, key: wrappingKey)
    }

    // MARK: - KEK derivation (Argon2id)

    /// Derive the Key Encryption Key from password + hex salt using Argon2id.
    static func deriveKEK(password: String, mekSaltHex: String, argon2ParamsJSON: String) throws -> Data {
        guard let saltData = hexToData(mekSaltHex), saltData.count == 16 else {
            throw CryptoError.invalidKey
        }
        let params = try JSONDecoder().decode(Argon2Params.self, from: Data(argon2ParamsJSON.utf8))
        let passwordBytes = Array(password.utf8)
        let saltBytes = Array(saltData)

        guard let kekBytes = sodium.pwHash.hash(
            outputLength: params.key_length,
            passwd: passwordBytes,
            salt: saltBytes,
            opsLimit: params.iterations,
            memLimit: params.memory * 1024,
            alg: .Argon2ID13
        ) else {
            throw CryptoError.kekDerivationFailed
        }
        return Data(kekBytes)
    }

    // MARK: - Beneficiary key wrapping

    /// Derive a 32-byte key from a shared secret (mirrors RN deriveBeneficiaryKey).
    /// Salt = BLAKE2b-16( "psvault-bak-" + sharedSecret )
    /// Key  = Argon2id( sharedSecret.lowercased(), salt )
    static func deriveBeneficiaryKey(sharedSecret: String) throws -> Data {
        let saltInput = Array("psvault-bak-\(sharedSecret)".utf8)
        guard let saltBytes = sodium.genericHash.hash(message: saltInput, outputLength: 16) else {
            throw CryptoError.encryptionFailed
        }
        let secretBytes = Array(sharedSecret.lowercased().trimmingCharacters(in: .whitespaces).utf8)
        guard let keyBytes = sodium.pwHash.hash(
            outputLength: 32,
            passwd: secretBytes,
            salt: saltBytes,
            opsLimit: 3,
            memLimit: 65536 * 1024,
            alg: .Argon2ID13
        ) else {
            throw CryptoError.kekDerivationFailed
        }
        return Data(keyBytes)
    }

    /// Wrap a vault CEK with a beneficiary's shared secret so they can access the vault.
    static func wrapCEKForBeneficiary(cek: Data, sharedSecret: String) throws -> String {
        let bak = try deriveBeneficiaryKey(sharedSecret: sharedSecret)
        return try encryptToEnvelope(cek, key: bak)
    }

    // MARK: - MEK / CEK unwrapping

    /// Unwrap (decrypt) the MEK envelope with the KEK.
    static func unwrapMEK(envelope: String, kek: Data) throws -> Data {
        return try decryptEnvelope(envelope, key: kek)
    }

    /// Unwrap a vault's CEK envelope with the MEK.
    static func unwrapCEK(envelope: String, mek: Data) throws -> Data {
        return try decryptEnvelope(envelope, key: mek)
    }

    // MARK: - Entry encryption / decryption

    /// Decrypt an entry's encrypted_data with the vault CEK.
    static func decryptEntry(encryptedData: String, cek: Data) throws -> EntryData {
        let plainBytes = try decryptEnvelope(encryptedData, key: cek)
        return try JSONDecoder().decode(EntryData.self, from: plainBytes)
    }

    /// Encrypt entry data with the vault CEK.
    static func encryptEntry(_ data: EntryData, cek: Data) throws -> String {
        let jsonData = try JSONEncoder().encode(data)
        return try encryptToEnvelope(jsonData, key: cek)
    }

    // MARK: - XChaCha20-Poly1305 primitives

    /// Encrypt bytes → base64url(nonce || ciphertext+tag).
    private static func encryptToEnvelope(_ plaintext: Data, key: Data) throws -> String {
        guard key.count == 32 else { throw CryptoError.invalidKey }
        // Use explicit return type to select the tuple overload (nonce generated internally)
        guard let result: (authenticatedCipherText: Bytes, nonce: Bytes) = sodium.aead.xchacha20poly1305ietf.encrypt(
            message: Array(plaintext),
            secretKey: Array(key),
            additionalData: nil
        ) else {
            throw CryptoError.encryptionFailed
        }
        // Payload format: nonce || ciphertext+tag
        let combined = result.nonce + result.authenticatedCipherText
        return dataToBase64url(Data(combined))
    }

    /// Decrypt base64url(nonce || ciphertext+tag) → bytes.
    private static func decryptEnvelope(_ payload: String, key: Data) throws -> Data {
        guard key.count == 32 else { throw CryptoError.invalidKey }
        guard let combined = base64urlToData(payload) else { throw CryptoError.invalidPayload }
        guard let plainBytes = sodium.aead.xchacha20poly1305ietf.decrypt(
            nonceAndAuthenticatedCipherText: Array(combined),
            secretKey: Array(key)
        ) else {
            throw CryptoError.decryptionFailed
        }
        return Data(plainBytes)
    }

    // MARK: - Encoding helpers

    static func hexToData(_ hex: String) -> Data? {
        guard hex.count % 2 == 0 else { return nil }
        var data = Data()
        var idx = hex.startIndex
        while idx < hex.endIndex {
            let next = hex.index(idx, offsetBy: 2)
            guard let byte = UInt8(hex[idx..<next], radix: 16) else { return nil }
            data.append(byte)
            idx = next
        }
        return data
    }

    static func base64urlToData(_ str: String) -> Data? {
        var base64 = str
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        let pad = (4 - base64.count % 4) % 4
        base64 += String(repeating: "=", count: pad)
        return Data(base64Encoded: base64)
    }

    static func dataToBase64url(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

enum CryptoError: Error, LocalizedError {
    case kekDerivationFailed
    case decryptionFailed
    case encryptionFailed
    case invalidKey
    case invalidPayload

    var errorDescription: String? {
        switch self {
        case .kekDerivationFailed: return "Failed to derive encryption key."
        case .decryptionFailed: return "Decryption failed — wrong key or corrupted data."
        case .encryptionFailed: return "Encryption failed."
        case .invalidKey: return "Invalid encryption key."
        case .invalidPayload: return "Invalid encrypted payload."
        }
    }
}
