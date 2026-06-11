package dev.psvault.app.ui.screens.contacts

import android.graphics.BitmapFactory
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import dev.psvault.app.api.ApiService
import dev.psvault.app.models.TrustedContact
import dev.psvault.app.ui.components.*
import kotlinx.coroutines.launch
import java.io.ByteArrayOutputStream

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TrustedContactDetailScreen(contactId: String, nav: NavController) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var contact by remember { mutableStateOf<TrustedContact?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf("") }
    var showDeleteDialog by remember { mutableStateOf(false) }
    var menuExpanded by remember { mutableStateOf(false) }

    // Edit state
    var editMode by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var photoData by remember { mutableStateOf<String?>(null) }
    var notifyOnFinalWarning by remember { mutableStateOf(false) }
    var canAbort by remember { mutableStateOf(false) }
    var canVerifyLife by remember { mutableStateOf(false) }
    var canCorroborateDeath by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }

    val photoLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) {
            val bytes = context.contentResolver.openInputStream(uri)?.readBytes() ?: return@rememberLauncherForActivityResult
            val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return@rememberLauncherForActivityResult
            val size = 256
            val scaled = android.graphics.Bitmap.createScaledBitmap(bitmap, size, size, true)
            val baos = ByteArrayOutputStream()
            scaled.compress(android.graphics.Bitmap.CompressFormat.JPEG, 80, baos)
            photoData = "data:image/jpeg;base64," + Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP)
        }
    }

    fun loadContact(tc: TrustedContact) {
        name = tc.name; phone = tc.phone ?: ""; photoData = tc.photoData
        notifyOnFinalWarning = tc.notifyOnFinalWarning; canAbort = tc.canAbort
        canVerifyLife = tc.canVerifyLife; canCorroborateDeath = tc.canCorroborateDeath
    }

    LaunchedEffect(Unit) {
        try {
            contact = ApiService.listTrustedContacts().firstOrNull { it.id == contactId }
            contact?.let { loadContact(it) }
        } catch (e: Exception) { error = e.message ?: "Failed to load" }
        finally { loading = false }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(contact?.name ?: "Trusted Contact", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold)) },
                navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } },
                actions = {
                    if (editMode) {
                        TextButton(onClick = { editMode = false; contact?.let { loadContact(it) } }) { Text("Cancel") }
                        TextButton(
                            onClick = {
                                scope.launch {
                                    saving = true
                                    try {
                                        val updated = ApiService.updateTrustedContact(
                                            contactId, name = name.ifBlank { null }, phone = phone.ifBlank { null },
                                            photoData = photoData,
                                            notifyOnFinalWarning = notifyOnFinalWarning, canAbort = canAbort,
                                            canVerifyLife = canVerifyLife, canCorroborateDeath = canCorroborateDeath
                                        )
                                        contact = updated; editMode = false
                                    } catch (e: Exception) { error = e.message ?: "Save failed" }
                                    finally { saving = false }
                                }
                            }
                        ) { if (saving) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp) else Text("Save") }
                    } else {
                        Box {
                            IconButton(onClick = { menuExpanded = true }) { Icon(Icons.Default.MoreVert, "More") }
                            DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
                                DropdownMenuItem(text = { Text("Edit") }, onClick = { menuExpanded = false; editMode = true })
                                DropdownMenuItem(text = { Text("Delete", color = MaterialTheme.colorScheme.error) }, onClick = { menuExpanded = false; showDeleteDialog = true })
                            }
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
                    contact?.let { tc ->
                        Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                            if (editMode) {
                                Box(contentAlignment = Alignment.BottomEnd) {
                                    ContactAvatar(name = name.ifBlank { tc.name }, photoData = photoData, size = 72.dp)
                                    Surface(shape = CircleShape, color = MaterialTheme.colorScheme.surface, modifier = Modifier.size(28.dp)) {
                                        IconButton(onClick = { photoLauncher.launch("image/*") }, modifier = Modifier.size(28.dp)) {
                                            Icon(Icons.Default.PhotoCamera, "Change photo", modifier = Modifier.size(14.dp))
                                        }
                                    }
                                }
                            } else {
                                ContactAvatar(name = tc.name, photoData = tc.photoData, size = 72.dp)
                            }
                        }
                        VaultCard {
                            if (editMode) {
                                AuthField(value = name, onValueChange = { name = it }, label = "Name")
                                Spacer(Modifier.height(8.dp))
                                AuthField(value = phone, onValueChange = { phone = it }, label = "Phone (optional)")
                            } else {
                                InfoRow("Name", tc.name)
                                InfoRow("Email", tc.email)
                                tc.phone?.let { InfoRow("Phone", it) }
                            }
                        }

                        SectionHeader("Permissions")
                        VaultCard {
                            PermissionToggle("Notify on final warning", "Receives an email before the Emergency Switch fires", notifyOnFinalWarning, editMode) { notifyOnFinalWarning = it }
                            PermissionToggle("Can abort switch", "Can submit an abort request on your behalf", canAbort, editMode) { canAbort = it }
                            PermissionToggle("Can verify life", "Can confirm you are alive", canVerifyLife, editMode) { canVerifyLife = it }
                            PermissionToggle("Can corroborate death", "Can submit a death report", canCorroborateDeath, editMode) { canCorroborateDeath = it }
                        }
                    }
                }
            }
        }
    }

    if (showDeleteDialog) {
        ConfirmDialog(
            title = "Remove Trusted Contact",
            message = "Remove ${contact?.name}?",
            confirmText = "Remove",
            confirmColor = MaterialTheme.colorScheme.error,
            onConfirm = {
                showDeleteDialog = false
                scope.launch {
                    try { ApiService.deleteTrustedContact(contactId); nav.popBackStack() }
                    catch (e: Exception) { error = e.message ?: "Delete failed" }
                }
            },
            onDismiss = { showDeleteDialog = false }
        )
    }
}

@Composable
private fun PermissionToggle(title: String, subtitle: String, checked: Boolean, editable: Boolean, onToggle: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium))
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (editable) {
            Switch(checked = checked, onCheckedChange = onToggle)
        } else {
            Icon(
                if (checked) Icons.Default.CheckCircle else Icons.Default.Cancel,
                null,
                tint = if (checked) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline,
                modifier = Modifier.size(20.dp)
            )
        }
    }
}
