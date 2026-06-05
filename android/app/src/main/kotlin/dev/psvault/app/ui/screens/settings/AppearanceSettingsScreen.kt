package dev.psvault.app.ui.screens.settings

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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import dev.psvault.app.LocalAppViewModel
import dev.psvault.app.ui.components.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppearanceSettingsScreen(nav: NavController) {
    val vm = LocalAppViewModel.current

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Appearance", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold)) },
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
                    .padding(padding).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                SectionHeader("Theme")
                VaultCard {
                    Text("Color scheme", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium))
                    Spacer(Modifier.height(12.dp))
                    val options = listOf("System" to "system", "Light" to "light", "Dark" to "dark")
                    options.forEach { (label, value) ->
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(
                                selected = vm.colorScheme == value,
                                onClick = { vm.updateColorScheme(value) }
                            )
                            Text(label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(start = 8.dp))
                        }
                    }
                }
            }
        }
    }
}
