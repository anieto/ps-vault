import Foundation

// MARK: - User

struct User: Decodable, Identifiable {
    let id: String
    let email: String
    let displayName: String
    let role: String
    let mfaEnabled: Bool
    let emailVerified: Bool
    let hasRecoveryKey: Bool
    let timezone: String
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, email, role, timezone
        case displayName = "display_name"
        case mfaEnabled = "mfa_enabled"
        case emailVerified = "email_verified"
        case hasRecoveryKey = "has_recovery_key"
        case createdAt = "created_at"
    }
}

// MARK: - Vault

struct Vault: Decodable, Identifiable {
    let id: String
    let name: String
    let icon: String
    let createdAt: String
    let cekEnvelope: String

    enum CodingKeys: String, CodingKey {
        case id, name, icon
        case createdAt = "created_at"
        case cekEnvelope = "cek_envelope"
    }
}

// MARK: - Entry

struct VaultEntry: Decodable, Identifiable {
    let id: String
    let vaultId: String
    let entryType: String
    let title: String
    var sortOrder: Int
    var isFavorite: Bool
    let encryptedData: String
    let createdAt: String
    let updatedAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case vaultId = "vault_id"
        case entryType = "entry_type"
        case title
        case sortOrder = "sort_order"
        case isFavorite = "is_favorite"
        case encryptedData = "encrypted_data"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

struct EntryField: Codable, Identifiable {
    var id: String { label }
    var label: String
    var value: String
    var sensitive: Bool

    init(label: String, value: String, sensitive: Bool = false) {
        self.label = label
        self.value = value
        self.sensitive = sensitive
    }
}

struct EntryData: Codable {
    var title: String
    var fields: [EntryField]
    var notes: String?
    var isFavorite: Bool

    enum CodingKeys: String, CodingKey {
        case title, fields, notes
        case isFavorite = "is_favorite"
    }
}

// MARK: - Beneficiary

struct Beneficiary: Decodable, Identifiable {
    let id: String
    let name: String
    let email: String
    let relationship: String?
    let secretQuestion: String?
    let photoData: String?
    let emailConfirmed: Bool
    let publicKey: String?
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, name, email
        case relationship
        case secretQuestion = "secret_question"
        case photoData = "photo_data"
        case emailConfirmed = "email_confirmed"
        case publicKey = "public_key"
        case createdAt = "created_at"
    }
}

struct VaultBeneficiary: Decodable, Identifiable {
    let id: String
    let vaultId: String
    let beneficiaryId: String
    let additionalDelayDays: Int
    let createdAt: String
    let beneficiaryName: String
    let beneficiaryEmail: String
    let emailConfirmed: Bool
    let beneficiaryPhotoData: String?

    enum CodingKeys: String, CodingKey {
        case id
        case vaultId = "vault_id"
        case beneficiaryId = "beneficiary_id"
        case additionalDelayDays = "additional_delay_days"
        case createdAt = "created_at"
        case beneficiaryName = "beneficiary_name"
        case beneficiaryEmail = "beneficiary_email"
        case emailConfirmed = "email_confirmed"
        case beneficiaryPhotoData = "beneficiary_photo_data"
    }
}

// MARK: - Switch

struct SwitchSettings: Decodable {
    let isActive: Bool
    let status: String
    let checkInIntervalDays: Int
    let abortWindowHours: Int
    let reminder1DaysBefore: Int
    let reminder2HoursBefore: Int
    let finalWarningHoursBefore: Int
    let preferredCheckinHour: Int?
    let nextCheckinDeadline: String?
    let lastCheckinAt: String?
    let pausedUntil: String?
    let abortDeadline: String?

    enum CodingKeys: String, CodingKey {
        case status
        case isActive = "is_active"
        case checkInIntervalDays = "check_in_interval_days"
        case abortWindowHours = "abort_window_hours"
        case reminder1DaysBefore = "reminder1_days_before"
        case reminder2HoursBefore = "reminder2_hours_before"
        case finalWarningHoursBefore = "final_warning_hours_before"
        case preferredCheckinHour = "preferred_checkin_hour"
        case nextCheckinDeadline = "next_checkin_deadline"
        case lastCheckinAt = "last_checkin_at"
        case pausedUntil = "paused_until"
        case abortDeadline = "abort_deadline"
    }
}

// MARK: - Session

struct Session: Decodable, Identifiable {
    let id: String
    let deviceInfo: String
    let ipAddress: String
    let expiresAt: String
    let createdAt: String
    let lastUsedAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case deviceInfo = "device_info"
        case ipAddress = "ip_address"
        case expiresAt = "expires_at"
        case createdAt = "created_at"
        case lastUsedAt = "last_used_at"
    }
}

// MARK: - Auth responses

struct AuthResponse: Decodable {
    let accessToken: String?
    let refreshToken: String?
    let user: User?
    let mekSalt: String?
    let mekEnvelope: String?
    let argon2Params: String?

    enum CodingKeys: String, CodingKey {
        case user
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case mekSalt = "mek_salt"
        case mekEnvelope = "mek_envelope"
        case argon2Params = "argon2_params"
    }
}

struct TOTPSetupResponse: Decodable {
    let secret: String
    let otpURL: String
    let backupCodes: [String]

    enum CodingKeys: String, CodingKey {
        case secret
        case otpURL = "otp_url"
        case backupCodes = "backup_codes"
    }
}

// All API responses are wrapped in {"data": ..., "error": ...}
struct APIEnvelope<T: Decodable>: Decodable {
    let data: T?
    let error: APIErrorBody?
}

struct APIErrorBody: Decodable {
    let code: String
    let message: String
}

// For void responses that still return the envelope with null data
struct EmptyData: Decodable {}
