package dev.psvault.app.ui.screens.settings

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import dev.psvault.app.LocalAppViewModel
import dev.psvault.app.api.ApiService
import dev.psvault.app.crypto.CryptoService
import dev.psvault.app.ui.components.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AccountSettingsScreen(nav: NavController) {
    val vm = LocalAppViewModel.current
    val scope = rememberCoroutineScope()

    // Display name
    var displayName by remember { mutableStateOf(vm.user?.displayName ?: "") }
    var savingName by remember { mutableStateOf(false) }
    var nameSaved by remember { mutableStateOf(false) }

    // Change email
    var newEmail by remember { mutableStateOf("") }
    var emailPassword by remember { mutableStateOf("") }
    var savingEmail by remember { mutableStateOf(false) }
    var emailSaved by remember { mutableStateOf(false) }

    // Change password
    var currentPassword by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    var confirmNewPassword by remember { mutableStateOf("") }
    var savingPassword by remember { mutableStateOf(false) }
    var passwordSaved by remember { mutableStateOf(false) }

    var error by remember { mutableStateOf("") }

    // MFA
    var showMFASetup by remember { mutableStateOf(false) }
    var showMFADisable by remember { mutableStateOf(false) }
    var mfaCode by remember { mutableStateOf("") }
    var mfaLoading by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Account", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold)) },
                navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        },
        containerColor = Color.Transparent
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize()) {
            GradientBackground()
            Column(
                modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                    .padding(padding).padding(16.dp).imePadding(),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                ErrorBanner(error)

                // Display name
                SectionHeader("Display Name")
                VaultCard {
                    AuthField(value = displayName, onValueChange = { displayName = it; nameSaved = false }, label = "Display name")
                    Spacer(Modifier.height(8.dp))
                    if (nameSaved) Text("Saved", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                    LoadingButton(
                        text = "Update Name",
                        loading = savingName,
                        enabled = displayName.isNotBlank() && displayName != (vm.user?.displayName ?: ""),
                        onClick = {
                            scope.launch {
                                savingName = true; error = ""
                                try {
                                    val user = ApiService.updateMe(displayName.trim())
                                    vm.updateUser(user); nameSaved = true
                                } catch (e: Exception) { error = e.message ?: "Update failed" }
                                finally { savingName = false }
                            }
                        }
                    )
                }

                // Change email
                SectionHeader("Change Email")
                VaultCard {
                    AuthField(value = newEmail, onValueChange = { newEmail = it; emailSaved = false }, label = "New email address")
                    Spacer(Modifier.height(8.dp))
                    AuthField(value = emailPassword, onValueChange = { emailPassword = it; emailSaved = false }, label = "Current password", isPassword = true)
                    Spacer(Modifier.height(8.dp))
                    if (emailSaved) Text("Email change requested — check both inboxes", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                    LoadingButton(
                        text = "Update Email",
                        loading = savingEmail,
                        enabled = newEmail.isNotBlank() && emailPassword.isNotBlank(),
                        onClick = {
                            scope.launch {
                                savingEmail = true; error = ""
                                try {
                                    ApiService.changeEmail(newEmail.trim(), emailPassword)
                                    emailSaved = true; newEmail = ""; emailPassword = ""
                                } catch (e: Exception) { error = e.message ?: "Update failed" }
                                finally { savingEmail = false }
                            }
                        }
                    )
                }

                // Change password
                SectionHeader("Change Password")
                VaultCard {
                    AuthField(value = currentPassword, onValueChange = { currentPassword = it; passwordSaved = false }, label = "Current password", isPassword = true)
                    Spacer(Modifier.height(8.dp))
                    AuthField(value = newPassword, onValueChange = { newPassword = it; passwordSaved = false }, label = "New password", isPassword = true)
                    Spacer(Modifier.height(8.dp))
                    AuthField(value = confirmNewPassword, onValueChange = { confirmNewPassword = it; passwordSaved = false }, label = "Confirm new password", isPassword = true)
                    Spacer(Modifier.height(8.dp))
                    if (passwordSaved) Text("Password changed", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                    LoadingButton(
                        text = "Change Password",
                        loading = savingPassword,
                        enabled = currentPassword.isNotBlank() && newPassword.isNotBlank() && confirmNewPassword.isNotBlank(),
                        onClick = {
                            if (newPassword != confirmNewPassword) { error = "Passwords do not match"; return@LoadingButton }
                            if (newPassword.length < 8) { error = "Password must be at least 8 characters"; return@LoadingButton }
                            scope.launch {
                                savingPassword = true; error = ""
                                try {
                                    // Re-wrap MEK with new password
                                    val mekSalt = vm.storedMekSalt
                                    val mekEnvelope = vm.storedMekEnvelope
                                    val argon2Params = vm.storedArgon2Params
                                    val kek = CryptoService.deriveKEK(currentPassword, mekSalt, argon2Params)
                                    val mek = CryptoService.unwrapMEK(mekEnvelope, kek)
                                    val newKek = CryptoService.deriveKEK(newPassword, mekSalt, argon2Params)
                                    val newMekEnvelope = CryptoService.wrapKey(mek, newKek)
                                    ApiService.changePassword(currentPassword, newPassword, newMekEnvelope)
                                    vm.saveCryptoParams(mekSalt, newMekEnvelope, argon2Params)
                                    passwordSaved = true; currentPassword = ""; newPassword = ""; confirmNewPassword = ""
                                } catch (e: Exception) { error = e.message ?: "Update failed" }
                                finally { savingPassword = false }
                            }
                        }
                    )
                }

                // MFA
                SectionHeader("Two-Factor Authentication")
                VaultCard {
                    val mfaEnabled = vm.user?.mfaEnabled ?: false
                    Text(if (mfaEnabled) "TOTP MFA is enabled" else "TOTP MFA is not enabled", style = MaterialTheme.typography.bodyMedium)
                    Spacer(Modifier.height(8.dp))
                    if (mfaEnabled) {
                        OutlinedButton(
                            onClick = { showMFADisable = true },
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                            modifier = Modifier.fillMaxWidth()
                        ) { Text("Disable MFA") }
                    } else {
                        Button(onClick = { showMFASetup = true }, modifier = Modifier.fillMaxWidth()) { Text("Enable MFA") }
                    }
                }
            }
        }
    }

    // MFA disable dialog
    if (showMFADisable) {
        AlertDialog(
            onDismissRequest = { showMFADisable = false },
            title = { Text("Disable MFA") },
            text = {
                Column {
                    Text("Enter your current MFA code to disable two-factor authentication.")
                    Spacer(Modifier.height(8.dp))
                    AuthField(value = mfaCode, onValueChange = { mfaCode = it }, label = "MFA Code")
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    scope.launch {
                        mfaLoading = true
                        try {
                            ApiService.disableMFA(mfaCode.trim())
                            vm.user?.let { vm.updateUser(it.copy(mfaEnabled = false)) }
                            showMFADisable = false; mfaCode = ""
                        } catch (e: Exception) { error = e.message ?: "Failed" }
                        finally { mfaLoading = false }
                    }
                }, colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)) {
                    if (mfaLoading) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp) else Text("Disable")
                }
            },
            dismissButton = { TextButton(onClick = { showMFADisable = false; mfaCode = "" }) { Text("Cancel") } }
        )
    }
}
