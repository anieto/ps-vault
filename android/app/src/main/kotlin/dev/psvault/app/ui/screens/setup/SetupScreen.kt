package dev.psvault.app.ui.screens.setup

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.foundation.Image
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import dev.psvault.app.LocalAppViewModel
import dev.psvault.app.R
import dev.psvault.app.ui.components.AuthField
import dev.psvault.app.ui.components.ErrorBanner
import dev.psvault.app.ui.components.GradientBackground
import dev.psvault.app.ui.components.LoadingButton
import kotlinx.coroutines.launch

@Composable
fun SetupScreen(onSetupComplete: () -> Unit) {
    val vm = LocalAppViewModel.current
    val scope = rememberCoroutineScope()
    var url by remember { mutableStateOf(vm.getLastServerUrl()) }
    var error by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }

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
                text = "P.S. Vault",
                style = MaterialTheme.typography.headlineLarge.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.onBackground
            )
            Text(
                text = "Enter your server URL to get started",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 8.dp, bottom = 32.dp)
            )

            ErrorBanner(error)
            if (error.isNotEmpty()) Spacer(Modifier.height(12.dp))

            AuthField(
                value = url,
                onValueChange = { url = it; error = "" },
                label = "Server URL (e.g. https://vault.example.com)"
            )
            Spacer(Modifier.height(12.dp))
            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = MaterialTheme.colorScheme.surfaceVariant,
                shape = MaterialTheme.shapes.medium
            ) {
                Text(
                    text = "P.S. Vault requires an HTTPS connection to protect your vault data in transit.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(12.dp)
                )
            }
            Spacer(Modifier.height(16.dp))
            LoadingButton(
                text = "Continue",
                onClick = {
                    val trimmed = url.trim().trimEnd('/')
                    if (trimmed.isEmpty()) { error = "Please enter a server URL."; return@LoadingButton }
                    if (!trimmed.startsWith("https://")) {
                        error = "Server URL must use HTTPS (https://)."; return@LoadingButton
                    }
                    vm.updateServerUrl(trimmed)
                    onSetupComplete()
                },
                loading = loading,
                enabled = url.isNotBlank()
            )
        }
    }
}
