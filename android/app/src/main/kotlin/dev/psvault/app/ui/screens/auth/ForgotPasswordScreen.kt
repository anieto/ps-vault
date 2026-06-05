package dev.psvault.app.ui.screens.auth

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.psvault.app.api.ApiService
import dev.psvault.app.ui.components.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ForgotPasswordScreen(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var email by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var sent by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Reset Password") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } },
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
                    .padding(padding)
                    .padding(24.dp)
                    .imePadding(),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                if (sent) {
                    Text(
                        "Check your email",
                        style = MaterialTheme.typography.headlineMedium,
                        color = MaterialTheme.colorScheme.onBackground
                    )
                    Spacer(Modifier.height(12.dp))
                    Text(
                        "If an account exists for ${email.trim()}, you'll receive a reset link shortly.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(24.dp))
                    Button(onClick = onBack) { Text("Back to Sign In") }
                } else {
                    Text(
                        "Enter your email and we'll send you a link to reset your password.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(bottom = 24.dp)
                    )
                    ErrorBanner(error)
                    if (error.isNotEmpty()) Spacer(Modifier.height(12.dp))
                    AuthField(value = email, onValueChange = { email = it; error = "" }, label = "Email")
                    Spacer(Modifier.height(20.dp))
                    LoadingButton(
                        text = "Send Reset Link",
                        loading = loading,
                        enabled = email.isNotBlank(),
                        onClick = {
                            scope.launch {
                                loading = true; error = ""
                                try {
                                    ApiService.forgotPassword(email.trim())
                                    sent = true
                                } catch (e: Exception) {
                                    error = e.message ?: "Request failed"
                                } finally { loading = false }
                            }
                        }
                    )
                }
            }
        }
    }
}
