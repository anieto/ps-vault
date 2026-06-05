package dev.psvault.app.ui.screens

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import dev.psvault.app.LocalAppViewModel
import dev.psvault.app.api.ApiService
import dev.psvault.app.ui.ContactRoute
import dev.psvault.app.ui.SettingsRoute
import dev.psvault.app.ui.VaultRoute
import dev.psvault.app.ui.screens.contacts.*
import dev.psvault.app.ui.screens.dashboard.DashboardScreen
import dev.psvault.app.ui.screens.settings.*
import dev.psvault.app.ui.screens.vaults.*
import kotlinx.coroutines.launch

private data class TabItem(val route: String, val label: String, val icon: ImageVector)

private val tabs = listOf(
    TabItem("dashboard", "Dashboard", Icons.Default.Home),
    TabItem("vaults", "Vaults", Icons.Default.Lock),
    TabItem("contacts", "Contacts", Icons.Default.People),
    TabItem("settings", "Settings", Icons.Default.Settings)
)

@Composable
fun MainScreen() {
    val vm = LocalAppViewModel.current
    val scope = rememberCoroutineScope()

    // Each tab has its own NavController for independent back stacks
    val dashboardNav = rememberNavController()
    val vaultsNav = rememberNavController()
    val contactsNav = rememberNavController()
    val settingsNav = rememberNavController()

    // Fetch branding on first load
    LaunchedEffect(Unit) {
        try {
            val branding = ApiService.getBranding()
            vm.updateBranding(branding.accentColor, branding.loginCountsAsCheckin != "false")
        } catch (_: Exception) {}
    }

    val navControllers = mapOf(
        "dashboard" to dashboardNav,
        "vaults" to vaultsNav,
        "contacts" to contactsNav,
        "settings" to settingsNav
    )

    Scaffold(
        bottomBar = {
            NavigationBar {
                tabs.forEach { tab ->
                    val backStack by (navControllers[tab.route] ?: dashboardNav)
                        .currentBackStackEntryAsState()
                    val selected = vm.selectedTab == tab.route
                    NavigationBarItem(
                        selected = selected,
                        onClick = {
                            if (vm.selectedTab == tab.route) {
                                navControllers[tab.route]?.popBackStack(tab.route, false)
                            }
                            vm.selectedTab = tab.route
                        },
                        icon = { Icon(tab.icon, contentDescription = tab.label) },
                        label = { Text(tab.label) }
                    )
                }
            }
        }
    ) { padding ->
        Box(modifier = Modifier.padding(bottom = padding.calculateBottomPadding()).consumeWindowInsets(WindowInsets.navigationBars)) {
        // Show only the active tab, but keep all alive
        when (vm.selectedTab) {
            "dashboard" -> NavHost(dashboardNav, startDestination = "dashboard", modifier = androidx.compose.ui.Modifier) {
                composable("dashboard") { DashboardScreen() }
            }
            "vaults" -> NavHost(vaultsNav, startDestination = VaultRoute.List.route) {
                composable(VaultRoute.List.route) { VaultListScreen(vaultsNav) }
                composable(VaultRoute.Detail.route) { back ->
                    val vaultId = back.arguments?.getString("vaultId") ?: return@composable
                    VaultDetailScreen(vaultId, vaultsNav)
                }
                composable(VaultRoute.EntryDetail.route) { back ->
                    val vaultId = back.arguments?.getString("vaultId") ?: return@composable
                    val entryId = back.arguments?.getString("entryId") ?: return@composable
                    EntryDetailScreen(vaultId, entryId, vaultsNav)
                }
                composable(VaultRoute.NewEntry.route) { back ->
                    val vaultId = back.arguments?.getString("vaultId") ?: return@composable
                    NewEntryScreen(vaultId, vaultsNav)
                }
                composable(VaultRoute.EditEntry.route) { back ->
                    val vaultId = back.arguments?.getString("vaultId") ?: return@composable
                    val entryId = back.arguments?.getString("entryId") ?: return@composable
                    NewEntryScreen(vaultId, vaultsNav, editEntryId = entryId)
                }
                composable(VaultRoute.BeneficiarySelection.route) { back ->
                    val vaultId = back.arguments?.getString("vaultId") ?: return@composable
                    BeneficiarySelectionScreen(vaultId, vaultsNav)
                }
            }
            "contacts" -> NavHost(contactsNav, startDestination = ContactRoute.List.route) {
                composable(ContactRoute.List.route) { ContactsScreen(contactsNav) }
                composable(ContactRoute.BeneficiaryDetail.route) { back ->
                    val id = back.arguments?.getString("beneficiaryId") ?: return@composable
                    BeneficiaryDetailScreen(id, contactsNav)
                }
                composable(ContactRoute.NewBeneficiary.route) {
                    NewBeneficiaryScreen(contactsNav)
                }
                composable(ContactRoute.EditBeneficiary.route) { back ->
                    val id = back.arguments?.getString("beneficiaryId") ?: return@composable
                    NewBeneficiaryScreen(contactsNav, editBeneficiaryId = id)
                }
                composable(ContactRoute.TrustedContactDetail.route) { back ->
                    val id = back.arguments?.getString("contactId") ?: return@composable
                    TrustedContactDetailScreen(id, contactsNav)
                }
                composable(ContactRoute.NewTrustedContact.route) {
                    NewTrustedContactScreen(contactsNav)
                }
            }
            "settings" -> NavHost(settingsNav, startDestination = SettingsRoute.Root.route) {
                composable(SettingsRoute.Root.route) { SettingsScreen(settingsNav) }
                composable(SettingsRoute.Server.route) { ServerSettingsScreen(settingsNav) }
                composable(SettingsRoute.Security.route) { SecuritySettingsScreen(settingsNav) }
                composable(SettingsRoute.Sessions.route) { SessionsSettingsScreen(settingsNav) }
                composable(SettingsRoute.Account.route) { AccountSettingsScreen(settingsNav) }
                composable(SettingsRoute.Switch.route) { SwitchSettingsScreen(settingsNav) }
                composable(SettingsRoute.Appearance.route) { AppearanceSettingsScreen(settingsNav) }
                composable(SettingsRoute.Admin.route) { AdminSettingsScreen(settingsNav) }
            }
        }
        } // end Box
    }
}
