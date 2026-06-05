package dev.psvault.app.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Error
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
import dev.psvault.app.ui.components.GradientBackground

private enum class CheckinState { Idle, Loading, Done, Error }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CheckinConfirmScreen(nav: NavController) {
    var state by remember { mutableStateOf(CheckinState.Loading) }
    var errorMessage by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        try {
            ApiService.checkin()
            state = CheckinState.Done
        } catch (e: Exception) {
            errorMessage = e.message ?: "Check-in failed"
            state = CheckinState.Error
        }
    }

    Scaffold(containerColor = Color.Transparent) { padding ->
        Box(modifier = Modifier.fillMaxSize()) {
            GradientBackground()
            Column(
                modifier = Modifier.fillMaxSize().padding(padding).padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                when (state) {
                    CheckinState.Loading -> {
                        CircularProgressIndicator()
                        Spacer(Modifier.height(16.dp))
                        Text("Checking in…", style = MaterialTheme.typography.titleMedium)
                    }
                    CheckinState.Done -> {
                        Icon(
                            Icons.Default.CheckCircle,
                            contentDescription = null,
                            tint = Color(0xFF4CAF50),
                            modifier = Modifier.size(72.dp)
                        )
                        Spacer(Modifier.height(16.dp))
                        Text(
                            "Check-in confirmed",
                            style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.SemiBold),
                            textAlign = TextAlign.Center
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "Your check-in deadline has been reset.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center
                        )
                        Spacer(Modifier.height(32.dp))
                        Button(onClick = { nav.navigate(Screen.Main.route) { popUpTo(0) { inclusive = true } } }) {
                            Text("Done")
                        }
                    }
                    CheckinState.Error -> {
                        Icon(
                            Icons.Default.Error,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.error,
                            modifier = Modifier.size(72.dp)
                        )
                        Spacer(Modifier.height(16.dp))
                        Text(
                            "Check-in failed",
                            style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.SemiBold),
                            textAlign = TextAlign.Center
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            errorMessage,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.error,
                            textAlign = TextAlign.Center
                        )
                        Spacer(Modifier.height(32.dp))
                        Button(onClick = { nav.navigate(Screen.Main.route) { popUpTo(0) { inclusive = true } } }) {
                            Text("OK")
                        }
                    }
                    CheckinState.Idle -> {}
                }
            }
        }
    }
}
