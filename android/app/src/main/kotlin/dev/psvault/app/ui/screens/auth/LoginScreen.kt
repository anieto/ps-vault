package dev.psvault.app.ui.screens.auth

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.foundation.Image
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.google.firebase.messaging.FirebaseMessaging
import dev.psvault.app.LocalAppViewModel
import dev.psvault.app.R
import dev.psvault.app.api.ApiException
import dev.psvault.app.api.ApiService
import dev.psvault.app.crypto.CryptoService
import dev.psvault.app.ui.components.*
import kotlinx.coroutines.launch

@Composable
fun LoginScreen(
    onLoginSuccess: () -> Unit,
    onNavigateToRegister: () -> Unit,
    onNavigateToForgotPassword: () -> Unit
) {
    val vm = LocalAppViewModel.current
    val scope = rememberCoroutineScope()
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var mfaCode by remember { mutableStateOf("") }
    var showMfa by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }

    Box(modifier = Modifier.fillMaxSize()) {
        GradientBackground()
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(24.dp)
                .imePadding(),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Image(
                painter = painterResource(R.drawable.app_logo),
                contentDescription = "P.S. Vault",
                modifier = Modifier.size(100.dp)
            )
            Spacer(Modifier.height(12.dp))
            Text(
                text = "Welcome back",
                style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.onBackground
            )
            Text(
                text = vm.serverUrl,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 4.dp, bottom = 28.dp)
            )

            ErrorBanner(error)
            if (error.isNotEmpty()) Spacer(Modifier.height(12.dp))

            if (!showMfa) {
                AuthField(value = email, onValueChange = { email = it; error = "" }, label = "Email")
                Spacer(Modifier.height(12.dp))
                AuthField(value = password, onValueChange = { password = it; error = "" }, label = "Password", isPassword = true)
            } else {
                Text(
                    "Enter your 6-digit authenticator code",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = 12.dp)
                )
                AuthField(value = mfaCode, onValueChange = { mfaCode = it; error = "" }, label = "MFA Code")
            }

            Spacer(Modifier.height(20.dp))
            LoadingButton(
                text = if (showMfa) "Verify" else "Sign In",
                loading = loading,
                enabled = if (showMfa) mfaCode.isNotBlank() else email.isNotBlank() && password.isNotBlank(),
                onClick = {
                    scope.launch {
                        loading = true; error = ""
                        try {
                            val resp = ApiService.login(
                                email = email.trim(),
                                password = password,
                                mfaCode = if (showMfa) mfaCode.trim() else null
                            )
                            val accessToken = resp.accessToken ?: throw Exception("No access token")
                            val refreshToken = resp.refreshToken ?: throw Exception("No refresh token")
                            val user = resp.user ?: throw Exception("No user")

                            // Derive MEK if crypto params present
                            var mek: ByteArray? = null
                            if (resp.mekSalt != null && resp.mekEnvelope != null) {
                                val params = resp.argon2Params ?: CryptoService.run {
                                    "{\"memory\":65536,\"iterations\":3,\"parallelism\":1,\"key_length\":32}"
                                }
                                val kek = CryptoService.deriveKEK(password, resp.mekSalt, params)
                                mek = CryptoService.unwrapMEK(resp.mekEnvelope, kek)
                                vm.saveCryptoParams(resp.mekSalt, resp.mekEnvelope, params)
                            }

                            vm.signIn(accessToken, refreshToken, user, mek)

                            // Register FCM push token
                            FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
                                scope.launch {
                                    try { ApiService.registerPushToken(token, "fcm") }
                                    catch (_: Exception) {}
                                }
                            }

                            // Fetch branding
                            try {
                                val branding = ApiService.getBranding()
                                vm.updateBranding(
                                    accentColor = branding.accentColor,
                                    loginCounts = branding.loginCountsAsCheckin != "false"
                                )
                            } catch (_: Exception) {}

                            onLoginSuccess()
                        } catch (e: ApiException.HttpError) {
                            if (e.errorCode == "mfa_required") { showMfa = true }
                            else error = e.errorCode.replace("_", " ")
                                .replaceFirstChar { it.uppercaseChar() }
                        } catch (e: ApiException.Unauthorized) {
                            error = "Session expired. Please sign in again."
                        } catch (e: Exception) {
                            error = e.message ?: "Sign in failed"
                        } finally { loading = false }
                    }
                }
            )

            if (!showMfa) {
                Spacer(Modifier.height(16.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    TextButton(onClick = onNavigateToForgotPassword) {
                        Text("Forgot password?", style = MaterialTheme.typography.bodySmall)
                    }
                    TextButton(onClick = onNavigateToRegister) {
                        Text("Create account", style = MaterialTheme.typography.bodySmall)
                    }
                }
            } else {
                TextButton(onClick = { showMfa = false; mfaCode = "" }) {
                    Text("Back")
                }
            }

            Spacer(Modifier.height(12.dp))
            TextButton(
                onClick = { vm.updateServerUrl("") }
            ) {
                Text("Change server", style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
