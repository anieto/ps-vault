package dev.psvault.app.ui.screens.vaults

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import dev.psvault.app.LocalAppViewModel
import dev.psvault.app.api.ApiService
import dev.psvault.app.crypto.CryptoService
import dev.psvault.app.models.Vault
import dev.psvault.app.ui.VaultRoute
import dev.psvault.app.ui.components.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VaultListScreen(nav: NavController) {
    val vm = LocalAppViewModel.current
    val scope = rememberCoroutineScope()
    var vaults by remember { mutableStateOf<List<Vault>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf("") }
    var showNewVault by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        try { vaults = ApiService.listVaults() }
        catch (e: Exception) { error = e.message ?: "Failed to load vaults" }
        finally { loading = false }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Vaults", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold)) },
                actions = {
                    IconButton(onClick = { showNewVault = true }) {
                        Icon(Icons.Default.Add, "New Vault")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        },
        containerColor = Color.Transparent,
        floatingActionButton = {
            FloatingActionButton(onClick = { showNewVault = true }) {
                Icon(Icons.Default.Add, "New Vault")
            }
        }
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize()) {
            GradientBackground()
            BrandGradientOverlay(brandColor = vm.brandColor)
            if (loading) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    contentPadding = PaddingValues(vertical = 12.dp)
                ) {
                    if (error.isNotEmpty()) item { ErrorBanner(error) }
                    if (vaults.isEmpty()) {
                        item {
                            Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text("🔒", style = MaterialTheme.typography.displayMedium)
                                    Spacer(Modifier.height(8.dp))
                                    Text("No vaults yet", style = MaterialTheme.typography.titleMedium)
                                    Text("Tap + to create your first vault", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                    items(vaults) { vault ->
                        VaultCard(
                            modifier = Modifier.clickable { nav.navigate(VaultRoute.Detail.route(vault.id)) }
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(vault.icon, style = MaterialTheme.typography.headlineMedium)
                                Spacer(Modifier.width(12.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(vault.name, style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold))
                                    Text(
                                        vault.accessMode.replaceFirstChar { it.uppercaseChar() } + " delivery",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showNewVault) {
        NewVaultDialog(
            onDismiss = { showNewVault = false },
            onCreate = { name, icon ->
                showNewVault = false
                scope.launch {
                    try {
                        val mek = vm.mek ?: throw Exception("Not unlocked")
                        val cek = CryptoService.generateKey()
                        val cekEnvelope = CryptoService.wrapKey(cek, mek)
                        val vault = ApiService.createVault(name, icon, cekEnvelope)
                        vaults = vaults + vault
                    } catch (e: Exception) { error = e.message ?: "Failed to create vault" }
                }
            }
        )
    }
}

@Composable
private fun NewVaultDialog(onDismiss: () -> Unit, onCreate: (name: String, icon: String) -> Unit) {
    var name by remember { mutableStateOf("") }
    var icon by remember { mutableStateOf("🔒") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("New Vault") },
        text = {
            Column {
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Vault name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(value = icon, onValueChange = { icon = it }, label = { Text("Icon (emoji)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = {
            TextButton(onClick = { if (name.isNotBlank()) onCreate(name.trim(), icon.trim().ifEmpty { "🔒" }) }) { Text("Create") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}
