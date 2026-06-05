package dev.psvault.app.ui.screens.settings

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.navigation.NavController
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import dev.psvault.app.LocalAppViewModel
import dev.psvault.app.api.ApiService
import dev.psvault.app.crypto.CryptoService
import dev.psvault.app.models.TOTPSetupResponse
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
                        Button(onClick = { showMFASetup = true }, modifier = Modifier.fillMaxWidth()) { Text("Set Up MFA") }
                    }
                }
            }
        }
    }

    // MFA setup dialog
    if (showMFASetup) {
        MFASetupDialog(
            onDismiss = { showMFASetup = false },
            onSuccess = {
                vm.user?.let { vm.updateUser(it.copy(mfaEnabled = true)) }
                showMFASetup = false
            }
        )
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

// MARK: - MFA Setup Dialog

private enum class MFASetupStep { Loading, Setup, BackupCodes, Error }

@Composable
private fun MFASetupDialog(onDismiss: () -> Unit, onSuccess: () -> Unit) {
    val scope = rememberCoroutineScope()
    var step by remember { mutableStateOf(MFASetupStep.Loading) }
    var setupData by remember { mutableStateOf<TOTPSetupResponse?>(null) }
    var code by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    var confirming by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        try {
            setupData = ApiService.setupTOTP()
            step = MFASetupStep.Setup
        } catch (e: Exception) {
            error = e.message ?: "Failed to start MFA setup"
            step = MFASetupStep.Error
        }
    }

    Dialog(onDismissRequest = onDismiss) {
        Surface(shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.surface) {
            when (step) {
                MFASetupStep.Loading -> {
                    Box(
                        modifier = Modifier.fillMaxWidth().padding(48.dp),
                        contentAlignment = Alignment.Center
                    ) { CircularProgressIndicator() }
                }

                MFASetupStep.Setup -> {
                    val data = setupData!!
                    val qrBitmap = remember(data.otpUrl) { generateQRBitmap(data.otpUrl, 512) }
                    Column(
                        modifier = Modifier
                            .padding(24.dp)
                            .verticalScroll(rememberScrollState()),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text(
                            "Set Up Two-Factor Authentication",
                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold)
                        )
                        Text(
                            "Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.), then enter the 6-digit code to confirm.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        qrBitmap?.let { bitmap ->
                            Image(
                                bitmap = bitmap.asImageBitmap(),
                                contentDescription = "MFA QR Code",
                                modifier = Modifier.size(180.dp).align(Alignment.CenterHorizontally)
                            )
                        }
                        Surface(
                            color = MaterialTheme.colorScheme.surfaceVariant,
                            shape = MaterialTheme.shapes.small,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(
                                    "Manual entry key",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Text(
                                    data.secret,
                                    style = MaterialTheme.typography.bodySmall,
                                    fontFamily = FontFamily.Monospace
                                )
                            }
                        }
                        if (error.isNotEmpty()) {
                            Text(error, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                        }
                        OutlinedTextField(
                            value = code,
                            onValueChange = { v -> code = v.filter { it.isDigit() }.take(6); error = "" },
                            label = { Text("6-digit code") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                            modifier = Modifier.fillMaxWidth()
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.End
                        ) {
                            TextButton(onClick = onDismiss) { Text("Cancel") }
                            Spacer(Modifier.width(8.dp))
                            Button(
                                onClick = {
                                    scope.launch {
                                        confirming = true; error = ""
                                        try {
                                            ApiService.confirmTOTP(data.secret, code.trim(), data.backupCodes)
                                            step = MFASetupStep.BackupCodes
                                        } catch (e: Exception) {
                                            error = e.message ?: "Invalid code"
                                        } finally { confirming = false }
                                    }
                                },
                                enabled = code.length == 6 && !confirming
                            ) {
                                if (confirming) CircularProgressIndicator(
                                    modifier = Modifier.size(16.dp),
                                    strokeWidth = 2.dp,
                                    color = MaterialTheme.colorScheme.onPrimary
                                )
                                else Text("Verify")
                            }
                        }
                    }
                }

                MFASetupStep.BackupCodes -> {
                    val data = setupData!!
                    Column(
                        modifier = Modifier
                            .padding(24.dp)
                            .verticalScroll(rememberScrollState()),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text(
                            "MFA Enabled",
                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold)
                        )
                        Text(
                            "Save these backup codes somewhere safe. Each can be used once to sign in if you lose your authenticator.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Surface(
                            color = MaterialTheme.colorScheme.surfaceVariant,
                            shape = MaterialTheme.shapes.small,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(
                                modifier = Modifier.padding(12.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                data.backupCodes.forEach { bc ->
                                    Text(bc, style = MaterialTheme.typography.bodyMedium, fontFamily = FontFamily.Monospace)
                                }
                            }
                        }
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                            Button(onClick = onSuccess) { Text("Done") }
                        }
                    }
                }

                MFASetupStep.Error -> {
                    Column(
                        modifier = Modifier.padding(24.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text("Setup Failed", style = MaterialTheme.typography.titleMedium)
                        Text(error, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                            TextButton(onClick = onDismiss) { Text("Close") }
                        }
                    }
                }
            }
        }
    }
}

private fun generateQRBitmap(content: String, size: Int): android.graphics.Bitmap? {
    return try {
        val hints = mapOf(EncodeHintType.MARGIN to 1)
        val bitMatrix = QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, size, size, hints)
        val bitmap = android.graphics.Bitmap.createBitmap(size, size, android.graphics.Bitmap.Config.RGB_565)
        for (x in 0 until size) {
            for (y in 0 until size) {
                bitmap.setPixel(x, y, if (bitMatrix[x, y]) android.graphics.Color.BLACK else android.graphics.Color.WHITE)
            }
        }
        bitmap
    } catch (_: Exception) { null }
}
