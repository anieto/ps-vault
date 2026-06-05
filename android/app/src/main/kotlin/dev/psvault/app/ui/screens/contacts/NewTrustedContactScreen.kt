package dev.psvault.app.ui.screens.contacts

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import dev.psvault.app.api.ApiService
import dev.psvault.app.ui.components.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewTrustedContactScreen(nav: NavController) {
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var notifyOnFinalWarning by remember { mutableStateOf(false) }
    var canAbort by remember { mutableStateOf(false) }
    var canVerifyLife by remember { mutableStateOf(false) }
    var canCorroborateDeath by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("New Trusted Contact", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold)) },
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
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                ErrorBanner(error)
                AuthField(value = name, onValueChange = { name = it; error = "" }, label = "Full Name")
                AuthField(value = email, onValueChange = { email = it; error = "" }, label = "Email")
                AuthField(value = phone, onValueChange = { phone = it }, label = "Phone (optional)")

                SectionHeader("Permissions")
                VaultCard {
                    ToggleRow("Notify on final warning", notifyOnFinalWarning) { notifyOnFinalWarning = it }
                    ToggleRow("Can abort switch", canAbort) { canAbort = it }
                    ToggleRow("Can verify life", canVerifyLife) { canVerifyLife = it }
                    ToggleRow("Can corroborate death", canCorroborateDeath) { canCorroborateDeath = it }
                }
                LoadingButton(
                    text = "Add Trusted Contact",
                    loading = loading,
                    enabled = name.isNotBlank() && email.isNotBlank(),
                    onClick = {
                        scope.launch {
                            loading = true; error = ""
                            try {
                                ApiService.createTrustedContact(
                                    name = name.trim(), email = email.trim(),
                                    phone = phone.ifBlank { null },
                                    notifyOnFinalWarning = notifyOnFinalWarning,
                                    canAbort = canAbort, canVerifyLife = canVerifyLife,
                                    canCorroborateDeath = canCorroborateDeath
                                )
                                nav.popBackStack()
                            } catch (e: Exception) { error = e.message ?: "Save failed" }
                            finally { loading = false }
                        }
                    }
                )
            }
        }
    }
}

@Composable
private fun ToggleRow(label: String, checked: Boolean, onToggle: (Boolean) -> Unit) {
    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        Switch(checked = checked, onCheckedChange = onToggle)
    }
}
