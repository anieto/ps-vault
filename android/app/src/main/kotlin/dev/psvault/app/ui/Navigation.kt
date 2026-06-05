package dev.psvault.app.ui

sealed class Screen(val route: String) {
    object Setup : Screen("setup")
    object Login : Screen("login")
    object Register : Screen("register")
    object ForgotPassword : Screen("forgot_password")
    object Main : Screen("main")
    object VerifyEmail : Screen("verify_email/{token}") {
        fun route(token: String) = "verify_email/$token"
    }
    object ResetPassword : Screen("reset_password/{token}") {
        fun route(token: String) = "reset_password/$token"
    }
}

// Tab routes (used inside MainScreen per-tab NavControllers)
sealed class VaultRoute(val route: String) {
    object List : VaultRoute("vault_list")
    object Detail : VaultRoute("vault_detail/{vaultId}") {
        fun route(vaultId: String) = "vault_detail/$vaultId"
    }
    object EntryDetail : VaultRoute("entry_detail/{vaultId}/{entryId}") {
        fun route(vaultId: String, entryId: String) = "entry_detail/$vaultId/$entryId"
    }
    object NewEntry : VaultRoute("new_entry/{vaultId}") {
        fun route(vaultId: String) = "new_entry/$vaultId"
    }
    object EditEntry : VaultRoute("edit_entry/{vaultId}/{entryId}") {
        fun route(vaultId: String, entryId: String) = "edit_entry/$vaultId/$entryId"
    }
    object BeneficiarySelection : VaultRoute("beneficiary_selection/{vaultId}") {
        fun route(vaultId: String) = "beneficiary_selection/$vaultId"
    }
}

sealed class ContactRoute(val route: String) {
    object List : ContactRoute("contact_list")
    object BeneficiaryDetail : ContactRoute("beneficiary_detail/{beneficiaryId}") {
        fun route(id: String) = "beneficiary_detail/$id"
    }
    object NewBeneficiary : ContactRoute("new_beneficiary")
    object EditBeneficiary : ContactRoute("edit_beneficiary/{beneficiaryId}") {
        fun route(id: String) = "edit_beneficiary/$id"
    }
    object TrustedContactDetail : ContactRoute("trusted_contact_detail/{contactId}") {
        fun route(id: String) = "trusted_contact_detail/$id"
    }
    object NewTrustedContact : ContactRoute("new_trusted_contact")
}

sealed class SettingsRoute(val route: String) {
    object Root : SettingsRoute("settings_root")
    object Server : SettingsRoute("settings_server")
    object Security : SettingsRoute("settings_security")
    object Sessions : SettingsRoute("settings_sessions")
    object Account : SettingsRoute("settings_account")
    object Switch : SettingsRoute("settings_switch")
    object Appearance : SettingsRoute("settings_appearance")
    object Admin : SettingsRoute("settings_admin")
}
