package dev.psvault.app.state

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.lifecycle.AndroidViewModel
import dev.psvault.app.api.ApiService
import dev.psvault.app.models.User
import dev.psvault.app.storage.SecureStorage

/**
 * Central application state — mirrors iOS AppState.
 * Passed through the composition tree via LocalAppViewModel.
 * Uses Compose mutableStateOf for direct observation in composables.
 */
class AppViewModel(app: Application) : AndroidViewModel(app) {

    // MARK: - Persisted (plain SharedPreferences)

    var serverUrl by mutableStateOf(SecureStorage.getPlainString(SecureStorage.Key.SERVER_URL))
        private set

    var lockTimeoutSeconds by mutableStateOf(
        SecureStorage.getPlainInt(SecureStorage.Key.LOCK_TIMEOUT, 60)
    )
        private set

    var biometricEnabled by mutableStateOf(
        SecureStorage.getPlainBoolean(SecureStorage.Key.BIOMETRIC_ENABLED, false)
    )
        private set

    var clipboardTimeoutSeconds by mutableStateOf(
        SecureStorage.getPlainInt(SecureStorage.Key.CLIPBOARD_TIMEOUT, 30)
    )
        private set

    var colorScheme by mutableStateOf(
        SecureStorage.getPlainString(SecureStorage.Key.COLOR_SCHEME).ifEmpty { "system" }
    )
        private set

    // MARK: - Auth state (in-memory)

    var isAuthenticated by mutableStateOf(false)
        private set

    var isLocked by mutableStateOf(false)
        private set

    var user by mutableStateOf<User?>(null)
        private set

    var mek: ByteArray? = null  // Master Encryption Key — never persisted in plaintext

    var accessToken: String? = null
        set(value) {
            field = value
            ApiService.accessToken = value
        }

    // MARK: - Tab selection

    var selectedTab by mutableStateOf("dashboard")

    // MARK: - Branding

    var accentHex by mutableStateOf("")
        private set

    var loginCountsAsCheckin by mutableStateOf(true)
        private set

    val brandColor: Color
        get() {
            var hex = accentHex
            if (hex.isEmpty()) return Color.Unspecified
            if (hex.startsWith("#")) hex = hex.drop(1)
            if (hex.length != 6) return Color.Unspecified
            return try {
                val value = hex.toLong(16)
                Color(
                    red = ((value shr 16) and 0xFF).toFloat() / 255f,
                    green = ((value shr 8) and 0xFF).toFloat() / 255f,
                    blue = (value and 0xFF).toFloat() / 255f
                )
            } catch (e: Exception) { Color.Unspecified }
        }

    // MARK: - Deep link

    var pendingDeepLinkPath by mutableStateOf<String?>(null)

    // MARK: - Init

    init {
        ApiService.baseUrl = serverUrl
        // Restore locked state if a session token exists
        val hasSession = SecureStorage.getString(SecureStorage.Key.REFRESH_TOKEN) != null
        if (hasSession && serverUrl.isNotEmpty()) {
            isAuthenticated = true
            isLocked = true
        }
    }

    // MARK: - Server

    fun updateServerUrl(url: String) {
        val trimmed = url.trim().trimEnd('/')
        if (trimmed.isNotEmpty()) {
            SecureStorage.setPlainString(SecureStorage.Key.LAST_SERVER_URL, trimmed)
        }
        serverUrl = trimmed
        SecureStorage.setPlainString(SecureStorage.Key.SERVER_URL, trimmed)
        ApiService.baseUrl = trimmed
    }

    fun getLastServerUrl(): String =
        SecureStorage.getPlainString(SecureStorage.Key.LAST_SERVER_URL)

    // MARK: - Auth

    fun signIn(accessToken: String, refreshToken: String, user: User, mek: ByteArray?) {
        this.accessToken = accessToken
        this.user = user
        this.mek = mek
        this.isAuthenticated = true
        this.isLocked = false
        SecureStorage.setString(SecureStorage.Key.REFRESH_TOKEN, refreshToken)
        mek?.let { SecureStorage.setBytes(SecureStorage.Key.MEK, it) }
        ApiService.onUnauthorized = { signOut() }
    }

    fun updateUser(user: User) {
        this.user = user
    }

    fun signOut() {
        ApiService.onUnauthorized = null
        accessToken = null
        mek = null
        user = null
        isAuthenticated = false
        isLocked = false
        SecureStorage.delete(SecureStorage.Key.REFRESH_TOKEN)
        SecureStorage.delete(SecureStorage.Key.MEK)
        SecureStorage.removePlain(SecureStorage.Key.MEK_SALT)
        SecureStorage.removePlain(SecureStorage.Key.MEK_ENVELOPE)
        SecureStorage.removePlain(SecureStorage.Key.ARGON2_PARAMS)
    }

    fun lock() {
        accessToken = null
        mek = null
        isLocked = true
    }

    fun unlock(accessToken: String, mek: ByteArray?, user: User? = null) {
        this.accessToken = accessToken
        this.mek = mek
        user?.let { this.user = it }
        this.isLocked = false
        ApiService.onUnauthorized = { signOut() }
    }

    // MARK: - MEK helpers

    fun loadMEKFromStorage(): ByteArray? = SecureStorage.getBytes(SecureStorage.Key.MEK)

    fun saveCryptoParams(mekSalt: String, mekEnvelope: String, argon2Params: String) {
        SecureStorage.setPlainString(SecureStorage.Key.MEK_SALT, mekSalt)
        SecureStorage.setPlainString(SecureStorage.Key.MEK_ENVELOPE, mekEnvelope)
        SecureStorage.setPlainString(SecureStorage.Key.ARGON2_PARAMS, argon2Params)
    }

    val storedMekSalt: String get() = SecureStorage.getPlainString(SecureStorage.Key.MEK_SALT)
    val storedMekEnvelope: String get() = SecureStorage.getPlainString(SecureStorage.Key.MEK_ENVELOPE)
    val storedArgon2Params: String get() = SecureStorage.getPlainString(SecureStorage.Key.ARGON2_PARAMS)

    // MARK: - Settings

    fun setLockTimeout(seconds: Int) {
        lockTimeoutSeconds = seconds
        SecureStorage.setPlainInt(SecureStorage.Key.LOCK_TIMEOUT, seconds)
    }

    fun updateBiometricEnabled(enabled: Boolean) {
        biometricEnabled = enabled
        SecureStorage.setPlainBoolean(SecureStorage.Key.BIOMETRIC_ENABLED, enabled)
    }

    fun setClipboardTimeout(seconds: Int) {
        clipboardTimeoutSeconds = seconds
        SecureStorage.setPlainInt(SecureStorage.Key.CLIPBOARD_TIMEOUT, seconds)
    }

    fun updateColorScheme(scheme: String) {
        colorScheme = scheme
        SecureStorage.setPlainString(SecureStorage.Key.COLOR_SCHEME, scheme)
    }

    // MARK: - Branding

    fun updateBranding(accentColor: String, loginCounts: Boolean) {
        accentHex = accentColor
        loginCountsAsCheckin = loginCounts
    }
}
