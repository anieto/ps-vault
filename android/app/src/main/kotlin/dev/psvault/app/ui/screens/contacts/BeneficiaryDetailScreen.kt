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
import dev.psvault.app.LocalAppViewModel
import dev.psvault.app.api.ApiService
import dev.psvault.app.crypto.CryptoService
import dev.psvault.app.models.Beneficiary
import dev.psvault.app.models.BeneficiaryVaultItem
import dev.psvault.app.models.Vault
import dev.psvault.app.ui.ContactRoute
import dev.psvault.app.ui.components.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BeneficiaryDetailScreen(beneficiaryId: String, nav: NavController) {
    val vm = LocalAppViewModel.current
    val scope = rememberCoroutineScope()
    val mek = vm.mek
    var beneficiary by remember { mutableStateOf<Beneficiary?>(null) }
    var vaults by remember { mutableStateOf<List<BeneficiaryVaultItem>>(emptyList()) }
    var allVaults by remember { mutableStateOf<List<Vault>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf("") }
    var showDeleteDialog by remember { mutableStateOf(false) }
    var menuExpanded by remember { mutableStateOf(false) }
    var showGrantDialog by remember { mutableStateOf(false) }
    var changeKeyTarget by remember { mutableStateOf<BeneficiaryVaultItem?>(null) }

    suspend fun reloadVaults() {
        vaults = ApiService.getBeneficiaryVaults(beneficiaryId)
    }

    LaunchedEffect(Unit) {
        try {
            beneficiary = ApiService.listBeneficiaries().firstOrNull { it.id == beneficiaryId }
            vaults = ApiService.getBeneficiaryVaults(beneficiaryId)
            if (mek != null) allVaults = ApiService.listVaults()
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
                        Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                            ContactAvatar(name = b.name, photoData = b.photoData, size = 72.dp)
                        }

                        VaultCard {
                            InfoRow("Name", b.name)
                            InfoRow("Email", b.email)
                            InfoRow("Email confirmed", if (b.emailConfirmed) "Yes" else "No — resend confirmation")
                            b.relationship?.let { InfoRow("Relationship", it) }
                            b.secretQuestion?.let { InfoRow("Secret question", it) }
                        }

                        SectionHeader("Vault Access")
                        if (vaults.isEmpty()) {
                            VaultCard {
                                Text("No vault access granted yet.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        } else {
                            vaults.forEach { v ->
                                VaultCard {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(v.icon, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(end = 10.dp))
                                        Text(v.name, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold), modifier = Modifier.weight(1f))
                                        TierBadge(v.tier)
                                    }
                                    if (mek != null) {
                                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                                            TextButton(onClick = { changeKeyTarget = v }) { Text("Change key") }
                                            TextButton(
                                                onClick = {
                                                    scope.launch {
                                                        try {
                                                            ApiService.removeVaultBeneficiary(v.id, beneficiaryId)
                                                            reloadVaults()
                                                        } catch (e: Exception) { error = e.message ?: "Failed to remove" }
                                                    }
                                                },
                                                colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)
                                            ) { Text("Remove") }
                                        }
                                    }
                                }
                            }
                        }
                        if (mek != null) {
                            val assignedIds = vaults.map { it.id }.toSet()
                            val available = allVaults.filter { it.id !in assignedIds }
                            if (available.isNotEmpty()) {
                                OutlinedButton(
                                    onClick = { showGrantDialog = true },
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Icon(Icons.Default.Add, null, modifier = Modifier.size(16.dp))
                                    Spacer(Modifier.width(6.dp))
                                    Text("Add to vault")
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

    if (showGrantDialog && mek != null) {
        val assignedIds = vaults.map { it.id }.toSet()
        val available = allVaults.filter { it.id !in assignedIds }
        GrantVaultDialog(
            availableVaults = available,
            onDismiss = { showGrantDialog = false },
            onGrant = { vaultId, sharedSecret ->
                showGrantDialog = false
                scope.launch {
                    try {
                        val vault = allVaults.first { it.id == vaultId }
                        val cek = CryptoService.unwrapCEK(vault.cekEnvelope, mek)
                        val envelope = CryptoService.wrapCEKForBeneficiary(cek, sharedSecret)
                        ApiService.assignBeneficiary(vaultId, beneficiaryId, envelope)
                        reloadVaults()
                    } catch (e: Exception) { error = e.message ?: "Failed to grant access" }
                }
            }
        )
    }

    changeKeyTarget?.let { v ->
        if (mek != null) {
            ChangeVaultKeyDialog(
                vaultName = v.name,
                onDismiss = { changeKeyTarget = null },
                onSave = { newKey ->
                    changeKeyTarget = null
                    scope.launch {
                        try {
                            val vault = allVaults.first { it.id == v.id }
                            val cek = CryptoService.unwrapCEK(vault.cekEnvelope, mek)
                            val envelope = CryptoService.wrapCEKForBeneficiary(cek, newKey)
                            ApiService.assignBeneficiary(v.id, beneficiaryId, envelope)
                            reloadVaults()
                        } catch (e: Exception) { error = e.message ?: "Failed to change key" }
                    }
                }
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun GrantVaultDialog(
    availableVaults: List<Vault>,
    onDismiss: () -> Unit,
    onGrant: (vaultId: String, sharedSecret: String) -> Unit
) {
    var selectedVaultId by remember { mutableStateOf(availableVaults.firstOrNull()?.id ?: "") }
    var accessKey by remember { mutableStateOf("") }
    var expanded by remember { mutableStateOf(false) }
    val selectedVault = availableVaults.firstOrNull { it.id == selectedVaultId }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add to vault") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
                    OutlinedTextField(
                        value = selectedVault?.let { "${it.icon} ${it.name}" } ?: "Select vault",
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Vault") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
                        modifier = Modifier.fillMaxWidth().menuAnchor()
                    )
                    ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                        availableVaults.forEach { vault ->
                            DropdownMenuItem(
                                text = { Text("${vault.icon} ${vault.name}") },
                                onClick = { selectedVaultId = vault.id; expanded = false }
                            )
                        }
                    }
                }
                OutlinedTextField(
                    value = accessKey,
                    onValueChange = { accessKey = it },
                    label = { Text("Access key") },
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onGrant(selectedVaultId, accessKey.trim()) },
                enabled = selectedVaultId.isNotBlank() && accessKey.isNotBlank()
            ) { Text("Grant") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
private fun ChangeVaultKeyDialog(
    vaultName: String,
    onDismiss: () -> Unit,
    onSave: (newKey: String) -> Unit
) {
    var newKey by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Change access key") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("New access key for \"$vaultName\"", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedTextField(
                    value = newKey,
                    onValueChange = { newKey = it },
                    label = { Text("New access key") },
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { onSave(newKey.trim()) }, enabled = newKey.isNotBlank()) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

