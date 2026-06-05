package dev.psvault.app.ui.screens.auth

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import dev.psvault.app.LocalAppViewModel
import dev.psvault.app.api.ApiService
import dev.psvault.app.crypto.CryptoService
import dev.psvault.app.ui.components.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RegisterScreen(onRegistered: () -> Unit, onBack: () -> Unit) {
    val vm = LocalAppViewModel.current
    val scope = rememberCoroutineScope()
    var displayName by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Create Account") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background.copy(alpha = 0f))
            )
        },
        containerColor = MaterialTheme.colorScheme.background.copy(alpha = 0f)
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize()) {
            GradientBackground()
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(padding)
                    .padding(horizontal = 24.dp, vertical = 16.dp)
                    .imePadding(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    "Your data will be zero-knowledge encrypted on this device. Make sure to remember your password.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = 24.dp)
                )

                ErrorBanner(error)
                if (error.isNotEmpty()) Spacer(Modifier.height(12.dp))

                AuthField(value = displayName, onValueChange = { displayName = it; error = "" }, label = "Display Name")
                Spacer(Modifier.height(12.dp))
                AuthField(value = email, onValueChange = { email = it; error = "" }, label = "Email")
                Spacer(Modifier.height(12.dp))
                AuthField(value = password, onValueChange = { password = it; error = "" }, label = "Password", isPassword = true)
                Spacer(Modifier.height(12.dp))
                AuthField(value = confirmPassword, onValueChange = { confirmPassword = it; error = "" }, label = "Confirm Password", isPassword = true)
                Spacer(Modifier.height(24.dp))

                LoadingButton(
                    text = "Create Account",
                    loading = loading,
                    enabled = displayName.isNotBlank() && email.isNotBlank() && password.isNotBlank() && confirmPassword.isNotBlank(),
                    onClick = {
                        if (password != confirmPassword) { error = "Passwords do not match"; return@LoadingButton }
                        if (password.length < 8) { error = "Password must be at least 8 characters"; return@LoadingButton }
                        scope.launch {
                            loading = true; error = ""
                            try {
                                val mek = CryptoService.generateKey()
                                val salt = CryptoService.generateSalt()
                                val saltHex = CryptoService.bytesToHex(salt)
                                val defaultParams = "{\"memory\":65536,\"iterations\":3,\"parallelism\":1,\"key_length\":32}"
                                val kek = CryptoService.deriveKEK(password, saltHex, defaultParams)
                                val mekEnvelope = CryptoService.wrapKey(mek, kek)

                                val resp = ApiService.register(
                                    email = email.trim(),
                                    password = password,
                                    displayName = displayName.trim(),
                                    mekSalt = saltHex,
                                    mekEnvelope = mekEnvelope
                                )
                                val accessToken = resp.accessToken ?: throw Exception("No access token")
                                val refreshToken = resp.refreshToken ?: throw Exception("No refresh token")
                                val user = resp.user ?: throw Exception("No user")

                                vm.saveCryptoParams(saltHex, mekEnvelope, defaultParams)
                                vm.signIn(accessToken, refreshToken, user, mek)
                                onRegistered()
                            } catch (e: Exception) {
                                error = e.message ?: "Registration failed"
                            } finally { loading = false }
                        }
                    }
                )
            }
        }
    }
}
