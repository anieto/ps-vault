package dev.psvault.app.crypto

import android.util.Base64
import com.goterl.lazysodium.LazySodiumAndroid
import com.goterl.lazysodium.SodiumAndroid
import com.goterl.lazysodium.interfaces.AEAD
import com.goterl.lazysodium.interfaces.GenericHash
import com.goterl.lazysodium.interfaces.PwHash
import com.sun.jna.NativeLong
import dev.psvault.app.models.EntryData
import kotlinx.serialization.json.*

/**
 * Client-side cryptography for P.S. Vault.
 *
 * Key hierarchy (identical to iOS CryptoService):
 *   Password + mek_salt  →  Argon2id  →  KEK
 *   KEK  →  XChaCha20-Poly1305 decrypt mek_envelope  →  MEK
 *   MEK  →  XChaCha20-Poly1305 decrypt cek_envelope  →  CEK (per vault)
 *   CEK  →  XChaCha20-Poly1305 encrypt/decrypt entry encrypted_data
 *
 * Payload format (all levels): base64url( 24-byte nonce || ciphertext+tag )
 */
object CryptoService {

    private val sodium = LazySodiumAndroid(SodiumAndroid())

    private const val NONCE_BYTES = AEAD.XCHACHA20POLY1305_IETF_NPUBBYTES   // 24
    private const val TAG_BYTES   = AEAD.XCHACHA20POLY1305_IETF_ABYTES       // 16
    private const val KEY_BYTES   = 32

    // MARK: - Key / salt generation

    fun generateKey(): ByteArray = sodium.randomBytesBuf(KEY_BYTES)

    fun generateSalt(): ByteArray = sodium.randomBytesBuf(16)

    fun wrapKey(key: ByteArray, wrappingKey: ByteArray): String =
        encryptToEnvelope(key, wrappingKey)

    // MARK: - KEK derivation (Argon2id)

    fun deriveKEK(password: String, mekSaltHex: String, argon2ParamsJson: String): ByteArray {
        val salt = hexToBytes(mekSaltHex) ?: throw CryptoException.InvalidKey
        require(salt.size == 16) { "Salt must be 16 bytes" }

        val params = parseArgon2Params(argon2ParamsJson)
        val output = ByteArray(params.keyLength)
        val passwordBytes = password.toByteArray(Charsets.UTF_8)

        val ok = sodium.cryptoPwHash(
            output, params.keyLength,
            passwordBytes, passwordBytes.size,
            salt,
            params.iterations.toLong(),
            NativeLong(params.memory.toLong() * 1024L),
            PwHash.Alg.PWHASH_ALG_ARGON2ID13
        )
        if (!ok) throw CryptoException.KekDerivationFailed
        return output
    }

    // MARK: - Beneficiary key wrapping

    fun deriveBeneficiaryKey(sharedSecret: String): ByteArray {
        val saltInput = "psvault-bak-$sharedSecret".toByteArray(Charsets.UTF_8)
        val saltBytes = ByteArray(16)
        val ok1 = sodium.cryptoGenericHash(saltBytes, 16, saltInput, saltInput.size.toLong(), null, 0)
        if (!ok1) throw CryptoException.EncryptionFailed

        val secretBytes = sharedSecret.lowercase().trim().toByteArray(Charsets.UTF_8)
        val output = ByteArray(KEY_BYTES)
        val ok2 = sodium.cryptoPwHash(
            output, KEY_BYTES,
            secretBytes, secretBytes.size,
            saltBytes,
            3L,
            NativeLong(65536L * 1024L),
            PwHash.Alg.PWHASH_ALG_ARGON2ID13
        )
        if (!ok2) throw CryptoException.KekDerivationFailed
        return output
    }

    fun wrapCEKForBeneficiary(cek: ByteArray, sharedSecret: String): String {
        val bak = deriveBeneficiaryKey(sharedSecret)
        return encryptToEnvelope(cek, bak)
    }

    // MARK: - MEK / CEK unwrapping

    fun unwrapMEK(envelope: String, kek: ByteArray): ByteArray = decryptEnvelope(envelope, kek)
    fun unwrapCEK(envelope: String, mek: ByteArray): ByteArray = decryptEnvelope(envelope, mek)

    // MARK: - Entry encryption / decryption

    fun decryptEntry(encryptedData: String, cek: ByteArray): EntryData {
        val plainBytes = decryptEnvelope(encryptedData, cek)
        return EntryData.fromJsonString(String(plainBytes, Charsets.UTF_8))
    }

