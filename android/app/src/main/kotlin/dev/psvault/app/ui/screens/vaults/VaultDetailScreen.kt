package dev.psvault.app.ui.screens.vaults

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
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
import dev.psvault.app.models.Vault
import dev.psvault.app.models.VaultBeneficiary
import dev.psvault.app.models.VaultEntry
import dev.psvault.app.ui.VaultRoute
import dev.psvault.app.ui.components.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VaultDetailScreen(vaultId: String, nav: NavController) {
    val vm = LocalAppViewModel.current
    val scope = rememberCoroutineScope()
    var vault by remember { mutableStateOf<Vault?>(null) }
    var entries by remember { mutableStateOf<List<VaultEntry>>(emptyList()) }
    var vaultBeneficiaries by remember { mutableStateOf<List<VaultBeneficiary>>(emptyList()) }
    var allBeneficiaries by remember { mutableStateOf<List<Beneficiary>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf("") }
    var showDeleteDialog by remember { mutableStateOf(false) }
    var showEditDialog by remember { mutableStateOf(false) }
    var menuExpanded by remember { mutableStateOf(false) }

    // Delivery mode state
    var pendingAccessMode by remember { mutableStateOf("simultaneous") }
    var pendingCascadeWindow by remember { mutableStateOf(1) }
    var pendingNotifyLocked by remember { mutableStateOf(false) }
    var savingAccessMode by remember { mutableStateOf(false) }

    // Grant access state
    var showGrantDialog by remember { mutableStateOf(false) }
    var showChangeKeyDialog by remember { mutableStateOf<VaultBeneficiary?>(null) }

    suspend fun load() {
        try {
            val allVaults = ApiService.listVaults()
            vault = allVaults.firstOrNull { it.id == vaultId }
            vault?.let { v ->
                pendingAccessMode = v.accessMode
                pendingCascadeWindow = maxOf(1, v.cascadeWindowDays)
                pendingNotifyLocked = v.notifyLockedTiers
            }
            entries = ApiService.listEntries(vaultId).sortedBy { it.sortOrder }
            vaultBeneficiaries = ApiService.getVaultBeneficiaries(vaultId)
            allBeneficiaries = ApiService.listBeneficiaries()
        } catch (e: Exception) { error = e.message ?: "Failed to load" }
        finally { loading = false }
    }

    LaunchedEffect(Unit) { load() }

    val accessModeChanged = vault?.let {
        pendingAccessMode != it.accessMode ||
        (pendingAccessMode == "cascading" && pendingCascadeWindow != it.cascadeWindowDays)
    } ?: false

    val assignedIds = vaultBeneficiaries.map { it.beneficiaryId }.toSet()
    val availableBeneficiaries = allBeneficiaries.filter { it.id !in assignedIds }
    val mek = vm.mek

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(vault?.let { "${it.icon} ${it.name}" } ?: "Vault", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold)) },
                navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } },
                actions = {
                    IconButton(onClick = { nav.navigate(VaultRoute.NewEntry.route(vaultId)) }) { Icon(Icons.Default.Add, "New Entry") }
                    Box {
                        IconButton(onClick = { menuExpanded = true }) { Icon(Icons.Default.MoreVert, "More") }
                        DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
                            DropdownMenuItem(text = { Text("Edit Vault") }, onClick = { menuExpanded = false; showEditDialog = true })
                            DropdownMenuItem(text = { Text("Delete Vault", color = MaterialTheme.colorScheme.error) }, onClick = { menuExpanded = false; showDeleteDialog = true })
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        },
        containerColor = Color.Transparent,
        floatingActionButton = {
            FloatingActionButton(onClick = { nav.navigate(VaultRoute.NewEntry.route(vaultId)) }) {
                Icon(Icons.Default.Add, "New Entry")
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
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    contentPadding = PaddingValues(vertical = 12.dp)
                ) {
                    if (error.isNotEmpty()) item { ErrorBanner(error) }

                    // Entries section
                    item { SectionHeader("Contents (${entries.size})") }
                    if (entries.isEmpty()) {
                        item {
                            VaultCard {
                                Text("No entries yet", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                    itemsIndexed(entries) { index, entry ->
                        VaultCard(
                            modifier = Modifier.clickable { nav.navigate(VaultRoute.EntryDetail.route(vaultId, entry.id)) }
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(entry.title, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold))
                                    Text(
                                        entry.entryType.replace("_", " ").split(" ")
                                            .joinToString(" ") { it.replaceFirstChar { c -> c.uppercaseChar() } },
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                                if (entry.isFavorite) {
                                    Icon(Icons.Default.Star, "Favorite", tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(16.dp))
                                }
                                Column {
                                    if (index > 0) {
                                        IconButton(
                                            onClick = {
                                                scope.launch {
                                                    try {
                                                        val above = entries[index - 1]
                                                        ApiService.updateEntry(vaultId, entry.id, sortOrder = above.sortOrder)
                                                        ApiService.updateEntry(vaultId, above.id, sortOrder = entry.sortOrder)
                                                        entries = ApiService.listEntries(vaultId).sortedBy { it.sortOrder }
                                                    } catch (e: Exception) { error = e.message ?: "Reorder failed" }
                                                }
                                            },
                                            modifier = Modifier.size(24.dp)
                                        ) { Icon(Icons.Default.KeyboardArrowUp, "Move up", modifier = Modifier.size(16.dp)) }
                                    }
                                    if (index < entries.lastIndex) {
                                        IconButton(
                                            onClick = {
                                                scope.launch {
                                                    try {
                                                        val below = entries[index + 1]
                                                        ApiService.updateEntry(vaultId, entry.id, sortOrder = below.sortOrder)
                                                        ApiService.updateEntry(vaultId, below.id, sortOrder = entry.sortOrder)
                                                        entries = ApiService.listEntries(vaultId).sortedBy { it.sortOrder }
                                                    } catch (e: Exception) { error = e.message ?: "Reorder failed" }
                                                }
                                            },
                                            modifier = Modifier.size(24.dp)
                                        ) { Icon(Icons.Default.KeyboardArrowDown, "Move down", modifier = Modifier.size(16.dp)) }
                                    }
                                }
                            }
                        }
                    }

                    // Delivery Mode section
                    item { Spacer(Modifier.height(8.dp)) }
                    item { SectionHeader("Delivery Mode") }
                    item {
                        VaultCard {
                            Text("Mode", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium))
                            Spacer(Modifier.height(8.dp))
                            SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                                SegmentedButton(
                                    selected = pendingAccessMode == "simultaneous",
                                    onClick = { pendingAccessMode = "simultaneous" },
                                    shape = SegmentedButtonDefaults.itemShape(index = 0, count = 2)
                                ) { Text("Simultaneous") }
                                SegmentedButton(
                                    selected = pendingAccessMode == "cascading",
                                    onClick = { pendingAccessMode = "cascading" },
                                    shape = SegmentedButtonDefaults.itemShape(index = 1, count = 2)
                                ) { Text("Cascading") }
                            }

                            if (pendingAccessMode == "cascading") {
                                Spacer(Modifier.height(12.dp))
                                Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        "Cascade window: $pendingCascadeWindow day${if (pendingCascadeWindow == 1) "" else "s"}",
                                        style = MaterialTheme.typography.bodyMedium,
                                        modifier = Modifier.weight(1f)
                                    )
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        IconButton(onClick = { if (pendingCascadeWindow > 1) pendingCascadeWindow-- }, modifier = Modifier.size(32.dp)) {
                                            Text("−", style = MaterialTheme.typography.titleMedium)
                                        }
                                        IconButton(onClick = { if (pendingCascadeWindow < 90) pendingCascadeWindow++ }, modifier = Modifier.size(32.dp)) {
                                            Text("+", style = MaterialTheme.typography.titleMedium)
                                        }
                                    }
                                }
                                Spacer(Modifier.height(8.dp))
                                Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text("Notify secondary & tertiary on trigger", style = MaterialTheme.typography.bodyMedium)
                                        Text("Heads-up only — no access link", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                    Switch(
                                        checked = pendingNotifyLocked,
                                        onCheckedChange = { newValue ->
                                            pendingNotifyLocked = newValue
                                            scope.launch {
                                                try {
                                                    val updated = ApiService.updateVault(vaultId, notifyLockedTiers = newValue)
                                                    vault = updated
                                                } catch (e: Exception) {
                                                    pendingNotifyLocked = !newValue
                                                    error = e.message ?: "Failed"
                                                }
                                            }
                                        }
                                    )
                                }
                                Spacer(Modifier.height(4.dp))
                                Text(
                                    "Tiers unlock in sequence: primary first, then secondary after $pendingCascadeWindow day${if (pendingCascadeWindow == 1) "" else "s"}, then tertiary.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            } else {
                                Spacer(Modifier.height(4.dp))
                                Text(
                                    "All beneficiaries receive access at the same time when the switch triggers.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }

                            if (accessModeChanged) {
                                Spacer(Modifier.height(12.dp))
                                LoadingButton(
                                    text = "Save Delivery Mode",
                                    loading = savingAccessMode,
                                    onClick = {
                                        scope.launch {
                                            savingAccessMode = true; error = ""
                                            try {
                                                val updated = ApiService.updateVault(
                                                    vaultId,
                                                    accessMode = pendingAccessMode,
                                                    cascadeWindowDays = if (pendingAccessMode == "cascading") pendingCascadeWindow else null
                                                )
                                                vault = updated
                                                pendingAccessMode = updated.accessMode
                                                pendingCascadeWindow = maxOf(1, updated.cascadeWindowDays)
                                            } catch (e: Exception) { error = e.message ?: "Failed to save" }
                                            finally { savingAccessMode = false }
                                        }
                                    }
                                )
                            }
                        }
                    }

                    // Access section
                    item { Spacer(Modifier.height(8.dp)) }
                    item { SectionHeader("Access (${vaultBeneficiaries.size})") }
                    if (vaultBeneficiaries.isEmpty()) {
                        item {
                            VaultCard {
                                Text("No beneficiaries have access yet.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                    itemsIndexed(vaultBeneficiaries) { _, vb ->
                        VaultCard {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                // Avatar
                                Surface(
                                    color = MaterialTheme.colorScheme.primaryContainer,
                                    shape = MaterialTheme.shapes.large,
                                    modifier = Modifier.size(36.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Text(
                                            vb.beneficiaryName.firstOrNull()?.uppercaseChar()?.toString() ?: "?",
                                            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                                            color = MaterialTheme.colorScheme.onPrimaryContainer
                                        )
                                    }
                                }
                                Spacer(Modifier.width(12.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                        Text(vb.beneficiaryName, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium))
                                        TierBadge(vb.tier)
                                    }
                                    Text(vb.beneficiaryEmail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                // Confirmed indicator
                                if (vb.emailConfirmed) {
                                    Icon(Icons.Default.CheckCircle, "Confirmed", tint = Color(0xFF4CAF50), modifier = Modifier.size(16.dp).padding(end = 4.dp))
                                } else {
                                    Icon(Icons.Default.Email, "Invited", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(16.dp).padding(end = 4.dp))
                                }
                            }

                            // Tier selector for cascading mode
                            if (pendingAccessMode == "cascading") {
                                Spacer(Modifier.height(8.dp))
                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    listOf("primary", "secondary", "tertiary").forEach { tier ->
                                        val selected = vb.tier == tier
                                        FilterChip(
                                            selected = selected,
                                            onClick = {
                                                scope.launch {
                                                    try {
                                                        ApiService.setBeneficiaryTier(vaultId, vb.beneficiaryId, if (selected) null else tier)
                                                        vaultBeneficiaries = ApiService.getVaultBeneficiaries(vaultId)
                                                    } catch (e: Exception) { error = e.message ?: "Failed" }
                                                }
                                            },
                                            label = { Text(tier.replaceFirstChar { it.uppercaseChar() }, style = MaterialTheme.typography.labelSmall) }
                                        )
                                    }
                                }
                            }

                            Spacer(Modifier.height(8.dp))
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                                if (mek != null) {
                                    TextButton(onClick = { showChangeKeyDialog = vb }) { Text("Change key") }
                                }
                                TextButton(
                                    onClick = {
                                        scope.launch {
                                            try {
                                                ApiService.removeVaultBeneficiary(vaultId, vb.beneficiaryId)
                                                vaultBeneficiaries = ApiService.getVaultBeneficiaries(vaultId)
                                            } catch (e: Exception) { error = e.message ?: "Failed" }
                                        }
                                    },
                                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)
                                ) { Text("Remove") }
                            }
                        }
                    }

                    if (mek != null) {
                        item {
                            OutlinedButton(
                                onClick = { showGrantDialog = true },
                                modifier = Modifier.fillMaxWidth()
                            ) { Text("Grant Access") }
                        }
                    }

                    item { Spacer(Modifier.height(24.dp)) }
                }
            }
        }
    }

    if (showDeleteDialog) {
        ConfirmDialog(
            title = "Delete Vault",
            message = "This will permanently delete \"${vault?.name}\" and all its entries. This cannot be undone.",
            confirmText = "Delete",
            confirmColor = MaterialTheme.colorScheme.error,
            onConfirm = {
                showDeleteDialog = false
                scope.launch {
                    try { ApiService.deleteVault(vaultId); nav.popBackStack() }
                    catch (e: Exception) { error = e.message ?: "Delete failed" }
                }
            },
            onDismiss = { showDeleteDialog = false }
        )
    }

    if (showEditDialog) {
        vault?.let { v ->
            EditVaultDialog(
                currentName = v.name,
                currentIcon = v.icon,
                onDismiss = { showEditDialog = false },
                onSave = { name, icon ->
                    showEditDialog = false
                    scope.launch {
                        try {
                            val updated = ApiService.updateVault(vaultId, name = name, icon = icon)
                            vault = updated
                        } catch (e: Exception) { error = e.message ?: "Update failed" }
                    }
                }
            )
        }
    }

    if (showGrantDialog && mek != null) {
        vault?.let { v ->
            GrantAccessDialog(
                available = availableBeneficiaries,
                allBeneficiaries = allBeneficiaries,
                onDismiss = { showGrantDialog = false },
                onGrant = { beneficiaryId, sharedSecret ->
                    showGrantDialog = false
                    scope.launch {
                        try {
                            val cek = CryptoService.unwrapCEK(v.cekEnvelope, mek)
                            val envelope = CryptoService.wrapCEKForBeneficiary(cek, sharedSecret)
                            ApiService.assignBeneficiary(vaultId, beneficiaryId, envelope)
                            vaultBeneficiaries = ApiService.getVaultBeneficiaries(vaultId)
                            allBeneficiaries = ApiService.listBeneficiaries()
                        } catch (e: Exception) { error = e.message ?: "Failed to grant access" }
                    }
                }
            )
        }
    }

    showChangeKeyDialog?.let { vb ->
        if (mek != null) {
            vault?.let { v ->
                ChangeKeyDialog(
                    beneficiaryName = vb.beneficiaryName,
                    onDismiss = { showChangeKeyDialog = null },
                    onSave = { newKey ->
                        showChangeKeyDialog = null
                        scope.launch {
                            try {
                                val cek = CryptoService.unwrapCEK(v.cekEnvelope, mek)
                                val envelope = CryptoService.wrapCEKForBeneficiary(cek, newKey)
                                ApiService.assignBeneficiary(vaultId, vb.beneficiaryId, envelope)
                                vaultBeneficiaries = ApiService.getVaultBeneficiaries(vaultId)
                            } catch (e: Exception) { error = e.message ?: "Failed to change key" }
                        }
                    }
                )
            }
        }
    }
}

