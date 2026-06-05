package dev.psvault.app.api

import android.os.Handler
import android.os.Looper
import dev.psvault.app.models.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

sealed class ApiException(message: String) : Exception(message) {
    class NoServerUrl : ApiException("No server URL configured.")
    class HttpError(val statusCode: Int, val errorCode: String) : ApiException(errorCode)
    class NetworkError(cause: Throwable) : ApiException(cause.message ?: "Network error")
    class DecodingError(cause: Throwable) : ApiException("Decoding error: ${cause.message}")
    object Unauthorized : ApiException("Session expired. Please log in again.")
}

object ApiService {

    var baseUrl: String = ""
    var accessToken: String? = null
    var onUnauthorized: (() -> Unit)? = null

    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }
    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()
    private val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()

    // MARK: - Core request

    private fun buildRequest(method: String, path: String, bodyJson: String? = null): Request {
        if (baseUrl.isEmpty()) throw ApiException.NoServerUrl()
        val url = "$baseUrl/api/v1$path"
        val body: RequestBody? = when {
            bodyJson != null -> bodyJson.toRequestBody(JSON_MEDIA)
            method in listOf("POST", "PUT", "PATCH") -> "{}".toRequestBody(JSON_MEDIA)
            else -> null
        }
        return Request.Builder()
            .url(url)
            .method(method, body)
            .header("Accept", "application/json")
            .header("X-Client", "mobile")
            .apply { accessToken?.let { header("Authorization", "Bearer $it") } }
            .build()
    }

    private suspend fun <T> request(path: String, method: String = "GET", bodyJson: String? = null, deserialize: (JsonElement) -> T): T =
        withContext(Dispatchers.IO) {
            val req = buildRequest(method, path, bodyJson)
            val resp = try { client.newCall(req).execute() } catch (e: Exception) { throw ApiException.NetworkError(e) }
            val bodyStr = resp.body?.string() ?: ""
            if (!resp.isSuccessful) {
                val errCode = try {
                    val env = json.parseToJsonElement(bodyStr).jsonObject
                    val err = env["error"]?.jsonObject
                    val code = err?.get("code")?.jsonPrimitive?.content ?: resp.message
                    if (resp.code == 401 && code == "unauthorized" && accessToken != null) {
                        onUnauthorized?.let { Handler(Looper.getMainLooper()).post(it) }
                        throw ApiException.Unauthorized
                    }
                    code
                } catch (e: ApiException) { throw e } catch (e: Exception) { resp.message }
                throw ApiException.HttpError(resp.code, errCode)
            }
            try {
                val env = json.parseToJsonElement(bodyStr).jsonObject
                val data = env["data"] ?: throw ApiException.DecodingError(Exception("No data in envelope"))
                deserialize(data)
            } catch (e: ApiException) { throw e } catch (e: Exception) { throw ApiException.DecodingError(e) }
        }

    private suspend fun requestVoid(path: String, method: String, bodyJson: String? = null) =
        withContext(Dispatchers.IO) {
            val req = buildRequest(method, path, bodyJson)
            val resp = try { client.newCall(req).execute() } catch (e: Exception) { throw ApiException.NetworkError(e) }
            if (resp.code == 204) return@withContext
            if (!resp.isSuccessful) {
                val bodyStr = resp.body?.string() ?: ""
                val errCode = try {
                    val env = json.parseToJsonElement(bodyStr).jsonObject
                    val err = env["error"]?.jsonObject
                    val code = err?.get("code")?.jsonPrimitive?.content ?: resp.message
                    if (resp.code == 401 && code == "unauthorized" && accessToken != null) {
                        onUnauthorized?.let { Handler(Looper.getMainLooper()).post(it) }
                        throw ApiException.Unauthorized
                    }
                    code
                } catch (e: ApiException) { throw e } catch (e: Exception) { resp.message }
                throw ApiException.HttpError(resp.code, errCode)
            }
        }

    private inline fun <reified T> decode(el: JsonElement): T = json.decodeFromJsonElement(el)
    private inline fun <reified T> decodeNullable(el: JsonElement): T? =
        if (el is JsonNull) null else json.decodeFromJsonElement(el)

    // MARK: - Auth

    suspend fun login(email: String, password: String, mfaCode: String? = null): AuthResponse {
        val body = buildJsonObject {
            put("email", email); put("password", password)
            mfaCode?.let { put("mfa_code", it) }
        }
        return request("/auth/login", "POST", body.toString()) { decode(it) }
    }

    suspend fun register(email: String, password: String, displayName: String, mekSalt: String, mekEnvelope: String): AuthResponse {
        val body = buildJsonObject {
            put("email", email); put("password", password); put("display_name", displayName)
            put("mek_salt", mekSalt); put("mek_envelope", mekEnvelope)
        }
        return request("/auth/register", "POST", body.toString()) { decode(it) }
    }

    suspend fun refreshToken(token: String): AuthResponse {
        val body = buildJsonObject { put("refresh_token", token) }
        return request("/auth/refresh", "POST", body.toString()) { decode(it) }
    }

    suspend fun logout(refreshToken: String) {
        val body = buildJsonObject { put("refresh_token", refreshToken) }
        requestVoid("/auth/logout", "POST", body.toString())
    }

    suspend fun forgotPassword(email: String) {
        val body = buildJsonObject { put("email", email) }
        requestVoid("/auth/forgot-password", "POST", body.toString())
    }

    suspend fun resetPassword(token: String, password: String) {
        val body = buildJsonObject { put("token", token); put("password", password) }
        requestVoid("/auth/reset-password", "POST", body.toString())
    }

    // MARK: - User

    suspend fun getMe(): User = request("/users/me") { decode(it) }

    suspend fun deleteAccount() = requestVoid("/users/me", "DELETE")

    suspend fun updateMe(displayName: String): User {
        val body = buildJsonObject { put("display_name", displayName) }
        return request("/users/me", "PATCH", body.toString()) { decode(it) }
    }

    suspend fun changeEmail(newEmail: String, currentPassword: String) {
        val body = buildJsonObject { put("new_email", newEmail); put("current_password", currentPassword) }
        requestVoid("/users/me/change-email", "POST", body.toString())
    }

    suspend fun changePassword(currentPassword: String, newPassword: String, newMekEnvelope: String) {
        val body = buildJsonObject {
            put("current_password", currentPassword); put("new_password", newPassword)
            put("new_mek_envelope", newMekEnvelope)
        }
        requestVoid("/users/me/change-password", "POST", body.toString())
    }

    suspend fun registerPushToken(token: String, platform: String) {
        val body = buildJsonObject { put("token", token); put("platform", platform) }
        requestVoid("/users/me/push-token", "POST", body.toString())
    }

    suspend fun deletePushToken() = requestVoid("/users/me/push-token", "DELETE")

    // MARK: - Sessions

    suspend fun listSessions(): List<Session> = request("/users/me/sessions") { decode(it) }
    suspend fun revokeSession(id: String) = requestVoid("/users/me/sessions/$id", "DELETE")
    suspend fun revokeAllSessions() = requestVoid("/users/me/sessions", "DELETE")

    // MARK: - Vaults

    suspend fun listVaults(): List<Vault> = request("/vaults") { decode(it) }

    suspend fun createVault(name: String, icon: String, cekEnvelope: String): Vault {
        val body = buildJsonObject { put("name", name); put("icon", icon); put("cek_envelope", cekEnvelope) }
        return request("/vaults", "POST", body.toString()) { decode(it) }
    }

    suspend fun updateVault(id: String, name: String? = null, icon: String? = null, accessMode: String? = null, cascadeWindowDays: Int? = null, notifyLockedTiers: Boolean? = null): Vault {
        val body = buildJsonObject {
            name?.let { put("name", it) }; icon?.let { put("icon", it) }
            accessMode?.let { put("access_mode", it) }
            cascadeWindowDays?.let { put("cascade_window_days", it) }
            notifyLockedTiers?.let { put("notify_locked_tiers", it) }
        }
        return request("/vaults/$id", "PATCH", body.toString()) { decode(it) }
    }

    suspend fun deleteVault(id: String) = requestVoid("/vaults/$id", "DELETE")

    // MARK: - Entries

    suspend fun listEntries(vaultId: String): List<VaultEntry> =
        request("/vaults/$vaultId/entries") { decode(it) }

    suspend fun createEntry(vaultId: String, entryType: String, title: String, encryptedData: String, sortOrder: Int? = null): VaultEntry {
        val body = buildJsonObject {
            put("entry_type", entryType); put("title", title); put("encrypted_data", encryptedData)
            sortOrder?.let { put("sort_order", it) }
        }
        return request("/vaults/$vaultId/entries", "POST", body.toString()) { decode(it) }
    }

    suspend fun updateEntry(vaultId: String, entryId: String, title: String? = null, encryptedData: String? = null, sortOrder: Int? = null, isFavorite: Boolean? = null): VaultEntry {
        val body = buildJsonObject {
            title?.let { put("title", it) }; encryptedData?.let { put("encrypted_data", it) }
            sortOrder?.let { put("sort_order", it) }; isFavorite?.let { put("is_favorite", it) }
        }
        return request("/vaults/$vaultId/entries/$entryId", "PATCH", body.toString()) { decode(it) }
    }

    suspend fun deleteEntry(vaultId: String, entryId: String) =
        requestVoid("/vaults/$vaultId/entries/$entryId", "DELETE")

    // MARK: - Vault Beneficiaries

    suspend fun getVaultBeneficiaries(vaultId: String): List<VaultBeneficiary> =
        request("/vaults/$vaultId/beneficiaries") { decode(it) }

    suspend fun assignBeneficiary(vaultId: String, beneficiaryId: String, cekEnvelope: String) {
        val body = buildJsonObject {
            put("beneficiary_id", beneficiaryId); put("beneficiary_cek_envelope", cekEnvelope)
        }
        requestVoid("/vaults/$vaultId/beneficiaries", "POST", body.toString())
    }

    suspend fun removeVaultBeneficiary(vaultId: String, beneficiaryId: String) =
        requestVoid("/vaults/$vaultId/beneficiaries/$beneficiaryId", "DELETE")

    suspend fun setBeneficiaryTier(vaultId: String, beneficiaryId: String, tier: String?) {
        val body = buildJsonObject { put("tier", tier?.let { JsonPrimitive(it) } ?: JsonNull) }
        requestVoid("/vaults/$vaultId/beneficiaries/$beneficiaryId/tier", "PATCH", body.toString())
    }

    // MARK: - Beneficiaries

    suspend fun listBeneficiaries(): List<Beneficiary> = request("/beneficiaries") { decode(it) }

    suspend fun createBeneficiary(name: String, email: String, relationship: String? = null, secretQuestion: String? = null, photoData: String? = null): Beneficiary {
        val body = buildJsonObject {
            put("name", name); put("email", email)
            relationship?.let { put("relationship", it) }
            secretQuestion?.let { put("secret_question", it) }
            photoData?.let { put("photo_data", it) }
        }
        return request("/beneficiaries", "POST", body.toString()) { decode(it) }
    }

    suspend fun updateBeneficiary(id: String, name: String? = null, email: String? = null, relationship: String? = null, secretQuestion: String? = null, photoData: String? = null): Beneficiary {
        val body = buildJsonObject {
            name?.let { put("name", it) }; email?.let { put("email", it) }
            relationship?.let { put("relationship", it) }
            secretQuestion?.let { put("secret_question", it) }
            photoData?.let { put("photo_data", it) }
        }
        return request("/beneficiaries/$id", "PATCH", body.toString()) { decode(it) }
    }

    suspend fun deleteBeneficiary(id: String) = requestVoid("/beneficiaries/$id", "DELETE")

    suspend fun resendBeneficiaryConfirmation(id: String) =
        requestVoid("/beneficiaries/$id/resend", "POST")

    suspend fun getBeneficiaryVaults(id: String): List<BeneficiaryVaultItem> =
        request("/beneficiaries/$id/vaults") { decode(it) }

    // MARK: - Switch

    suspend fun getSwitchSettings(): SwitchSettings = request("/switch") { decode(it) }

    suspend fun updateSwitchSettings(
        isActive: Boolean? = null,
        checkInIntervalDays: Int? = null,
        abortWindowHours: Int? = null,
        reminder1DaysBefore: Int? = null,
        reminder2HoursBefore: Int? = null,
        finalWarningHoursBefore: Int? = null,
        preferredCheckinHour: Int? = null,
        clearPreferredHour: Boolean? = null,
        timezone: String? = null
    ): SwitchSettings {
        val body = buildJsonObject {
            isActive?.let { put("is_active", it) }
            checkInIntervalDays?.let { put("check_in_interval_days", it) }
            abortWindowHours?.let { put("abort_window_hours", it) }
            reminder1DaysBefore?.let { put("reminder1_days_before", it) }
            reminder2HoursBefore?.let { put("reminder2_hours_before", it) }
            finalWarningHoursBefore?.let { put("final_warning_hours_before", it) }
            preferredCheckinHour?.let { put("preferred_checkin_hour", it) }
            clearPreferredHour?.let { put("clear_preferred_hour", it) }
            timezone?.let { put("timezone", it) }
        }
        return request("/switch", "PATCH", body.toString()) { decode(it) }
    }

    suspend fun checkin(): SwitchSettings = request("/switch/checkin", "POST") { decode(it) }

    suspend fun pauseSwitch(resumeAt: String? = null): SwitchSettings {
        val body = buildJsonObject { resumeAt?.let { put("resume_at", it) } }
        return request("/switch/pause", "POST", body.toString()) { decode(it) }
    }

    suspend fun resumeSwitch(): SwitchSettings = request("/switch/resume", "POST") { decode(it) }

    suspend fun abortTrigger(): SwitchSettings = request("/switch/abort", "POST") { decode(it) }

    suspend fun revokeDeliveries() = requestVoid("/switch/revoke-deliveries", "POST")

    // MARK: - Trusted Contacts

    suspend fun listTrustedContacts(): List<TrustedContact> =
        request("/trusted-contacts") { decode(it) }

    suspend fun createTrustedContact(
        name: String, email: String, phone: String? = null,
        notifyOnFinalWarning: Boolean = false, canAbort: Boolean = false,
        canVerifyLife: Boolean = false, canCorroborateDeath: Boolean = false
    ): TrustedContact {
        val body = buildJsonObject {
            put("name", name); put("email", email); phone?.let { put("phone", it) }
            put("notify_on_final_warning", notifyOnFinalWarning); put("can_abort", canAbort)
            put("can_verify_life", canVerifyLife); put("can_corroborate_death", canCorroborateDeath)
        }
        return request("/trusted-contacts", "POST", body.toString()) { decode(it) }
    }

    suspend fun updateTrustedContact(
        id: String, name: String? = null, phone: String? = null,
        notifyOnFinalWarning: Boolean? = null, canAbort: Boolean? = null,
        canVerifyLife: Boolean? = null, canCorroborateDeath: Boolean? = null
    ): TrustedContact {
        val body = buildJsonObject {
            name?.let { put("name", it) }; phone?.let { put("phone", it) }
            notifyOnFinalWarning?.let { put("notify_on_final_warning", it) }
            canAbort?.let { put("can_abort", it) }
            canVerifyLife?.let { put("can_verify_life", it) }
            canCorroborateDeath?.let { put("can_corroborate_death", it) }
        }
        return request("/trusted-contacts/$id", "PATCH", body.toString()) { decode(it) }
    }

    suspend fun deleteTrustedContact(id: String) = requestVoid("/trusted-contacts/$id", "DELETE")

    // MARK: - MFA

    suspend fun setupTOTP(): TOTPSetupResponse = request("/auth/mfa/setup", "POST") { decode(it) }

    suspend fun confirmTOTP(secret: String, code: String, backupCodes: List<String>) {
        val body = buildJsonObject {
            put("secret", secret); put("code", code)
            putJsonArray("backup_codes") { backupCodes.forEach { add(it) } }
        }
        requestVoid("/auth/mfa/verify", "POST", body.toString())
    }

    suspend fun disableMFA(code: String) {
        val body = buildJsonObject { put("code", code) }
        requestVoid("/auth/mfa/disable", "POST", body.toString())
    }

    // MARK: - Branding

    suspend fun getBranding(): BrandingResponse = request("/branding") { decode(it) }

    suspend fun updateAccentColor(hex: String) {
        val body = buildJsonObject { put("app_accent_color", hex) }
        requestVoid("/admin/config", "PATCH", body.toString())
    }

    suspend fun getAdminConfig(): Map<String, String> =
        request("/admin/config") { decode(it) }

    suspend fun submitAccessRequest(name: String, email: String, message: String) {
        val body = buildJsonObject { put("name", name); put("email", email); put("message", message) }
        requestVoid("/access-request", "POST", body.toString())
    }

    // MARK: - Death Report

    suspend fun getActiveDeathReport(): DeathReport? =
        withContext(Dispatchers.IO) {
            val req = buildRequest("GET", "/report/active")
            val resp = try { client.newCall(req).execute() } catch (e: Exception) { throw ApiException.NetworkError(e) }
            val bodyStr = resp.body?.string() ?: ""
            if (!resp.isSuccessful) return@withContext null
            try {
                val env = json.parseToJsonElement(bodyStr).jsonObject
                val data = env["data"] ?: return@withContext null
                if (data is JsonNull) return@withContext null
                json.decodeFromJsonElement<DeathReport>(data)
            } catch (e: Exception) { null }
        }
}
