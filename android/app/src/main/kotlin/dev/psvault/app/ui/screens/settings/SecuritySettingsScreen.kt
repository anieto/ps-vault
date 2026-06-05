package dev.psvault.app.ui.screens.settings

import android.os.Build
import androidx.biometric.BiometricManager
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import dev.psvault.app.LocalAppViewModel
import dev.psvault.app.ui.components.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SecuritySettingsScreen(nav: NavController) {
    val vm = LocalAppViewModel.current
    val context = LocalContext.current
    val canUseBiometric = remember {
        BiometricManager.from(context)
            .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) ==
            BiometricManager.BIOMETRIC_SUCCESS
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Security", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold)) },
                navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        },
        containerColor = Color.Transparent
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize()) {
            GradientBackground()
            Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(padding).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                SectionHeader("App Lock")
                VaultCard {
                    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Biometric unlock", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium))
                            Text(
                                if (canUseBiometric) "Use fingerprint or face to unlock" else "Not available on this device",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Switch(
                            checked = vm.biometricEnabled,
                            onCheckedChange = { vm.updateBiometricEnabled(it) },
                            enabled = canUseBiometric
                        )
                    }
                }

                SectionHeader("Lock Timeout")
                VaultCard {
                    Text("Lock after", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium))
                    Spacer(Modifier.height(8.dp))
                    val options = listOf(0 to "Immediately", 30 to "30 seconds", 60 to "1 minute", 300 to "5 minutes", 900 to "15 minutes", 3600 to "1 hour")
                    options.forEach { (seconds, label) ->
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(selected = vm.lockTimeoutSeconds == seconds, onClick = { vm.setLockTimeout(seconds) })
                            Text(label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(start = 8.dp))
                        }
                    }
                }

                SectionHeader("Clipboard")
                VaultCard {
                    Text("Clear clipboard after", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium))
                    Spacer(Modifier.height(8.dp))
                    val options = listOf(0 to "Never", 15 to "15 seconds", 30 to "30 seconds", 60 to "1 minute", 120 to "2 minutes")
                    options.forEach { (seconds, label) ->
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(selected = vm.clipboardTimeoutSeconds == seconds, onClick = { vm.setClipboardTimeout(seconds) })
                            Text(label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(start = 8.dp))
                        }
                    }
                }
            }
        }
    }
}
