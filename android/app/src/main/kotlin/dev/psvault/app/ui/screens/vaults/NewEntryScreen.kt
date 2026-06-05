package dev.psvault.app.ui.screens.vaults

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import dev.psvault.app.LocalAppViewModel
import dev.psvault.app.api.ApiService
import dev.psvault.app.crypto.CryptoService
import dev.psvault.app.models.EntryData
import dev.psvault.app.models.EntryField
import dev.psvault.app.models.Vault
import dev.psvault.app.models.VaultEntry
import dev.psvault.app.ui.components.*
import kotlinx.coroutines.launch

private val entryTypes = listOf(
    "password", "note", "file", "financial", "medical", "insurance", "legal", "contact", "crypto"
)

private fun defaultFields(type: String): List<EntryField> = when (type) {
    "password" -> listOf(
        EntryField("Username / Email", "", false),
        EntryField("Password", "", true),
        EntryField("Website URL", "", false)
    )
    "note" -> listOf(EntryField("Content", "", false))
    "financial" -> listOf(
        EntryField("Institution", "", false),
        EntryField("Account type", "", false),
        EntryField("Account number", "", true),
        EntryField("Routing number", "", true),
        EntryField("Online username / email", "", false),
        EntryField("Online password", "", true),
        EntryField("Cardholder name", "", false),
        EntryField("Card number", "", true),
        EntryField("Expiration date", "", false),
        EntryField("CVV", "", true),
        EntryField("PIN", "", true)
    )
    "medical" -> listOf(
        EntryField("Document type", "", false),
        EntryField("Document number", "", false),
        EntryField("Issuing country / state", "", false),
        EntryField("Issue date", "", false),
        EntryField("Expiry date", "", false)
    )
    "insurance" -> listOf(EntryField("Category", "", false), EntryField("Details", "", false))
    "legal" -> listOf(EntryField("Document type", "", false), EntryField("Document number", "", false), EntryField("Details", "", false))
    "contact" -> listOf(
        EntryField("Relationship / Role", "", false),
        EntryField("Phone number", "", false),
        EntryField("Email", "", false),
        EntryField("Address", "", false)
    )
    "crypto" -> listOf(
        EntryField("Wallet / Exchange", "", false),
        EntryField("Seed phrase", "", true),
        EntryField("Private key", "", true)
    )
    else -> emptyList()
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewEntryScreen(vaultId: String, nav: NavController, editEntryId: String? = null) {
    val vm = LocalAppViewModel.current
    val scope = rememberCoroutineScope()
    val isEdit = editEntryId != null
    var vault by remember { mutableStateOf<Vault?>(null) }
    var existingEntry by remember { mutableStateOf<VaultEntry?>(null) }

    var selectedType by remember { mutableStateOf("password") }
    var title by remember { mutableStateOf("") }
    var fields by remember { mutableStateOf(defaultFields("password")) }
    var notes by remember { mutableStateOf("") }
    var isFavorite by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(false) }
    var initialLoading by remember { mutableStateOf(isEdit) }
    var error by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        try {
            val allVaults = ApiService.listVaults()
            vault = allVaults.firstOrNull { it.id == vaultId }
            if (isEdit && editEntryId != null) {
                val allEntries = ApiService.listEntries(vaultId)
                existingEntry = allEntries.firstOrNull { it.id == editEntryId }
                existingEntry?.let { e ->
                    val mek = vm.mek ?: throw Exception("Not unlocked")
                    val v = vault ?: throw Exception("Vault not found")
                    val cek = CryptoService.unwrapCEK(v.cekEnvelope, mek)
                    val data = CryptoService.decryptEntry(e.encryptedData, cek)
                    title = data.title
                    fields = data.fields.toMutableList()
                    notes = data.notes ?: ""
                    isFavorite = data.isFavorite
                    selectedType = e.entryType
                }
            }
        } catch (e: Exception) { error = e.message ?: "Failed to load" }
        finally { initialLoading = false }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (isEdit) "Edit Entry" else "New Entry", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold)) },
                navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        },
        containerColor = Color.Transparent
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize()) {
            GradientBackground()
            if (initialLoading) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            } else {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(padding)
                        .padding(16.dp)
                        .imePadding(),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    ErrorBanner(error)

                    // Entry type selector (only on new)
                    if (!isEdit) {
                        SectionHeader("Entry Type")
                        SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                            entryTypes.forEachIndexed { i, type ->
                                SegmentedButton(
                                    selected = selectedType == type,
                                    onClick = {
                                        selectedType = type
                                        fields = defaultFields(type)
                                    },
                                    shape = SegmentedButtonDefaults.itemShape(i, entryTypes.size)
                                ) { Text(type.replaceFirstChar { it.uppercaseChar() }, style = MaterialTheme.typography.labelSmall) }
                            }
                        }
                    }

                    SectionHeader("Title")
                    OutlinedTextField(value = title, onValueChange = { title = it }, label = { Text("Entry title") }, singleLine = true, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp))

                    SectionHeader("Fields")
                    VaultCard {
                        fields.forEachIndexed { i, field ->
                            Column(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(field.label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                                    Row {
                                        // Sensitive toggle
                                        FilterChip(
                                            selected = field.sensitive,
                                            onClick = { fields = fields.toMutableList().also { it[i] = field.copy(sensitive = !field.sensitive) } },
                                            label = { Text("Sensitive", style = MaterialTheme.typography.labelSmall) },
                                            modifier = Modifier.height(28.dp)
                                        )
                                        if (selectedType in listOf("password", "note", "contact")) {
                                            IconButton(onClick = { fields = fields.toMutableList().also { it.removeAt(i) } }, modifier = Modifier.size(28.dp)) {
                                                Icon(Icons.Default.Delete, "Remove", modifier = Modifier.size(14.dp), tint = MaterialTheme.colorScheme.error)
                                            }
                                        }
                                    }
                                }
                                OutlinedTextField(
                                    value = field.value,
                                    onValueChange = { v -> fields = fields.toMutableList().also { it[i] = field.copy(value = v) } },
                                    singleLine = selectedType != "note" || field.label != "Content",
                                    minLines = if (selectedType == "note" && field.label == "Content") 4 else 1,
                                    visualTransformation = if (field.sensitive) PasswordVisualTransformation() else VisualTransformation.None,
                                    modifier = Modifier.fillMaxWidth(),
                                    shape = RoundedCornerShape(8.dp)
                                )
                            }
                        }
                        // Add custom field
                        TextButton(
                            onClick = { fields = fields + EntryField("Custom field", "", false) },
                            modifier = Modifier.align(Alignment.End)
                        ) {
                            Icon(Icons.Default.Add, null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Add field")
                        }
                    }

                    // Notes
                    SectionHeader("Notes (optional)")
                    OutlinedTextField(value = notes, onValueChange = { notes = it }, label = { Text("Notes") }, minLines = 3, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp))

                    // Favorite
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                        Text("Mark as favorite", modifier = Modifier.weight(1f))
                        Switch(checked = isFavorite, onCheckedChange = { isFavorite = it })
                    }

                    Spacer(Modifier.height(8.dp))
                    LoadingButton(
                        text = if (isEdit) "Save Changes" else "Save Entry",
                        loading = loading,
                        enabled = title.isNotBlank(),
                        onClick = {
                            scope.launch {
                                loading = true; error = ""
                                try {
                                    val mek = vm.mek ?: throw Exception("Not unlocked")
                                    val v = vault ?: throw Exception("Vault not found")
                                    val cek = CryptoService.unwrapCEK(v.cekEnvelope, mek)
                                    val data = EntryData(title = title.trim(), fields = fields.filter { it.value.isNotEmpty() }, notes = notes.ifBlank { null }, isFavorite = isFavorite)
                                    val encrypted = CryptoService.encryptEntry(data, cek)
                                    if (isEdit && editEntryId != null) {
                                        ApiService.updateEntry(vaultId, editEntryId, title = title.trim(), encryptedData = encrypted)
                                    } else {
                                        val sortOrder = ApiService.listEntries(vaultId).size
                                        ApiService.createEntry(vaultId, selectedType, title.trim(), encrypted, sortOrder)
                                    }
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
}
