package dev.psvault.app.ui.screens.contacts

import android.graphics.BitmapFactory
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import dev.psvault.app.models.Beneficiary
import dev.psvault.app.ui.components.*
import kotlinx.coroutines.launch
import java.io.ByteArrayOutputStream

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewBeneficiaryScreen(nav: NavController, editBeneficiaryId: String? = null) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val isEdit = editBeneficiaryId != null
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var relationship by remember { mutableStateOf("") }
    var secretQuestion by remember { mutableStateOf("") }
    var photoData by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    var initialLoading by remember { mutableStateOf(isEdit) }
    var error by remember { mutableStateOf("") }
    var saved by remember { mutableStateOf(false) }

    val photoLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) {
            val bytes = context.contentResolver.openInputStream(uri)?.readBytes() ?: return@rememberLauncherForActivityResult
            val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return@rememberLauncherForActivityResult
            val scaled = android.graphics.Bitmap.createScaledBitmap(bitmap, 256, 256, true)
            val baos = ByteArrayOutputStream()
            scaled.compress(android.graphics.Bitmap.CompressFormat.JPEG, 80, baos)
            photoData = "data:image/jpeg;base64," + Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP)
        }
    }

    LaunchedEffect(Unit) {
        if (isEdit && editBeneficiaryId != null) {
            try {
                val b = ApiService.listBeneficiaries().firstOrNull { it.id == editBeneficiaryId }
                b?.let {
                    name = it.name; email = it.email
                    relationship = it.relationship ?: ""; secretQuestion = it.secretQuestion ?: ""
                    photoData = it.photoData
                }
            } catch (e: Exception) { error = e.message ?: "Failed to load" }
            finally { initialLoading = false }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (isEdit) "Edit Beneficiary" else "New Beneficiary", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold)) },
                navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        },
        containerColor = Color.Transparent
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize()) {
            GradientBackground()
            if (initialLoading) {
                Box(Modifier.fillMaxSize(), contentAlignment = androidx.compose.ui.Alignment.Center) { CircularProgressIndicator() }
            } else {
                Column(
                    modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                        .padding(padding).padding(16.dp).imePadding(),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    if (saved) {
                        Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                            Text("Saved successfully", modifier = Modifier.padding(12.dp), color = MaterialTheme.colorScheme.onPrimaryContainer)
                        }
                    }
                    ErrorBanner(error)
                    Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                        Box(contentAlignment = Alignment.BottomEnd) {
                            ContactAvatar(name = name.ifBlank { "?" }, photoData = photoData, size = 72.dp)
                            Surface(shape = CircleShape, color = MaterialTheme.colorScheme.surface, modifier = Modifier.size(28.dp)) {
                                IconButton(onClick = { photoLauncher.launch("image/*") }, modifier = Modifier.size(28.dp)) {
                                    Icon(Icons.Default.PhotoCamera, "Choose photo", modifier = Modifier.size(14.dp))
                                }
                            }
                        }
                    }
                    AuthField(value = name, onValueChange = { name = it; error = "" }, label = "Full Name")
                    AuthField(value = email, onValueChange = { email = it; error = "" }, label = "Email")
                    AuthField(value = relationship, onValueChange = { relationship = it }, label = "Relationship (optional)")
                    AuthField(value = secretQuestion, onValueChange = { secretQuestion = it }, label = "Secret question (optional)")
                    Text(
                        "The secret question answer is used as a shared secret to encrypt vault access keys for this beneficiary.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(4.dp))
                    LoadingButton(
                        text = if (isEdit) "Save Changes" else "Add Beneficiary",
                        loading = loading,
                        enabled = name.isNotBlank() && email.isNotBlank(),
                        onClick = {
                            scope.launch {
                                loading = true; error = ""; saved = false
                                try {
                                    if (isEdit && editBeneficiaryId != null) {
                                        ApiService.updateBeneficiary(
                                            editBeneficiaryId,
                                            name = name.trim(), email = email.trim(),
                                            relationship = relationship.ifBlank { null },
                                            secretQuestion = secretQuestion.ifBlank { null },
                                            photoData = photoData
                                        )
                                    } else {
                                        ApiService.createBeneficiary(
                                            name = name.trim(), email = email.trim(),
                                            relationship = relationship.ifBlank { null },
                                            secretQuestion = secretQuestion.ifBlank { null },
                                            photoData = photoData
                                        )
                                    }
                                    saved = true
                                    if (!isEdit) nav.popBackStack()
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