    fun encryptEntry(data: EntryData, cek: ByteArray): String =
        encryptToEnvelope(data.toJson().toByteArray(Charsets.UTF_8), cek)

    // MARK: - XChaCha20-Poly1305 primitives

    private fun encryptToEnvelope(plaintext: ByteArray, key: ByteArray): String {
        require(key.size == KEY_BYTES) { "Key must be 32 bytes" }
        val nonce = sodium.randomBytesBuf(NONCE_BYTES)

        val ciphertext = ByteArray(plaintext.size + TAG_BYTES)
        val cLen = LongArray(1)
        val ok = sodium.cryptoAeadXChaCha20Poly1305IetfEncrypt(
            ciphertext, cLen,
            plaintext, plaintext.size.toLong(),
            null, 0L,
            null, nonce, key
        )
        if (!ok) throw CryptoException.EncryptionFailed

        val payload = nonce + ciphertext.copyOf(cLen[0].toInt())
        return bytesToBase64Url(payload)
    }

    private fun decryptEnvelope(envelope: String, key: ByteArray): ByteArray {
        require(key.size == KEY_BYTES) { "Key must be 32 bytes" }
        val payload = base64UrlToBytes(envelope) ?: throw CryptoException.InvalidPayload
        require(payload.size > NONCE_BYTES) { "Payload too short" }

        val nonce = payload.copyOfRange(0, NONCE_BYTES)
        val ciphertext = payload.copyOfRange(NONCE_BYTES, payload.size)
        val plaintext = ByteArray(ciphertext.size - TAG_BYTES)
        val mLen = LongArray(1)
        val ok = sodium.cryptoAeadXChaCha20Poly1305IetfDecrypt(
            plaintext, mLen,
            null,
            ciphertext, ciphertext.size.toLong(),
            null, 0L,
            nonce, key
        )
        if (!ok) throw CryptoException.DecryptionFailed
        return plaintext.copyOf(mLen[0].toInt())
    }

    // MARK: - Encoding helpers

    fun hexToBytes(hex: String): ByteArray? {
        if (hex.length % 2 != 0) return null
        return try {
            ByteArray(hex.length / 2) { i ->
                hex.substring(i * 2, i * 2 + 2).toInt(16).toByte()
            }
        } catch (e: NumberFormatException) {
            null
        }
    }

    fun bytesToHex(bytes: ByteArray): String =
        bytes.joinToString("") { "%02x".format(it) }

    fun base64UrlToBytes(str: String): ByteArray? {
        val base64 = str
            .replace('-', '+')
            .replace('_', '/')
            .let { s ->
                val pad = (4 - s.length % 4) % 4
                s + "=".repeat(pad)
            }
        return try {
            Base64.decode(base64, Base64.DEFAULT)
        } catch (e: Exception) {
            null
        }
    }

    fun bytesToBase64Url(bytes: ByteArray): String =
        Base64.encodeToString(bytes, Base64.NO_WRAP or Base64.NO_PADDING)
            .replace('+', '-')
            .replace('/', '_')

    fun bytesToBase64(bytes: ByteArray): String =
        Base64.encodeToString(bytes, Base64.NO_WRAP)

    fun base64ToBytes(str: String): ByteArray? =
        try { Base64.decode(str, Base64.DEFAULT) } catch (e: Exception) { null }

    // MARK: - Argon2 params

    private data class Argon2Params(
        val memory: Int,
        val iterations: Int,
        val parallelism: Int,
        val keyLength: Int
    )

    private fun parseArgon2Params(json: String): Argon2Params {
        val obj = Json.parseToJsonElement(json).jsonObject
        return Argon2Params(
            memory = obj["memory"]?.jsonPrimitive?.int ?: 65536,
            iterations = obj["iterations"]?.jsonPrimitive?.int ?: 3,
            parallelism = obj["parallelism"]?.jsonPrimitive?.int ?: 1,
            keyLength = obj["key_length"]?.jsonPrimitive?.int ?: 32
        )
    }
}

sealed class CryptoException(message: String) : Exception(message) {
    object KekDerivationFailed : CryptoException("Failed to derive encryption key.")
    object DecryptionFailed : CryptoException("Decryption failed — wrong key or corrupted data.")
    object EncryptionFailed : CryptoException("Encryption failed.")
    object InvalidKey : CryptoException("Invalid encryption key.")
    object InvalidPayload : CryptoException("Invalid encrypted payload.")
}
