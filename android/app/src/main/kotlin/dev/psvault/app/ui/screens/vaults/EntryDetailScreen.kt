package dev.psvault.app.ui.screens.vaults

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import dev.psvault.app.LocalAppViewModel
import dev.psvault.app.api.ApiService
import dev.psvault.app.crypto.CryptoService
import dev.psvault.app.models.EntryData
import dev.psvault.app.models.Vault
import dev.psvault.app.models.VaultEntry
import dev.psvault.app.ui.VaultRoute
import dev.psvault.app.ui.components.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EntryDetailScreen(vaultId: String, entryId: String, nav: NavController) {
    val vm = LocalAppViewModel.current
    val scope = rememberCoroutineScope()
    var vault by remember { mutableStateOf<Vault?>(null) }
    var entry by remember { mutableStateOf<VaultEntry?>(null) }
    var entryData by remember { mutableStateOf<EntryData?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf("") }
    var showDeleteDialog by remember { mutableStateOf(false) }
    var menuExpanded by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        try {
            val allVaults = ApiService.listVaults()
            vault = allVaults.firstOrNull { it.id == vaultId }
            val allEntries = ApiService.listEntries(vaultId)
            entry = allEntries.firstOrNull { it.id == entryId }
            val v = vault ?: throw Exception("Vault not found")
            val e = entry ?: throw Exception("Entry not found")
            val mek = vm.mek ?: throw Exception("Not unlocked")
            val cek = CryptoService.unwrapCEK(v.cekEnvelope, mek)
            entryData = CryptoService.decryptEntry(e.encryptedData, cek)
        } catch (ex: Exception) { error = ex.message ?: "Failed to load entry" }
        finally { loading = false }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(entry?.title ?: "Entry", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold)) },
                navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } },
                actions = {
                    // Favorite toggle
                    entry?.let { e ->
                        IconButton(onClick = {
                            scope.launch {
                                try {
                                    val updated = ApiService.updateEntry(vaultId, entryId, isFavorite = !e.isFavorite)
                                    entry = updated
                                } catch (ex: Exception) { error = ex.message ?: "Failed" }
                            }
                        }) {
                            Icon(
                                if (e.isFavorite) Icons.Default.Star else Icons.Default.StarBorder,
                                "Favorite",
                                tint = if (e.isFavorite) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    Box {
                        IconButton(onClick = { menuExpanded = true }) { Icon(Icons.Default.MoreVert, "More") }
                        DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
                            DropdownMenuItem(text = { Text("Edit") }, onClick = {
                                menuExpanded = false
                                nav.navigate(VaultRoute.EditEntry.route(vaultId, entryId))
                            })
                            DropdownMenuItem(text = { Text("Delete", color = MaterialTheme.colorScheme.error) }, onClick = {
                                menuExpanded = false
                                showDeleteDialog = true
                            })
                        }
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
                Box(Modifier.fillMaxSize(), contentAlignment = androidx.compose.ui.Alignment.Center) { CircularProgressIndicator() }
            } else {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(padding)
                        .padding(16.dp)
                ) {
                    ErrorBanner(error)
                    entryData?.let { data ->
                        // Entry type badge
                        entry?.let { e ->
                            Text(
                                e.entryType.replace("_", " ").split(" ")
                                    .joinToString(" ") { it.replaceFirstChar { c -> c.uppercaseChar() } },
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(bottom = 12.dp)
                            )
                        }

                        VaultCard {
                            data.fields.forEach { field ->
                                FieldRow(
                                    label = field.label,
                                    value = field.value,
                                    sensitive = field.sensitive,
                                    clipboardTimeoutSeconds = vm.clipboardTimeoutSeconds
                                )
                            }
                            data.notes?.let { notes ->
                                if (notes.isNotEmpty()) {
                                    Spacer(Modifier.height(8.dp))
                                    Text("Notes", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Spacer(Modifier.height(4.dp))
                                    Text(notes, style = MaterialTheme.typography.bodyMedium)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showDeleteDialog) {
        ConfirmDialog(
            title = "Delete Entry",
            message = "This will permanently delete \"${entry?.title}\". This cannot be undone.",
            confirmText = "Delete",
            confirmColor = MaterialTheme.colorScheme.error,
            onConfirm = {
                showDeleteDialog = false
                scope.launch {
                    try { ApiService.deleteEntry(vaultId, entryId); nav.popBackStack() }
                    catch (e: Exception) { error = e.message ?: "Delete failed" }
                }
            },
            onDismiss = { showDeleteDialog = false }
        )
    }
}
