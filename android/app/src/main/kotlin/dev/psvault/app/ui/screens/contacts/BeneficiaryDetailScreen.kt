package dev.psvault.app.ui.screens.contacts

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import dev.psvault.app.api.ApiService
import dev.psvault.app.models.Beneficiary
import dev.psvault.app.models.BeneficiaryVaultItem
import dev.psvault.app.ui.ContactRoute
import dev.psvault.app.ui.components.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BeneficiaryDetailScreen(beneficiaryId: String, nav: NavController) {
    val scope = rememberCoroutineScope()
    var beneficiary by remember { mutableStateOf<Beneficiary?>(null) }
    var vaults by remember { mutableStateOf<List<BeneficiaryVaultItem>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf("") }
    var showDeleteDialog by remember { mutableStateOf(false) }
    var menuExpanded by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        try {
            beneficiary = ApiService.listBeneficiaries().firstOrNull { it.id == beneficiaryId }
            vaults = ApiService.getBeneficiaryVaults(beneficiaryId)
        } catch (e: Exception) { error = e.message ?: "Failed to load" }
        finally { loading = false }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(beneficiary?.name ?: "Beneficiary", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold)) },
                navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } },
                actions = {
                    Box {
                        IconButton(onClick = { menuExpanded = true }) { Icon(Icons.Default.MoreVert, "More") }
                        DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
                            DropdownMenuItem(text = { Text("Edit") }, onClick = { menuExpanded = false; nav.navigate(ContactRoute.EditBeneficiary.route(beneficiaryId)) })
                            DropdownMenuItem(text = { Text("Resend confirmation") }, onClick = {
                                menuExpanded = false
                                scope.launch {
                                    try { ApiService.resendBeneficiaryConfirmation(beneficiaryId) }
                                    catch (e: Exception) { error = e.message ?: "Failed" }
                                }
                            })
                            DropdownMenuItem(text = { Text("Delete", color = MaterialTheme.colorScheme.error) }, onClick = { menuExpanded = false; showDeleteDialog = true })
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
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            } else {
                Column(
                    modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(padding).padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    ErrorBanner(error)
                    beneficiary?.let { b ->
                        VaultCard {
                            InfoRow("Name", b.name)
                            InfoRow("Email", b.email)
                            InfoRow("Email confirmed", if (b.emailConfirmed) "Yes" else "No — resend confirmation")
                            b.relationship?.let { InfoRow("Relationship", it) }
                            b.secretQuestion?.let { InfoRow("Secret question", it) }
                        }

                        if (vaults.isNotEmpty()) {
                            SectionHeader("Vault Access")
                            vaults.forEach { v ->
                                VaultCard {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(v.icon, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(end = 10.dp))
                                        Text(v.name, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold), modifier = Modifier.weight(1f))
                                        TierBadge(v.tier)
                                    }
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
            title = "Delete Beneficiary",
            message = "Remove ${beneficiary?.name}? They will lose access to all vaults.",
            confirmText = "Delete",
            confirmColor = MaterialTheme.colorScheme.error,
            onConfirm = {
                showDeleteDialog = false
                scope.launch {
                    try { ApiService.deleteBeneficiary(beneficiaryId); nav.popBackStack() }
                    catch (e: Exception) { error = e.message ?: "Delete failed" }
                }
            },
            onDismiss = { showDeleteDialog = false }
        )
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyMedium)
        HorizontalDivider(modifier = Modifier.padding(top = 4.dp), color = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f))
    }
}
