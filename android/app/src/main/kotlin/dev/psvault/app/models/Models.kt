package dev.psvault.app.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*

// MARK: - User

@Serializable
data class User(
    val id: String,
    val email: String,
    @SerialName("display_name") val displayName: String,
    val role: String,
    @SerialName("mfa_enabled") val mfaEnabled: Boolean,
    @SerialName("email_verified") val emailVerified: Boolean,
    @SerialName("has_recovery_key") val hasRecoveryKey: Boolean,
    val timezone: String,
    @SerialName("created_at") val createdAt: String
)

// MARK: - Vault

@Serializable
data class Vault(
    val id: String,
    val name: String,
    val icon: String,
    @SerialName("created_at") val createdAt: String,
    @SerialName("cek_envelope") val cekEnvelope: String,
    @SerialName("access_mode") val accessMode: String,
    @SerialName("cascade_window_days") val cascadeWindowDays: Int,
    @SerialName("notify_locked_tiers") val notifyLockedTiers: Boolean
)

// MARK: - Entry

@Serializable
data class VaultEntry(
    val id: String,
    @SerialName("vault_id") val vaultId: String,
    @SerialName("entry_type") val entryType: String,
    val title: String,
    @SerialName("sort_order") var sortOrder: Int,
    @SerialName("is_favorite") var isFavorite: Boolean,
    @SerialName("encrypted_data") val encryptedData: String,
    @SerialName("created_at") val createdAt: String,
    @SerialName("updated_at") val updatedAt: String
)

@Serializable
data class EntryField(
    val label: String,
    val value: String,
    val sensitive: Boolean = false
)

data class EntryData(
    val title: String,
    val fields: List<EntryField>,
    val notes: String? = null,
    val isFavorite: Boolean = false
) {
    fun toJson(): String {
        val json = buildJsonObject {
            put("title", title)
            putJsonArray("fields") {
                fields.forEach { f ->
                    addJsonObject {
                        put("label", f.label)
                        put("value", f.value)
                        put("sensitive", f.sensitive)
                    }
                }
            }
            notes?.let { put("notes", it) }
            put("is_favorite", isFavorite)
        }
        return json.toString()
    }

    companion object {
        private val jsonParser = Json { ignoreUnknownKeys = true; coerceInputValues = true }

        private val sensitiveKeys = setOf(
            "password", "pin", "online_password", "seed_phrase", "cvv", "private_key", "secret"
        )
        private val webLabelMap = mapOf(
            "relationship" to "Relationship / Role", "phone" to "Phone number",
            "email" to "Email", "address" to "Address", "notes" to "Notes",
            "username" to "Username / Email", "password" to "Password", "url" to "Website URL",
            "content" to "Content", "institution" to "Institution",
            "account_number" to "Account number", "account_type" to "Account type",
            "routing_number" to "Routing number",
            "online_username" to "Online username / email", "online_password" to "Online password",
            "cardholder_name" to "Cardholder name", "card_number" to "Card number",
            "expiration" to "Expiration date", "cvv" to "CVV", "pin" to "PIN",
            "bank" to "Issuing bank", "card_type" to "Card type",
            "doc_type" to "Document type", "doc_number" to "Document number",
            "issuing_country" to "Issuing country / state",
            "issue_date" to "Issue date", "expiry_date" to "Expiry date",
            "wallet_name" to "Wallet / Exchange", "seed_phrase" to "Seed phrase",
            "category" to "Category", "details" to "Details"
        )

        fun fromJsonString(jsonStr: String): EntryData {
            val obj = jsonParser.parseToJsonElement(jsonStr).jsonObject
            return if ("fields" in obj) {
                // Structured iOS/Android format
                val title = obj["title"]?.jsonPrimitive?.content ?: ""
                val notes = obj["notes"]?.jsonPrimitive?.contentOrNull
                val isFavorite = obj["is_favorite"]?.jsonPrimitive?.booleanOrNull ?: false
                val fields = obj["fields"]?.jsonArray?.map { el ->
                    val f = el.jsonObject
                    EntryField(
                        label = f["label"]?.jsonPrimitive?.content ?: "",
                        value = f["value"]?.jsonPrimitive?.content ?: "",
                        sensitive = f["sensitive"]?.jsonPrimitive?.booleanOrNull ?: false
                    )
                } ?: emptyList()
                EntryData(title = title, fields = fields, notes = notes, isFavorite = isFavorite)
            } else {
                // Legacy web flat format
                val skip = setOf("type", "title", "is_favorite")
                val title = obj["title"]?.jsonPrimitive?.content ?: ""
                val isFavorite = obj["is_favorite"]?.jsonPrimitive?.booleanOrNull ?: false
                val fields = obj.entries
                    .filter { it.key !in skip }
                    .mapNotNull { (key, value) ->
                        val str = value.jsonPrimitive.contentOrNull ?: return@mapNotNull null
                        val isSensitive = sensitiveKeys.any { key == it || key.contains(it) }
                        EntryField(
                            label = webLabelMap[key] ?: key.replace("_", " ")
                                .split(" ").joinToString(" ") { w ->
                                    w.replaceFirstChar { it.uppercaseChar() }
                                },
                            value = str,
                            sensitive = isSensitive
                        )
                    }
                EntryData(title = title, fields = fields, notes = null, isFavorite = isFavorite)
            }
        }
    }
}

