package dev.psvault.app.ui.screens.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import dev.psvault.app.LocalAppViewModel
import dev.psvault.app.api.ApiService
import dev.psvault.app.ui.components.*
import kotlinx.coroutines.launch

private val accentPresets = listOf(
    "#5B8DEF", "#4CAF82", "#E07C3A", "#CF5F8B",
    "#8B5CF6", "#EC4899", "#14B8A6", "#F59E0B"
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminSettingsScreen(nav: NavController) {
    val vm = LocalAppViewModel.current
    val scope = rememberCoroutineScope()
    var accentHex by remember { mutableStateOf(vm.accentHex) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var saved by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Admin", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold)) },
                navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        },
        containerColor = Color.Transparent
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize()) {
            GradientBackground()
            Column(
                modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                ErrorBanner(error)
                if (saved) {
                    Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = MaterialTheme.shapes.medium, modifier = Modifier.fillMaxWidth()) {
                        Text("Accent color updated", modifier = Modifier.padding(12.dp), color = MaterialTheme.colorScheme.onPrimaryContainer)
                    }
                }

                SectionHeader("Accent Color")
                VaultCard {
                    Text("Choose the brand accent color shown to all users.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(12.dp))
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(4),
                        modifier = Modifier.height(100.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(accentPresets) { hex ->
                            val selected = accentHex.equals(hex, ignoreCase = true)
                            Box(
                                modifier = Modifier
                                    .size(40.dp)
                                    .clip(CircleShape)
                                    .background(parseHexColor(hex))
                                    .then(if (selected) Modifier.border(3.dp, MaterialTheme.colorScheme.onSurface, CircleShape) else Modifier)
                                    .clickable { accentHex = hex; saved = false }
                            )
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = accentHex,
                        onValueChange = { accentHex = it; saved = false },
                        label = { Text("Custom hex (e.g. #5B8DEF)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        trailingIcon = {
                            Box(modifier = Modifier.size(28.dp).clip(CircleShape).background(try { parseHexColor(accentHex) } catch (_: Exception) { Color.Gray }))
                        }
                    )
                    Spacer(Modifier.height(12.dp))
                    LoadingButton(
                        text = "Save Accent Color",
                        loading = saving,
                        enabled = accentHex.isNotBlank(),
                        onClick = {
                            scope.launch {
                                saving = true; error = ""
                                try {
                                    val hex = accentHex.trim().let { if (!it.startsWith("#")) "#$it" else it }
                                    ApiService.updateAccentColor(hex)
                                    vm.updateBranding(hex, vm.loginCountsAsCheckin)
                                    saved = true
                                } catch (e: Exception) { error = e.message ?: "Failed" }
                                finally { saving = false }
                            }
                        }
                    )
                }
            }
        }
    }
}

private fun parseHexColor(hex: String): Color {
    return try {
        var h = hex.trim()
        if (!h.startsWith("#")) h = "#$h"
        if (h.length == 7) {
            val r = h.substring(1, 3).toInt(16) / 255f
            val g = h.substring(3, 5).toInt(16) / 255f
            val b = h.substring(5, 7).toInt(16) / 255f
            Color(r, g, b)
        } else Color.Gray
    } catch (e: Exception) { Color.Gray }
}
