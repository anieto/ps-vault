package dev.psvault.app.ui.screens.contacts

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import dev.psvault.app.api.ApiService
import dev.psvault.app.models.Beneficiary
import dev.psvault.app.ui.components.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewBeneficiaryScreen(nav: NavController, editBeneficiaryId: String? = null) {
    val scope = rememberCoroutineScope()
    val isEdit = editBeneficiaryId != null
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var relationship by remember { mutableStateOf("") }
    var secretQuestion by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var initialLoading by remember { mutableStateOf(isEdit) }
    var error by remember { mutableStateOf("") }
    var saved by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        if (isEdit && editBeneficiaryId != null) {
            try {
                val b = ApiService.listBeneficiaries().firstOrNull { it.id == editBeneficiaryId }
                b?.let {
                    name = it.name; email = it.email
                    relationship = it.relationship ?: ""; secretQuestion = it.secretQuestion ?: ""
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
                                            secretQuestion = secretQuestion.ifBlank { null }
                                        )
                                    } else {
                                        ApiService.createBeneficiary(
                                            name = name.trim(), email = email.trim(),
                                            relationship = relationship.ifBlank { null },
                                            secretQuestion = secretQuestion.ifBlank { null }
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
