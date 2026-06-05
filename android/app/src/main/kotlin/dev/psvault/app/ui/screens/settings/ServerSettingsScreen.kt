package dev.psvault.app.ui.screens.settings

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import dev.psvault.app.LocalAppViewModel
import dev.psvault.app.ui.components.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ServerSettingsScreen(nav: NavController) {
    val vm = LocalAppViewModel.current
    var url by remember { mutableStateOf(vm.serverUrl) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var saved by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Server", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold)) },
                navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        },
        containerColor = Color.Transparent
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize()) {
            GradientBackground()
            Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp).imePadding(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (saved) {
                    Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = MaterialTheme.shapes.medium, modifier = Modifier.fillMaxWidth()) {
                        Text("Server URL updated", modifier = Modifier.padding(12.dp), color = MaterialTheme.colorScheme.onPrimaryContainer)
                    }
                }
                ErrorBanner(error)
                AuthField(value = url, onValueChange = { url = it; error = ""; saved = false }, label = "Server URL")
                Text("Current: ${vm.serverUrl}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                LoadingButton(
                    text = "Update Server URL",
                    loading = saving,
                    enabled = url.isNotBlank() && url != vm.serverUrl,
                    onClick = {
                        val trimmed = url.trim().trimEnd('/')
                        if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
                            error = "URL must start with http:// or https://"; return@LoadingButton
                        }
                        vm.updateServerUrl(trimmed); saved = true; url = trimmed
                    }
                )
            }
        }
    }
}
