package dev.psvault.app.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import dev.psvault.app.api.ApiService
import dev.psvault.app.ui.Screen
import dev.psvault.app.ui.components.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ResetPasswordScreen(token: String, nav: NavController) {
    val scope = rememberCoroutineScope()
    var newPassword by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var done by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Reset Password", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold)) },
                navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        },
        containerColor = Color.Transparent
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize()) {
            GradientBackground()
            if (done) {
                Column(
                    modifier = Modifier.fillMaxSize().padding(padding).padding(32.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Icon(
                        Icons.Default.CheckCircle,
                        contentDescription = null,
                        tint = Color(0xFF4CAF50),
                        modifier = Modifier.size(72.dp)
                    )
                    Spacer(Modifier.height(16.dp))
                    Text(
                        "Password reset",
                        style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.SemiBold),
                        textAlign = TextAlign.Center
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Your password has been updated. You can now sign in.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center
                    )
                    Spacer(Modifier.height(32.dp))
                    Button(onClick = { nav.navigate(Screen.Login.route) { popUpTo(0) { inclusive = true } } }) {
                        Text("Sign In")
                    }
                }
            } else {
                Column(
                    modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp).imePadding(),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    ErrorBanner(error)
                    AuthField(
                        value = newPassword,
                        onValueChange = { newPassword = it; error = "" },
                        label = "New password",
                        isPassword = true
                    )
                    AuthField(
                        value = confirmPassword,
                        onValueChange = { confirmPassword = it; error = "" },
                        label = "Confirm new password",
                        isPassword = true
                    )
                    Text(
                        "Must be at least 12 characters.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    LoadingButton(
                        text = "Reset Password",
                        loading = loading,
                        enabled = newPassword.isNotBlank() && confirmPassword.isNotBlank(),
                        onClick = {
                            if (newPassword != confirmPassword) { error = "Passwords do not match"; return@LoadingButton }
                            if (newPassword.length < 12) { error = "Password must be at least 12 characters"; return@LoadingButton }
                            scope.launch {
                                loading = true; error = ""
                                try {
                                    ApiService.resetPassword(token, newPassword)
                                    done = true
                                } catch (e: Exception) { error = e.message ?: "Reset failed" }
                                finally { loading = false }
                            }
                        }
                    )
                }
            }
        }
    }
}
