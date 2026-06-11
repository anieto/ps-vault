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
import androidx.compose.material.icons.filled.PhotoCamera
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
import dev.psvault.app.ui.components.*
import kotlinx.coroutines.launch
import java.io.ByteArrayOutputStream

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewTrustedContactScreen(nav: NavController) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var photoData by remember { mutableStateOf<String?>(null) }
    var notifyOnFinalWarning by remember { mutableStateOf(false) }
    var canAbort by remember { mutableStateOf(false) }
    var canVerifyLife by remember { mutableStateOf(false) }
    var canCorroborateDeath by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }

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
                Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    Box(contentAlignment = Alignment.BottomEnd) {
                        ContactAvatar(name = name.ifBlank { "?" }, photoData = photoData, size = 72.dp)
                        Surface(
                            shape = CircleShape,
                            color = MaterialTheme.colorScheme.surface,
                            modifier = Modifier.size(28.dp)
                        ) {
                            IconButton(
                                onClick = { photoLauncher.launch("image/*") },
                                modifier = Modifier.size(28.dp)
                            ) {
                                Icon(Icons.Default.PhotoCamera, "Choose photo", modifier = Modifier.size(14.dp))
                            }
                        }
                    }
                }
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
                                    photoData = photoData,
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
