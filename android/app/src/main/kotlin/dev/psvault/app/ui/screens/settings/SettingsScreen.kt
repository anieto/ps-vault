package dev.psvault.app.ui.screens.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import dev.psvault.app.LocalAppViewModel
import dev.psvault.app.api.ApiService
import dev.psvault.app.ui.SettingsRoute
import dev.psvault.app.ui.components.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(nav: NavController) {
    val vm = LocalAppViewModel.current
    val scope = rememberCoroutineScope()
    var showSignOutDialog by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold)) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        },
        containerColor = Color.Transparent
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize()) {
            GradientBackground()
            BrandGradientOverlay(brandColor = vm.brandColor)
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
                contentPadding = PaddingValues(vertical = 12.dp)
            ) {
                item {
                    vm.user?.let { user ->
                        VaultCard(modifier = Modifier.padding(bottom = 16.dp)) {
                            Text(user.displayName, style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold))
                            Text(user.email, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            if (user.role == "admin") {
                                Spacer(Modifier.height(4.dp))
                                Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = MaterialTheme.shapes.small) {
                                    Text("Admin", modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onPrimaryContainer)
                                }
                            }
                        }
                    }
                }

                item { SectionHeader("Configuration") }
                item { SettingsRow("Server", Icons.Default.Cloud, nav, SettingsRoute.Server.route) }
                item { SettingsRow("Security & App Lock", Icons.Default.Security, nav, SettingsRoute.Security.route) }
                item { SettingsRow("Sessions", Icons.Default.DevicesOther, nav, SettingsRoute.Sessions.route) }
                item { SettingsRow("Appearance", Icons.Default.Palette, nav, SettingsRoute.Appearance.route) }

                item { SectionHeader("Emergency Switch") }
                item { SettingsRow("Switch Settings", Icons.Default.NotificationsActive, nav, SettingsRoute.Switch.route) }

                item { SectionHeader("Account") }
                item { SettingsRow("Account", Icons.Default.Person, nav, SettingsRoute.Account.route) }
                if (vm.user?.role == "admin") {
                    item { SettingsRow("Admin", Icons.Default.AdminPanelSettings, nav, SettingsRoute.Admin.route) }
                }

                item {
                    Spacer(Modifier.height(16.dp))
                    OutlinedButton(
                        onClick = { showSignOutDialog = true },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error)
                    ) { Text("Sign Out") }
                    Spacer(Modifier.height(24.dp))
                    Text(
                        "P.S. Vault — v1.0.0",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.fillMaxWidth().wrapContentWidth(Alignment.CenterHorizontally)
                    )
                }
            }
        }
    }

    if (showSignOutDialog) {
        ConfirmDialog(
            title = "Sign Out",
            message = "You'll need to sign in again. Your encrypted data remains on the server.",
            confirmText = "Sign Out",
            confirmColor = MaterialTheme.colorScheme.error,
            onConfirm = {
                showSignOutDialog = false
                scope.launch {
                    try {
                        val rt = dev.psvault.app.storage.SecureStorage.getString(dev.psvault.app.storage.SecureStorage.Key.REFRESH_TOKEN)
                        rt?.let { ApiService.logout(it) }
                    } catch (_: Exception) {}
                    vm.signOut()
                }
            },
            onDismiss = { showSignOutDialog = false }
        )
    }
}

@Composable
fun SettingsRow(label: String, icon: ImageVector, nav: NavController, route: String) {
    Row(
        modifier = Modifier.fillMaxWidth().clickable { nav.navigate(route) }.padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, null, modifier = Modifier.size(22.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.width(16.dp))
        Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        Icon(Icons.Default.ChevronRight, null, modifier = Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f))
}