@Composable
private fun EditVaultDialog(currentName: String, currentIcon: String, onDismiss: () -> Unit, onSave: (String, String) -> Unit) {
    var name by remember { mutableStateOf(currentName) }
    var icon by remember { mutableStateOf(currentIcon) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit Vault") },
        text = {
            Column {
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Vault name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(value = icon, onValueChange = { icon = it }, label = { Text("Icon (emoji)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = { TextButton(onClick = { if (name.isNotBlank()) onSave(name.trim(), icon.trim().ifEmpty { "🔒" }) }) { Text("Save") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
private fun GrantAccessDialog(
    available: List<Beneficiary>,
    allBeneficiaries: List<Beneficiary>,
    onDismiss: () -> Unit,
    onGrant: (beneficiaryId: String, sharedSecret: String) -> Unit
) {
    var selectedId by remember { mutableStateOf("") }
    var sharedSecret by remember { mutableStateOf("") }
    var expanded by remember { mutableStateOf(false) }
    val selectedName = available.firstOrNull { it.id == selectedId }?.name ?: "Select…"

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Grant Access") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (available.isEmpty()) {
                    Text(
                        if (allBeneficiaries.isEmpty()) "No beneficiaries yet. Add one from the Contacts tab."
                        else "All beneficiaries already have access.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                } else {
                    Box {
                        OutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth()) {
                            Text(selectedName, modifier = Modifier.weight(1f))
                            Icon(Icons.Default.ArrowDropDown, null)
                        }
                        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                            available.forEach { b ->
                                DropdownMenuItem(
                                    text = {
                                        Column {
                                            Text(b.name)
                                            Text(b.email, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        }
                                    },
                                    onClick = { selectedId = b.id; expanded = false }
                                )
                            }
                        }
                    }
                    OutlinedTextField(
                        value = sharedSecret,
                        onValueChange = { sharedSecret = it },
                        label = { Text("Access Key") },
                        placeholder = { Text("A word or phrase to share privately") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Text(
                        "Share this with your beneficiary in person or via a secure channel — it is never stored on the server.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        },
        confirmButton = {
            if (available.isNotEmpty()) {
                TextButton(
                    onClick = { if (selectedId.isNotEmpty() && sharedSecret.isNotBlank()) onGrant(selectedId, sharedSecret.trim()) },
                    enabled = selectedId.isNotEmpty() && sharedSecret.isNotBlank()
                ) { Text("Grant") }
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
private fun ChangeKeyDialog(beneficiaryName: String, onDismiss: () -> Unit, onSave: (String) -> Unit) {
    var newKey by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Change Access Key") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("New access key for $beneficiaryName", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedTextField(
                    value = newKey,
                    onValueChange = { newKey = it },
                    label = { Text("New access key") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Text(
                    "Share this new key with $beneficiaryName directly — it is never stored on the server.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { if (newKey.isNotBlank()) onSave(newKey.trim()) },
                enabled = newKey.isNotBlank()
            ) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}
