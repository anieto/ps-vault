package dev.psvault.app.ui.screens.lock

import android.app.Activity
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.foundation.Image
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import dev.psvault.app.R
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.google.firebase.messaging.FirebaseMessaging
import dev.psvault.app.LocalAppViewModel
import dev.psvault.app.api.ApiService
import dev.psvault.app.crypto.CryptoService
import dev.psvault.app.storage.SecureStorage
import dev.psvault.app.ui.components.ErrorBanner
import dev.psvault.app.ui.components.GradientBackground
import dev.psvault.app.ui.components.LoadingButton
import kotlinx.coroutines.launch

@Composable
fun LockScreen(onUnlocked: () -> Unit, onSignOut: () -> Unit) {
    val vm = LocalAppViewModel.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var showPasswordFallback by remember { mutableStateOf(false) }

    val canUseBiometric = remember {
        vm.biometricEnabled &&
        BiometricManager.from(context)
            .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) ==
            BiometricManager.BIOMETRIC_SUCCESS
    }

    // Attempt biometric unlock
    fun tryBiometric() {
        val activity = context as? FragmentActivity ?: return
        val executor = ContextCompat.getMainExecutor(context)
        val prompt = BiometricPrompt(activity, executor, object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                scope.launch {
                    loading = true
                    try {
                        val refreshToken = SecureStorage.getString(SecureStorage.Key.REFRESH_TOKEN)
                            ?: throw Exception("No session")
                        val resp = ApiService.refreshToken(refreshToken)
                        val accessToken = resp.accessToken ?: throw Exception("No token")
                        val newRefresh = resp.refreshToken ?: refreshToken
                        SecureStorage.setString(SecureStorage.Key.REFRESH_TOKEN, newRefresh)
                        val mek = vm.loadMEKFromStorage()
                        val user = resp.user
                        vm.unlock(accessToken, mek, user)
                        FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
                            scope.launch {
                                try { ApiService.registerPushToken(token, "fcm") }
                                catch (_: Exception) {}
                            }
                        }
                        onUnlocked()
                    } catch (e: Exception) {
                        if (e is ApiException.HttpError && e.statusCode == 401) {
                            vm.signOut()
                            onSignOut()
                        } else {
                            error = "Failed to restore session. Please enter your password."
                            showPasswordFallback = true
                        }
                    } finally { loading = false }
                }
            }
            override fun onAuthenticationError(code: Int, msg: CharSequence) {
                if (code != BiometricPrompt.ERROR_USER_CANCELED && code != BiometricPrompt.ERROR_NEGATIVE_BUTTON) {
                    showPasswordFallback = true
                }
            }
            override fun onAuthenticationFailed() { error = "Biometric not recognised" }
        })
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Unlock P.S. Vault")
            .setSubtitle("Confirm your identity to continue")
            .setNegativeButtonText("Use Password")
            .build()
        prompt.authenticate(info)
    }

    // Trigger biometric on resume only — ensures device keyguard is already dismissed
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME && canUseBiometric && !showPasswordFallback) {
                tryBiometric()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        // Fire immediately if the activity is already resumed (e.g. lock triggered in foreground)
        if (lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED) &&
            canUseBiometric && !showPasswordFallback) {
            tryBiometric()
        }
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        GradientBackground()
        Column(
            modifier = Modifier
                .fillMaxSize()
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
            Spacer(Modifier.height(16.dp))
            Text(
                text = "P.S. Vault is locked",
                style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.SemiBold),
                color = MaterialTheme.colorScheme.onBackground
            )
            vm.user?.let {
                Text(
                    text = it.email,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 4.dp)
                )
            }
            Spacer(Modifier.height(32.dp))

            ErrorBanner(error)
            if (error.isNotEmpty()) Spacer(Modifier.height(12.dp))

            if (canUseBiometric && !showPasswordFallback) {
                LoadingButton(
                    text = "Unlock with Biometrics",
                    loading = loading,
                    onClick = { tryBiometric() }
                )
                Spacer(Modifier.height(12.dp))
                TextButton(onClick = { showPasswordFallback = true }) {
                    Text("Use password instead")
                }
            } else {
                Text(
                    "Enter your password to unlock",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = 16.dp)
                )
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it; error = "" },
                    label = { Text("Password") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(16.dp))
                LoadingButton(
                    text = "Unlock",
                    loading = loading,
                    enabled = password.isNotBlank(),
                    onClick = {
                        scope.launch {
                            loading = true; error = ""
                            try {
                                val mekSalt = vm.storedMekSalt
                                val mekEnvelope = vm.storedMekEnvelope
                                val argon2Params = vm.storedArgon2Params
                                if (mekSalt.isEmpty() || mekEnvelope.isEmpty()) {
                                    throw Exception("Crypto params missing — please sign in again")
                                }
                                val kek = CryptoService.deriveKEK(password, mekSalt, argon2Params)
                                val mek = CryptoService.unwrapMEK(mekEnvelope, kek)

                                val refreshToken = SecureStorage.getString(SecureStorage.Key.REFRESH_TOKEN)
                                    ?: throw Exception("No session")
                                val resp = ApiService.refreshToken(refreshToken)
                                val accessToken = resp.accessToken ?: throw Exception("No token")
                                val newRefresh = resp.refreshToken ?: refreshToken
                                SecureStorage.setString(SecureStorage.Key.REFRESH_TOKEN, newRefresh)
                                SecureStorage.setBytes(SecureStorage.Key.MEK, mek)

                                vm.unlock(accessToken, mek, resp.user)
                                FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
                                    scope.launch {
                                        try { ApiService.registerPushToken(token, "fcm") }
                                        catch (_: Exception) {}
                                    }
                                }
                                onUnlocked()
                            } catch (e: Exception) {
                                when {
                                    e.message?.contains("Decryption") == true -> error = "Incorrect password"
                                    e is ApiException.HttpError && e.statusCode == 401 -> { vm.signOut(); onSignOut() }
                                    else -> error = e.message ?: "Unlock failed"
                                }
                            } finally { loading = false }
                        }
                    }
                )
                if (canUseBiometric) {
                    Spacer(Modifier.height(8.dp))
                    TextButton(onClick = { showPasswordFallback = false; tryBiometric() }) {
                        Text("Use biometrics instead")
                    }
                }
            }

            Spacer(Modifier.height(32.dp))
            TextButton(onClick = {
                vm.signOut()
                onSignOut()
            }) {
                Text("Sign out", color = MaterialTheme.colorScheme.error)
            }
        }
    }
}
