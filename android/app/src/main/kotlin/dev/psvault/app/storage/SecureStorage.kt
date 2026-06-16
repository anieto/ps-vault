package dev.psvault.app.storage

import android.content.Context
import android.content.SharedPreferences
import android.util.Base64
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys

/**
 * Secure and plain persistent storage for P.S. Vault.
 *
 * Encrypted (EncryptedSharedPreferences backed by Android Keystore):
 *   - refresh_token, mek (as base64)
 *
 * Plain SharedPreferences (non-secret config):
 *   - server_url, mek_salt, mek_envelope, argon2_params,
 *     lock_timeout, biometric_enabled, clipboard_timeout
 */
object SecureStorage {

    private var encrypted: SharedPreferences? = null
    private var plain: SharedPreferences? = null

    fun init(context: Context) {
        val masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
        encrypted = EncryptedSharedPreferences.create(
            "ps_vault_secure",
            masterKeyAlias,
            context,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
        plain = context.getSharedPreferences("ps_vault", Context.MODE_PRIVATE)
    }

    // MARK: - Encrypted values

    fun getString(key: String): String? = encrypted?.getString(key, null)

    fun setString(key: String, value: String) {
        encrypted?.edit()?.putString(key, value)?.apply()
    }

    fun delete(key: String) {
        encrypted?.edit()?.remove(key)?.apply()
    }

    fun getBytes(key: String): ByteArray? {
        val b64 = encrypted?.getString(key, null) ?: return null
        return try { Base64.decode(b64, Base64.NO_WRAP) } catch (e: Exception) { null }
    }

    fun setBytes(key: String, value: ByteArray) {
        encrypted?.edit()
            ?.putString(key, Base64.encodeToString(value, Base64.NO_WRAP))
            ?.apply()
    }

    // MARK: - Plain values

    fun getPlainString(key: String, default: String = ""): String =
        plain?.getString(key, default) ?: default

    fun setPlainString(key: String, value: String) {
        plain?.edit()?.putString(key, value)?.apply()
    }

    fun removePlain(key: String) {
        plain?.edit()?.remove(key)?.apply()
    }

    fun getPlainInt(key: String, default: Int = 0): Int =
        plain?.getInt(key, default) ?: default

    fun setPlainInt(key: String, value: Int) {
        plain?.edit()?.putInt(key, value)?.apply()
    }

    fun getPlainBoolean(key: String, default: Boolean = false): Boolean =
        plain?.getBoolean(key, default) ?: default

    fun setPlainBoolean(key: String, value: Boolean) {
        plain?.edit()?.putBoolean(key, value)?.apply()
    }

    // MARK: - Named keys (mirrors iOS Keychain.Key)

    object Key {
        const val REFRESH_TOKEN = "refresh_token"
        const val MEK = "mek"
        const val SERVER_URL = "server_url"
        const val MEK_SALT = "mek_salt"
        const val MEK_ENVELOPE = "mek_envelope"
        const val ARGON2_PARAMS = "argon2_params"
        const val LOCK_TIMEOUT = "lock_timeout"
        const val BIOMETRIC_ENABLED = "biometric_enabled"
        const val HAS_PROMPTED_BIOMETRICS = "has_prompted_biometrics"
        const val CLIPBOARD_TIMEOUT = "clipboard_timeout"
        const val COLOR_SCHEME = "color_scheme"
        const val LAST_SERVER_URL = "last_server_url"
    }
}
