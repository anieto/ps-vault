package dev.psvault.app.ui.screens.contacts

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
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
import dev.psvault.app.models.Beneficiary
import dev.psvault.app.models.TrustedContact
import dev.psvault.app.ui.ContactRoute
import dev.psvault.app.ui.components.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ContactsScreen(nav: NavController) {
    val vm = LocalAppViewModel.current
    var selectedTab by remember { mutableIntStateOf(0) }
    var beneficiaries by remember { mutableStateOf<List<Beneficiary>>(emptyList()) }
    var trustedContacts by remember { mutableStateOf<List<TrustedContact>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        try {
            beneficiaries = ApiService.listBeneficiaries()
            trustedContacts = ApiService.listTrustedContacts()
        } catch (e: Exception) { error = e.message ?: "Failed to load" }
        finally { loading = false }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Contacts", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold)) },
                actions = {
                    IconButton(onClick = {
                        if (selectedTab == 0) nav.navigate(ContactRoute.NewBeneficiary.route)
                        else nav.navigate(ContactRoute.NewTrustedContact.route)
                    }) { Icon(Icons.Default.Add, "Add") }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        },
        containerColor = Color.Transparent
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize()) {
            GradientBackground()
            BrandGradientOverlay(brandColor = vm.brandColor)
            Column(modifier = Modifier.fillMaxSize().padding(padding)) {
                TabRow(selectedTabIndex = selectedTab, containerColor = Color.Transparent) {
                    Tab(selected = selectedTab == 0, onClick = { selectedTab = 0 }, text = { Text("Beneficiaries") })
                    Tab(selected = selectedTab == 1, onClick = { selectedTab = 1 }, text = { Text("Trusted Contacts") })
                }
                if (loading) {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        contentPadding = PaddingValues(vertical = 12.dp)
                    ) {
                        if (error.isNotEmpty()) item { ErrorBanner(error) }
                        if (selectedTab == 0) {
                            if (beneficiaries.isEmpty()) {
                                item { EmptyState("No beneficiaries yet", "Add someone who will receive access to your vaults") }
                            }
                            items(beneficiaries) { b ->
                                VaultCard(modifier = Modifier.clickable { nav.navigate(ContactRoute.BeneficiaryDetail.route(b.id)) }) {
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                        ContactAvatar(name = b.name, photoData = b.photoData)
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(b.name, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold))
                                            Text(b.email, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                            b.relationship?.let {
                                                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                            }
                                        }
                                        if (!b.emailConfirmed) {
                                            Surface(color = MaterialTheme.colorScheme.surfaceVariant, shape = MaterialTheme.shapes.small) {
                                                Text("Invited", modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                            }
                                        }
                                    }
                                }
                            }
                        } else {
                            if (trustedContacts.isEmpty()) {
                                item { EmptyState("No trusted contacts yet", "Add someone who can verify your status or abort the switch") }
                            }
                            items(trustedContacts) { tc ->
                                VaultCard(modifier = Modifier.clickable { nav.navigate(ContactRoute.TrustedContactDetail.route(tc.id)) }) {
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                        ContactAvatar(name = tc.name, photoData = tc.photoData)
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(tc.name, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold))
                                            Text(tc.email, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        }
                                        Column(horizontalAlignment = Alignment.End) {
                                            if (tc.canAbort) PermissionBadge("Can abort")
                                            if (tc.notifyOnFinalWarning) PermissionBadge("Final warning")
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
}

@Composable
private fun EmptyState(title: String, subtitle: String) {
    Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun PermissionBadge(label: String) {
    Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = MaterialTheme.shapes.small) {
        Text(label, modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onPrimaryContainer)
    }
}
