package dev.psvault.app.ui.screens.settings

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import dev.psvault.app.api.ApiService
import dev.psvault.app.models.Session
import dev.psvault.app.ui.components.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SessionsSettingsScreen(nav: NavController) {
    val scope = rememberCoroutineScope()
    var sessions by remember { mutableStateOf<List<Session>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf("") }
    var showRevokeAllDialog by remember { mutableStateOf(false) }

    suspend fun load() {
        try { sessions = ApiService.listSessions() }
        catch (e: Exception) { error = e.message ?: "Failed to load" }
        finally { loading = false }
    }

    LaunchedEffect(Unit) { load() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Sessions", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold)) },
                navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } },
                actions = {
                    TextButton(onClick = { showRevokeAllDialog = true }, colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)) {
                        Text("Revoke all")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        },
        containerColor = Color.Transparent
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize()) {
            GradientBackground()
            if (loading) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    contentPadding = PaddingValues(vertical = 12.dp)
                ) {
                    if (error.isNotEmpty()) item { ErrorBanner(error) }
                    items(sessions) { session ->
                        VaultCard {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(session.deviceInfo, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold))
                                    Text(session.ipAddress, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Text("Last used: ${session.lastUsedAt.take(10)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                IconButton(onClick = {
                                    scope.launch {
                                        try { ApiService.revokeSession(session.id); sessions = sessions.filter { it.id != session.id } }
                                        catch (e: Exception) { error = e.message ?: "Failed" }
                                    }
                                }) { Icon(Icons.Default.Delete, "Revoke", tint = MaterialTheme.colorScheme.error) }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showRevokeAllDialog) {
        ConfirmDialog(
            title = "Revoke All Sessions",
            message = "This will sign you out of all devices. You'll need to sign in again.",
            confirmText = "Revoke All",
            confirmColor = MaterialTheme.colorScheme.error,
            onConfirm = {
                showRevokeAllDialog = false
                scope.launch {
                    try { ApiService.revokeAllSessions(); sessions = emptyList() }
                    catch (e: Exception) { error = e.message ?: "Failed" }
                }
            },
            onDismiss = { showRevokeAllDialog = false }
        )
    }
}
