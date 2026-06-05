package dev.psvault.app.ui.screens.vaults

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
import dev.psvault.app.LocalAppViewModel
import dev.psvault.app.api.ApiService
import dev.psvault.app.crypto.CryptoService
import dev.psvault.app.models.Beneficiary
import dev.psvault.app.models.Vault
import dev.psvault.app.models.VaultBeneficiary
import dev.psvault.app.ui.components.*
import kotlinx.coroutines.launch

private val tiers = listOf("immediate", "secondary", "tertiary")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BeneficiarySelectionScreen(vaultId: String, nav: NavController) {
    val vm = LocalAppViewModel.current
    val scope = rememberCoroutineScope()
    var vault by remember { mutableStateOf<Vault?>(null) }
    var allBeneficiaries by remember { mutableStateOf<List<Beneficiary>>(emptyList()) }
    var vaultBeneficiaries by remember { mutableStateOf<List<VaultBeneficiary>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf("") }

    suspend fun load() {
        try {
            val allVaults = ApiService.listVaults()
            vault = allVaults.firstOrNull { it.id == vaultId }
            allBeneficiaries = ApiService.listBeneficiaries()
            vaultBeneficiaries = ApiService.getVaultBeneficiaries(vaultId)
        } catch (e: Exception) { error = e.message ?: "Failed to load" }
        finally { loading = false }
    }

    LaunchedEffect(Unit) { load() }

    val assignedIds = vaultBeneficiaries.map { it.beneficiaryId }.toSet()
    val unassigned = allBeneficiaries.filter { it.id !in assignedIds }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Beneficiaries", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold)) },
                navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } },
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
                    contentPadding = PaddingValues(vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    if (error.isNotEmpty()) item { ErrorBanner(error) }

                    // Assigned
                    if (vaultBeneficiaries.isNotEmpty()) {
                        item { SectionHeader("Assigned") }
                        items(vaultBeneficiaries) { vb ->
                            VaultCard {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                            Text(vb.beneficiaryName, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold))
                                            TierBadge(vb.tier)
                                        }
                                        Text(vb.beneficiaryEmail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                    // Tier selector
                                    var tierExpanded by remember { mutableStateOf(false) }
                                    Box {
                                        TextButton(onClick = { tierExpanded = true }) {
                                            Text(vb.tier?.replaceFirstChar { it.uppercaseChar() } ?: "No tier", style = MaterialTheme.typography.labelSmall)
                                        }
                                        DropdownMenu(expanded = tierExpanded, onDismissRequest = { tierExpanded = false }) {
                                            DropdownMenuItem(text = { Text("No tier") }, onClick = {
                                                tierExpanded = false
                                                scope.launch {
                                                    try { ApiService.setBeneficiaryTier(vaultId, vb.beneficiaryId, null); vaultBeneficiaries = ApiService.getVaultBeneficiaries(vaultId) }
                                                    catch (e: Exception) { error = e.message ?: "Failed" }
                                                }
                                            })
                                            tiers.forEach { tier ->
                                                DropdownMenuItem(text = { Text(tier.replaceFirstChar { it.uppercaseChar() }) }, onClick = {
                                                    tierExpanded = false
                                                    scope.launch {
                                                        try { ApiService.setBeneficiaryTier(vaultId, vb.beneficiaryId, tier); vaultBeneficiaries = ApiService.getVaultBeneficiaries(vaultId) }
                                                        catch (e: Exception) { error = e.message ?: "Failed" }
                                                    }
                                                })
                                            }
                                        }
                                    }
                                    IconButton(onClick = {
                                        scope.launch {
                                            try { ApiService.removeVaultBeneficiary(vaultId, vb.beneficiaryId); vaultBeneficiaries = ApiService.getVaultBeneficiaries(vaultId) }
                                            catch (e: Exception) { error = e.message ?: "Failed" }
                                        }
                                    }) { Icon(Icons.Default.Delete, "Remove", tint = MaterialTheme.colorScheme.error) }
                                }
                            }
                        }
                    }

                    // Unassigned
                    if (unassigned.isNotEmpty()) {
                        item { SectionHeader("Add Beneficiary") }
                        items(unassigned) { b ->
                            VaultCard {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(b.name, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold))
                                        Text(b.email, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                    var secretQuestion by remember { mutableStateOf("") }
                                    var showDialog by remember { mutableStateOf(false) }
                                    Button(
                                        onClick = {
                                            // Check if beneficiary has a secret question
                                            if (b.secretQuestion?.isNotEmpty() == true) showDialog = true
                                            else {
                                                scope.launch {
                                                    try {
                                                        val mek = vm.mek ?: throw Exception("Not unlocked")
                                                        val v = vault ?: throw Exception("Vault not found")
                                                        val cek = CryptoService.unwrapCEK(v.cekEnvelope, mek)
                                                        val cekEnvelope = CryptoService.wrapKey(cek, mek) // wrap with user key first; for beneficiary use shared secret
                                                        // For beneficiaries without secret question, use their public key if available
                                                        // This is a simplified assignment — full crypto uses secret question as shared secret
                                                        ApiService.assignBeneficiary(vaultId, b.id, cekEnvelope)
                                                        vaultBeneficiaries = ApiService.getVaultBeneficiaries(vaultId)
                                                    } catch (e: Exception) { error = e.message ?: "Failed" }
                                                }
                                            }
                                        },
                                        modifier = Modifier.height(32.dp)
                                    ) { Text("Add", style = MaterialTheme.typography.labelSmall) }

                                    if (showDialog) {
                                        AlertDialog(
                                            onDismissRequest = { showDialog = false },
                                            title = { Text("Shared Secret") },
                                            text = {
                                                Column {
                                                    Text("Question: ${b.secretQuestion}", style = MaterialTheme.typography.bodySmall)
                                                    Spacer(Modifier.height(8.dp))
                                                    OutlinedTextField(value = secretQuestion, onValueChange = { secretQuestion = it }, label = { Text("Answer") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                                                }
                                            },
                                            confirmButton = {
                                                TextButton(onClick = {
                                                    showDialog = false
                                                    scope.launch {
                                                        try {
                                                            val mek = vm.mek ?: throw Exception("Not unlocked")
                                                            val v = vault ?: throw Exception("Vault not found")
                                                            val cek = CryptoService.unwrapCEK(v.cekEnvelope, mek)
                                                            val cekEnvelope = CryptoService.wrapCEKForBeneficiary(cek, secretQuestion)
                                                            ApiService.assignBeneficiary(vaultId, b.id, cekEnvelope)
                                                            vaultBeneficiaries = ApiService.getVaultBeneficiaries(vaultId)
                                                        } catch (e: Exception) { error = e.message ?: "Failed" }
                                                    }
                                                }) { Text("Assign") }
                                            },
                                            dismissButton = { TextButton(onClick = { showDialog = false }) { Text("Cancel") } }
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