// MARK: - Beneficiary

@Serializable
data class BeneficiaryVaultItem(
    val id: String,
    val name: String,
    val icon: String,
    val tier: String?
)

@Serializable
data class Beneficiary(
    val id: String,
    val name: String,
    val email: String,
    val relationship: String? = null,
    @SerialName("secret_question") val secretQuestion: String? = null,
    @SerialName("photo_data") val photoData: String? = null,
    @SerialName("email_confirmed") val emailConfirmed: Boolean,
    @SerialName("public_key") val publicKey: String? = null,
    @SerialName("created_at") val createdAt: String
)

@Serializable
data class VaultBeneficiary(
    val id: String,
    @SerialName("vault_id") val vaultId: String,
    @SerialName("beneficiary_id") val beneficiaryId: String,
    @SerialName("additional_delay_days") val additionalDelayDays: Int,
    @SerialName("created_at") val createdAt: String,
    @SerialName("beneficiary_name") val beneficiaryName: String,
    @SerialName("beneficiary_email") val beneficiaryEmail: String,
    @SerialName("email_confirmed") val emailConfirmed: Boolean,
    @SerialName("beneficiary_photo_data") val beneficiaryPhotoData: String? = null,
    val tier: String? = null,
    @SerialName("tier_unlocked_at") val tierUnlockedAt: String? = null
)

// MARK: - Trusted Contact

@Serializable
data class TrustedContact(
    val id: String,
    val name: String,
    val email: String,
    val phone: String? = null,
    @SerialName("photo_data") val photoData: String? = null,
    @SerialName("notify_on_final_warning") val notifyOnFinalWarning: Boolean,
    @SerialName("can_abort") val canAbort: Boolean,
    @SerialName("can_verify_life") val canVerifyLife: Boolean,
    @SerialName("can_corroborate_death") val canCorroborateDeath: Boolean,
    @SerialName("created_at") val createdAt: String
)

// MARK: - Switch

@Serializable
data class SwitchSettings(
    @SerialName("is_active") val isActive: Boolean,
    val status: String,
    @SerialName("check_in_interval_days") val checkInIntervalDays: Int,
    @SerialName("abort_window_hours") val abortWindowHours: Int,
    @SerialName("reminder1_days_before") val reminder1DaysBefore: Int,
    @SerialName("reminder2_hours_before") val reminder2HoursBefore: Int,
    @SerialName("final_warning_hours_before") val finalWarningHoursBefore: Int,
    @SerialName("preferred_checkin_hour") val preferredCheckinHour: Int? = null,
    @SerialName("next_checkin_deadline") val nextCheckinDeadline: String? = null,
    @SerialName("last_checkin_at") val lastCheckinAt: String? = null,
    @SerialName("paused_until") val pausedUntil: String? = null,
    @SerialName("abort_deadline") val abortDeadline: String? = null
)

// MARK: - Session

@Serializable
data class Session(
    val id: String,
    @SerialName("device_info") val deviceInfo: String,
    @SerialName("ip_address") val ipAddress: String,
    @SerialName("expires_at") val expiresAt: String,
    @SerialName("created_at") val createdAt: String,
    @SerialName("last_used_at") val lastUsedAt: String
)

// MARK: - Auth

@Serializable
data class AuthResponse(
    @SerialName("access_token") val accessToken: String? = null,
    @SerialName("refresh_token") val refreshToken: String? = null,
    val user: User? = null,
    @SerialName("mek_salt") val mekSalt: String? = null,
    @SerialName("mek_envelope") val mekEnvelope: String? = null,
    @SerialName("argon2_params") val argon2Params: String? = null
)

@Serializable
data class TOTPSetupResponse(
    val secret: String,
    @SerialName("otp_url") val otpUrl: String,
    @SerialName("backup_codes") val backupCodes: List<String>
)

// MARK: - Death Report

@Serializable
data class DeathReport(
    val id: String,
    @SerialName("reporter_email") val reporterEmail: String,
    @SerialName("reporter_name") val reporterName: String,
    val status: String,
    @SerialName("response_deadline") val responseDeadline: String,
    @SerialName("created_at") val createdAt: String
)

// MARK: - API envelope

@Serializable
data class ApiEnvelope<T>(
    val data: T? = null,
    val error: ApiErrorBody? = null
)

@Serializable
data class ApiErrorBody(
    val code: String,
    val message: String
)

@Serializable
data class BrandingResponse(
    @SerialName("accent_color") val accentColor: String,
    @SerialName("login_counts_as_checkin") val loginCountsAsCheckin: String,
    @SerialName("registration_mode") val registrationMode: String
)
