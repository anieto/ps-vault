import Foundation

enum APIError: Error, LocalizedError {
    case noServerURL
    case httpError(Int, String)
    case decodingError(Error)
    case networkError(Error)
    case unauthorized

    var errorDescription: String? {
        switch self {
        case .noServerURL: return "No server URL configured."
        case .httpError(_, let msg): return msg
        case .decodingError(let e): return "Decoding error: \(e)"
        case .networkError(let e): return e.localizedDescription
        case .unauthorized: return "Session expired. Please log in again."
        }
    }
}

@MainActor
final class APIService {
    static let shared = APIService()
    private init() {}

    var baseURL: String = ""
    var accessToken: String? = nil

    private let session = URLSession.shared
    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        return d
    }()

    // MARK: - Core request

    private func buildRequest(_ method: String, path: String, body: (any Encodable)? = nil) throws -> URLRequest {
        guard !baseURL.isEmpty else { throw APIError.noServerURL }
        guard let url = URL(string: "\(baseURL)/api/v1\(path)") else {
            throw APIError.networkError(URLError(.badURL))
        }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.setValue("mobile", forHTTPHeaderField: "X-Client")
        if let token = accessToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONEncoder().encode(body)
        }
        return req
    }

    private func parseEnvelopeError(data: Data, statusCode: Int) -> APIError {
        if let envelope = try? decoder.decode(APIEnvelope<EmptyData>.self, from: data),
           let errorBody = envelope.error {
            if statusCode == 401 && errorBody.code == "unauthorized" && accessToken != nil {
                return .unauthorized
            }
            return .httpError(statusCode, errorBody.code)
        }
        return .httpError(statusCode, HTTPURLResponse.localizedString(forStatusCode: statusCode))
    }

    private func request<T: Decodable>(
        _ method: String,
        path: String,
        body: (any Encodable)? = nil
    ) async throws -> T {
        do {
            let req = try buildRequest(method, path: path, body: body)
            let (data, response) = try await session.data(for: req)
            guard let http = response as? HTTPURLResponse else {
                throw APIError.networkError(URLError(.badServerResponse))
            }
            if !(200...299).contains(http.statusCode) {
                throw parseEnvelopeError(data: data, statusCode: http.statusCode)
            }
            let envelope = try decoder.decode(APIEnvelope<T>.self, from: data)
            if let result = envelope.data { return result }
            if let errorBody = envelope.error { throw APIError.httpError(http.statusCode, errorBody.code) }
            throw APIError.decodingError(DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "No data in envelope")))
        } catch let e as APIError {
            throw e
        } catch let e as DecodingError {
            throw APIError.decodingError(e)
        } catch {
            throw APIError.networkError(error)
        }
    }

    private func requestVoid(
        _ method: String,
        path: String,
        body: (any Encodable)? = nil
    ) async throws {
        do {
            let req = try buildRequest(method, path: path, body: body)
            let (data, response) = try await session.data(for: req)
            guard let http = response as? HTTPURLResponse else {
                throw APIError.networkError(URLError(.badServerResponse))
            }
            if http.statusCode == 204 { return }
            if !(200...299).contains(http.statusCode) {
                throw parseEnvelopeError(data: data, statusCode: http.statusCode)
            }
        } catch let e as APIError {
            throw e
        } catch {
            throw APIError.networkError(error)
        }
    }

    // MARK: - Auth

    func login(email: String, password: String, mfaCode: String? = nil) async throws -> AuthResponse {
        struct Body: Encodable { let email, password: String; let mfa_code: String? }
        return try await request("POST", path: "/auth/login", body: Body(email: email, password: password, mfa_code: mfaCode))
    }

    func register(email: String, password: String, displayName: String, mekSalt: String, mekEnvelope: String) async throws -> AuthResponse {
        struct Body: Encodable { let email, password, display_name, mek_salt, mek_envelope: String }
        return try await request("POST", path: "/auth/register", body: Body(email: email, password: password, display_name: displayName, mek_salt: mekSalt, mek_envelope: mekEnvelope))
    }

    func refreshToken(_ token: String) async throws -> AuthResponse {
        struct Body: Encodable { let refresh_token: String }
        return try await request("POST", path: "/auth/refresh", body: Body(refresh_token: token))
    }

    func logout(refreshToken: String) async throws {
        struct Body: Encodable { let refresh_token: String }
        try await requestVoid("POST", path: "/auth/logout", body: Body(refresh_token: refreshToken))
    }

    func forgotPassword(email: String) async throws {
        struct Body: Encodable { let email: String }
        try await requestVoid("POST", path: "/auth/forgot-password", body: Body(email: email))
    }

    func resetPassword(token: String, password: String) async throws {
        struct Body: Encodable { let token, password: String }
        try await requestVoid("POST", path: "/auth/reset-password", body: Body(token: token, password: password))
    }

    // MARK: - User

    func getMe() async throws -> User {
        return try await request("GET", path: "/users/me")
    }

    func updateMe(displayName: String) async throws -> User {
        struct Body: Encodable { let display_name: String }
        return try await request("PATCH", path: "/users/me", body: Body(display_name: displayName))
    }

    func changeEmail(newEmail: String, currentPassword: String) async throws {
        struct Body: Encodable { let new_email, current_password: String }
        try await requestVoid("POST", path: "/users/me/change-email", body: Body(new_email: newEmail, current_password: currentPassword))
    }

    func changePassword(currentPassword: String, newPassword: String, newMEKEnvelope: String) async throws {
        struct Body: Encodable { let current_password, new_password, new_mek_envelope: String }
        try await requestVoid("POST", path: "/users/me/change-password", body: Body(current_password: currentPassword, new_password: newPassword, new_mek_envelope: newMEKEnvelope))
    }

    func registerPushToken(_ token: String, platform: String) async throws {
        struct Body: Encodable { let token, platform: String }
        try await requestVoid("POST", path: "/users/me/push-token", body: Body(token: token, platform: platform))
    }

    func deletePushToken() async throws {
        try await requestVoid("DELETE", path: "/users/me/push-token")
    }

    // MARK: - Sessions

    func listSessions() async throws -> [Session] {
        return try await request("GET", path: "/users/me/sessions")
    }

    func revokeSession(_ id: String) async throws {
        try await requestVoid("DELETE", path: "/users/me/sessions/\(id)")
    }

    func revokeAllSessions() async throws {
        try await requestVoid("DELETE", path: "/users/me/sessions")
    }

    // MARK: - Vaults

    func listVaults() async throws -> [Vault] {
        return try await request("GET", path: "/vaults")
    }

    func createVault(name: String, icon: String, cekEnvelope: String) async throws -> Vault {
        struct Body: Encodable { let name, icon, cek_envelope: String }
        return try await request("POST", path: "/vaults", body: Body(name: name, icon: icon, cek_envelope: cekEnvelope))
    }

    func updateVault(_ id: String, name: String? = nil, icon: String? = nil) async throws -> Vault {
        struct Body: Encodable { let name: String?; let icon: String? }
        return try await request("PATCH", path: "/vaults/\(id)", body: Body(name: name, icon: icon))
    }

    func deleteVault(_ id: String) async throws {
        try await requestVoid("DELETE", path: "/vaults/\(id)")
    }

    // MARK: - Entries

    func listEntries(vaultId: String) async throws -> [VaultEntry] {
        return try await request("GET", path: "/vaults/\(vaultId)/entries")
    }

    func createEntry(vaultId: String, entryType: String, title: String, encryptedData: String, sortOrder: Int? = nil) async throws -> VaultEntry {
        struct Body: Encodable { let entry_type, title, encrypted_data: String; let sort_order: Int? }
        return try await request("POST", path: "/vaults/\(vaultId)/entries", body: Body(entry_type: entryType, title: title, encrypted_data: encryptedData, sort_order: sortOrder))
    }

    func updateEntry(_ vaultId: String, entryId: String, title: String? = nil, encryptedData: String? = nil, sortOrder: Int? = nil, isFavorite: Bool? = nil) async throws -> VaultEntry {
        struct Body: Encodable { let title: String?; let encrypted_data: String?; let sort_order: Int?; let is_favorite: Bool? }
        return try await request("PATCH", path: "/vaults/\(vaultId)/entries/\(entryId)", body: Body(title: title, encrypted_data: encryptedData, sort_order: sortOrder, is_favorite: isFavorite))
    }

    func deleteEntry(_ vaultId: String, entryId: String) async throws {
        try await requestVoid("DELETE", path: "/vaults/\(vaultId)/entries/\(entryId)")
    }

    // MARK: - Vault Beneficiaries

    func getVaultBeneficiaries(vaultId: String) async throws -> [VaultBeneficiary] {
        return try await request("GET", path: "/vaults/\(vaultId)/beneficiaries")
    }

    func assignBeneficiary(vaultId: String, beneficiaryId: String, cekEnvelope: String) async throws {
        struct Body: Encodable { let beneficiary_id, beneficiary_cek_envelope: String }
        try await requestVoid("POST", path: "/vaults/\(vaultId)/beneficiaries", body: Body(beneficiary_id: beneficiaryId, beneficiary_cek_envelope: cekEnvelope))
    }

    func removeVaultBeneficiary(vaultId: String, beneficiaryId: String) async throws {
        try await requestVoid("DELETE", path: "/vaults/\(vaultId)/beneficiaries/\(beneficiaryId)")
    }

    // MARK: - Beneficiaries

    func listBeneficiaries() async throws -> [Beneficiary] {
        return try await request("GET", path: "/beneficiaries")
    }

    func createBeneficiary(name: String, email: String, relationship: String? = nil, secretQuestion: String? = nil, photoData: String? = nil) async throws -> Beneficiary {
        struct Body: Encodable { let name, email: String; let relationship: String?; let secret_question: String?; let photo_data: String? }
        return try await request("POST", path: "/beneficiaries", body: Body(name: name, email: email, relationship: relationship, secret_question: secretQuestion, photo_data: photoData))
    }

    func updateBeneficiary(_ id: String, name: String? = nil, relationship: String? = nil, secretQuestion: String? = nil, photoData: String? = nil) async throws -> Beneficiary {
        struct Body: Encodable { let name: String?; let relationship: String?; let secret_question: String?; let photo_data: String? }
        return try await request("PATCH", path: "/beneficiaries/\(id)", body: Body(name: name, relationship: relationship, secret_question: secretQuestion, photo_data: photoData))
    }

    func deleteBeneficiary(_ id: String) async throws {
        try await requestVoid("DELETE", path: "/beneficiaries/\(id)")
    }

    func resendBeneficiaryConfirmation(_ id: String) async throws {
        try await requestVoid("POST", path: "/beneficiaries/\(id)/resend")
    }

    // MARK: - Switch

    func getSwitchSettings() async throws -> SwitchSettings {
        return try await request("GET", path: "/switch")
    }

    func updateSwitchSettings(
        isActive: Bool? = nil,
        checkInIntervalDays: Int? = nil,
        abortWindowHours: Int? = nil,
        reminder1DaysBefore: Int? = nil,
        reminder2HoursBefore: Int? = nil,
        finalWarningHoursBefore: Int? = nil,
        preferredCheckinHour: Int? = nil,
        clearPreferredHour: Bool? = nil
    ) async throws -> SwitchSettings {
        struct Body: Encodable {
            let is_active: Bool?
            let check_in_interval_days: Int?
            let abort_window_hours: Int?
            let reminder1_days_before: Int?
            let reminder2_hours_before: Int?
            let final_warning_hours_before: Int?
            let preferred_checkin_hour: Int?
            let clear_preferred_hour: Bool?
        }
        return try await request("PATCH", path: "/switch", body: Body(
            is_active: isActive,
            check_in_interval_days: checkInIntervalDays,
            abort_window_hours: abortWindowHours,
            reminder1_days_before: reminder1DaysBefore,
            reminder2_hours_before: reminder2HoursBefore,
            final_warning_hours_before: finalWarningHoursBefore,
            preferred_checkin_hour: preferredCheckinHour,
            clear_preferred_hour: clearPreferredHour
        ))
    }

    func checkin() async throws -> SwitchSettings {
        return try await request("POST", path: "/switch/checkin")
    }

    func pauseSwitch(resumeAt: Date? = nil) async throws -> SwitchSettings {
        struct Body: Encodable { let resume_at: String? }
        let iso = resumeAt.map { ISO8601DateFormatter().string(from: $0) }
        return try await request("POST", path: "/switch/pause", body: Body(resume_at: iso))
    }

    func resumeSwitch() async throws -> SwitchSettings {
        return try await request("POST", path: "/switch/resume")
    }

    func abortTrigger() async throws -> SwitchSettings {
        return try await request("POST", path: "/switch/abort")
    }

    func revokeDeliveries() async throws {
        try await requestVoid("POST", path: "/switch/revoke-deliveries")
    }

    // MARK: - MFA

    func setupTOTP() async throws -> TOTPSetupResponse {
        return try await request("POST", path: "/auth/mfa/setup")
    }

    func confirmTOTP(secret: String, code: String, backupCodes: [String]) async throws {
        struct Body: Encodable { let secret, code: String; let backup_codes: [String] }
        try await requestVoid("POST", path: "/auth/mfa/verify", body: Body(secret: secret, code: code, backup_codes: backupCodes))
    }

    func disableMFA(code: String) async throws {
        struct Body: Encodable { let code: String }
        try await requestVoid("POST", path: "/auth/mfa/disable", body: Body(code: code))
    }

    // MARK: - Branding

    struct BrandingResponse: Decodable {
        let accentColor: String
        enum CodingKeys: String, CodingKey { case accentColor = "accent_color" }
    }

    func getBranding() async throws -> BrandingResponse {
        return try await request("GET", path: "/branding")
    }

    func updateAccentColor(_ hex: String) async throws {
        try await requestVoid("PATCH", path: "/admin/config", body: ["app_accent_color": hex])
    }
}
