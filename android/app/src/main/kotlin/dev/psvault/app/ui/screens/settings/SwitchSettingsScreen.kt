package dev.psvault.app.ui.screens.settings

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import dev.psvault.app.api.ApiService
import dev.psvault.app.models.SwitchSettings
import dev.psvault.app.ui.components.*
import kotlinx.coroutines.launch
import java.time.Instant
import java.util.TimeZone

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SwitchSettingsScreen(nav: NavController) {
    val scope = rememberCoroutineScope()
    var settings by remember { mutableStateOf<SwitchSettings?>(null) }
    var loading by remember { mutableStateOf(true) }
    var actionLoading by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var saved by remember { mutableStateOf(false) }

    // Editable timing fields
    var intervalDays by remember { mutableStateOf(30) }
    var abortWindowHours by remember { mutableStateOf(72) }
    var reminders by remember { mutableStateOf(listOf(72, 24, 4)) }
    var preferredHour by remember { mutableStateOf(9) }
    var usePreferredHour by remember { mutableStateOf(false) }

    // Dialog state
    var showPauseDialog by remember { mutableStateOf(false) }
    var showCheckinConfirm by remember { mutableStateOf(false) }
    var showDisableConfirm by remember { mutableStateOf(false) }
    var showAbortConfirm by remember { mutableStateOf(false) }
    var showRevokeConfirm by remember { mutableStateOf(false) }

    fun applySettings(sw: SwitchSettings) {
        intervalDays = sw.checkInIntervalDays
        abortWindowHours = sw.abortWindowHours
        reminders = listOfNotNull(sw.reminder1HoursBefore, sw.reminder2HoursBefore, sw.reminder3HoursBefore)
        preferredHour = sw.preferredCheckinHour ?: 9
        usePreferredHour = sw.preferredCheckinHour != null
    }

    LaunchedEffect(Unit) {
        try {
            val sw = ApiService.getSwitchSettings()
            settings = sw
            applySettings(sw)
        } catch (e: Exception) { error = e.message ?: "Failed to load" }
        finally { loading = false }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Emergency Switch", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold)) },
                navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } },
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
                    modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                        .padding(padding).padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    ErrorBanner(error)
                    if (saved) {
                        Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = MaterialTheme.shapes.medium, modifier = Modifier.fillMaxWidth()) {
                            Text("Settings saved", modifier = Modifier.padding(12.dp), color = MaterialTheme.colorScheme.onPrimaryContainer)
                        }
                    }

                    settings?.let { sw ->
                        // Status section
                        SectionHeader("Status")
                        VaultCard {
                            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        statusLabel(sw),
                                        style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                                        color = statusColor(sw)
                                    )
                                }
                                Surface(
                                    color = if (sw.isActive) Color(0x1F4CAF50) else MaterialTheme.colorScheme.surfaceVariant,
                                    shape = MaterialTheme.shapes.small
                                ) {
                                    Text(
                                        if (sw.isActive) "Active" else "Inactive",
                                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                                        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Medium),
                                        color = if (sw.isActive) Color(0xFF4CAF50) else MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }

                            if (sw.status == "active") {
                                sw.nextCheckinDeadline?.let { deadline ->
                                    Spacer(Modifier.height(8.dp))
                                    StatusInfoRow("Next check-in due", formatRelativeDate(deadline))
                                }
                            }
                            sw.lastCheckinAt?.let { last ->
                                StatusInfoRow("Last check-in", formatRelativeDate(last))
                            }
                            if (sw.status == "paused") {
                                sw.pausedUntil?.let { until ->
                                    StatusInfoRow("Resumes", formatRelativeDate(until))
                                } ?: StatusInfoRow("Paused", "Indefinitely")
                            }
                            if (sw.status == "triggered") {
                                sw.abortDeadline?.let { deadline ->
                                    Spacer(Modifier.height(8.dp))
                                    Surface(color = MaterialTheme.colorScheme.errorContainer, shape = MaterialTheme.shapes.small, modifier = Modifier.fillMaxWidth()) {
                                        Text(
                                            "Delivery will begin ${formatRelativeDate(deadline)} unless you abort.",
                                            modifier = Modifier.padding(10.dp),
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.error
                                        )
                                    }
                                }
                            }
                        }

                        // Actions section
                        SectionHeader("Actions")
                        VaultCard {
                            when (sw.status) {
                                "active" -> {
                                    ActionRow("Check In Now", "Reset your check-in deadline") {
                                        showCheckinConfirm = true
                                    }
                                    Spacer(Modifier.height(4.dp))
                                    ActionRow("Pause Switch", "Pause during planned absences") {
                                        showPauseDialog = true
                                    }
                                    Spacer(Modifier.height(4.dp))
                                    ActionRow("Disable Switch", "Stop monitoring", color = MaterialTheme.colorScheme.error) {
                                        showDisableConfirm = true
                                    }
                                }
                                "paused" -> {
                                    ActionRow(if (actionLoading) "Resuming…" else "Resume Switch", "Restart check-in monitoring") {
                                        if (!actionLoading) scope.launch {
                                            actionLoading = true; error = ""
                                            try { settings = ApiService.resumeSwitch(); settings?.let { applySettings(it) } }
                                            catch (e: Exception) { error = e.message ?: "Failed" }
                                            finally { actionLoading = false }
                                        }
                                    }
                                }
                                "inactive" -> {
                                    ActionRow(if (actionLoading) "Activating…" else "Activate Switch", "Start monitoring for check-ins") {
                                        if (!actionLoading) scope.launch {
                                            actionLoading = true; error = ""
                                            try { settings = ApiService.updateSwitchSettings(isActive = true); settings?.let { applySettings(it) } }
                                            catch (e: Exception) { error = e.message ?: "Failed" }
                                            finally { actionLoading = false }
                                        }
                                    }
                                }
                                "triggered" -> {
                                    val abortOpen = sw.abortDeadline?.let { isInFuture(it) } ?: false
                                    if (abortOpen) {
                                        ActionRow("I'm here — Abort Delivery", "Cancel delivery and reset timer", color = MaterialTheme.colorScheme.error) {
                                            showAbortConfirm = true
                                        }
                                    } else {
                                        ActionRow("Revoke & Reset", "Invalidate active delivery links", color = MaterialTheme.colorScheme.error) {
                                            showRevokeConfirm = true
                                        }
                                    }
                                }
                                "delivered" -> {
                                    ActionRow("Revoke Access & Reset", "Invalidate delivery links and restart switch", color = MaterialTheme.colorScheme.error) {
                                        showRevokeConfirm = true
                                    }
                                }
                            }
                        }

                        // Timing section
                        SectionHeader("Timing Configuration")
                        VaultCard {
                            NumberPickerRow("Check-in interval (days)", intervalDays, 1, 365) { intervalDays = it; saved = false }
                            Spacer(Modifier.height(8.dp))
                            NumberPickerRow("Abort window (hours after trigger)", abortWindowHours, 0, 168) { abortWindowHours = it; saved = false }
                            Spacer(Modifier.height(12.dp))
                            HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f))
                            Spacer(Modifier.height(12.dp))
                            Text("Reminders", style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold))
                            Text(
                                "Up to 3 check-in reminders, each sooner than the last.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(Modifier.height(8.dp))
                            reminders.forEachIndexed { index, hours ->
                                Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                    Box(modifier = Modifier.weight(1f)) {
                                        NumberPickerRow(
                                            "${reminderLabel(reminders.size, index)} (hours before)",
                                            hours, 1, 720
                                        ) { newValue ->
                                            reminders = reminders.mapIndexed { i, v -> if (i == index) newValue else v }
                                            saved = false
                                        }
                                    }
                                    if (reminders.size > 1) {
                                        IconButton(onClick = {
                                            reminders = reminders.filterIndexed { i, _ -> i != index }
                                            saved = false
                                        }) {
                                            Icon(Icons.Default.Delete, "Remove reminder", tint = MaterialTheme.colorScheme.error)
                                        }
                                    }
                                }
                                Spacer(Modifier.height(8.dp))
                            }
                            if (reminders.size < 3) {
                                TextButton(onClick = {
                                    val last = reminders.lastOrNull() ?: 24
                                    reminders = reminders + maxOf(1, last / 2)
                                    saved = false
                                }) {
                                    Icon(Icons.Default.Add, null, modifier = Modifier.size(18.dp))
                                    Spacer(Modifier.width(4.dp))
                                    Text("Add another reminder")
                                }
                            }
                            Spacer(Modifier.height(4.dp))
                            HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f))
                            Spacer(Modifier.height(12.dp))
                            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                Text("Set preferred check-in hour", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                                Switch(checked = usePreferredHour, onCheckedChange = { usePreferredHour = it; saved = false })
                            }
                            if (usePreferredHour) {
                                Spacer(Modifier.height(8.dp))
                                NumberPickerRow("Hour (0–23, ${TimeZone.getDefault().id})", preferredHour, 0, 23) { preferredHour = it; saved = false }
                                Spacer(Modifier.height(4.dp))
                                Text("${formatHour(preferredHour)} — deadlines will be set to this hour", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }

                        SectionHeader("Timezone")
                        VaultCard {
                            val currentTz = TimeZone.getDefault().id
                            Text("Current: $currentTz", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(Modifier.height(8.dp))
                            OutlinedButton(
                                onClick = {
                                    scope.launch {
                                        try { settings = ApiService.updateSwitchSettings(timezone = currentTz); settings?.let { applySettings(it) } }
                                        catch (e: Exception) { error = e.message ?: "Failed" }
                                    }
                                },
                                modifier = Modifier.fillMaxWidth()
                            ) { Text("Sync timezone") }
                        }

                        LoadingButton(
                            text = "Save Timing Settings",
                            loading = saving,
                            onClick = {
                                var prevLabel = "the check-in interval"
                                var prevHours = intervalDays * 24
                                var timingError: String? = null
                                for ((index, hours) in reminders.withIndex()) {
                                    val label = reminderLabel(reminders.size, index)
                                    if (hours >= prevHours) {
                                        timingError = "$label (${hours}h before) must be sooner than $prevLabel (${prevHours}h before)."
                                        break
                                    }
                                    prevHours = hours
                                    prevLabel = label
                                }
                                if (timingError != null) {
                                    error = timingError
                                    saved = false
                                } else {
                                    scope.launch {
                                        saving = true; error = ""; saved = false
                                        try {
                                            settings = ApiService.updateSwitchSettings(
                                                checkInIntervalDays = intervalDays,
                                                abortWindowHours = abortWindowHours,
                                                reminder1HoursBefore = reminders.getOrNull(0),
                                                clearReminder1 = reminders.getOrNull(0) == null,
                                                reminder2HoursBefore = reminders.getOrNull(1),
                                                clearReminder2 = reminders.getOrNull(1) == null,
                                                reminder3HoursBefore = reminders.getOrNull(2),
                                                clearReminder3 = reminders.getOrNull(2) == null,
                                                preferredCheckinHour = if (usePreferredHour) preferredHour else null,
                                                clearPreferredHour = if (usePreferredHour) null else true,
                                                timezone = TimeZone.getDefault().id
                                            )
                                            settings?.let { applySettings(it) }
                                            saved = true
                                        } catch (e: Exception) { error = e.message ?: "Save failed" }
                                        finally { saving = false }
                                    }
                                }
                            }
                        )
                    }
                }
            }
        }
    }

    // Check-in confirm dialog
    if (showCheckinConfirm) {
        AlertDialog(
            onDismissRequest = { showCheckinConfirm = false },
            title = { Text("Check in now?") },
            text = { Text("This will reset your check-in deadline.") },
            confirmButton = {
                TextButton(onClick = {
                    showCheckinConfirm = false
                    scope.launch {
                        actionLoading = true
                        try { settings = ApiService.checkin(); settings?.let { applySettings(it) } }
                        catch (e: Exception) { error = e.message ?: "Failed" }
                        finally { actionLoading = false }
                    }
                }) { Text("Check In") }
            },
            dismissButton = { TextButton(onClick = { showCheckinConfirm = false }) { Text("Cancel") } }
        )
    }

    // Disable confirm dialog
    if (showDisableConfirm) {
        AlertDialog(
            onDismissRequest = { showDisableConfirm = false },
            title = { Text("Disable switch?") },
            text = { Text("Your beneficiaries will no longer receive your vaults if you stop checking in.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDisableConfirm = false
                        scope.launch {
                            actionLoading = true
                            try { settings = ApiService.updateSwitchSettings(isActive = false); settings?.let { applySettings(it) } }
                            catch (e: Exception) { error = e.message ?: "Failed" }
                            finally { actionLoading = false }
                        }
                    },
                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)
                ) { Text("Disable") }
            },
            dismissButton = { TextButton(onClick = { showDisableConfirm = false }) { Text("Cancel") } }
        )
    }

    // Abort confirm dialog
    if (showAbortConfirm) {
        AlertDialog(
            onDismissRequest = { showAbortConfirm = false },
            title = { Text("Cancel delivery?") },
            text = { Text("This will cancel the delivery and reset your check-in timer.") },
            confirmButton = {
                TextButton(onClick = {
                    showAbortConfirm = false
                    scope.launch {
                        actionLoading = true
                        try { settings = ApiService.abortTrigger(); settings?.let { applySettings(it) } }
                        catch (e: Exception) { error = e.message ?: "Failed" }
                        finally { actionLoading = false }
                    }
                }) { Text("I'm here — cancel delivery") }
            },
            dismissButton = { TextButton(onClick = { showAbortConfirm = false }) { Text("Cancel") } }
        )
    }

    // Revoke confirm dialog
    if (showRevokeConfirm) {
        AlertDialog(
            onDismissRequest = { showRevokeConfirm = false },
            title = { Text("Revoke all access?") },
            text = { Text("This will invalidate all active delivery links and restart your switch. Beneficiaries will lose portal access.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showRevokeConfirm = false
                        scope.launch {
                            actionLoading = true
                            try {
                                ApiService.revokeDeliveries()
                                settings = ApiService.getSwitchSettings()
                                settings?.let { applySettings(it) }
                            } catch (e: Exception) { error = e.message ?: "Failed" }
                            finally { actionLoading = false }
                        }
                    },
                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)
                ) { Text("Revoke & reset") }
            },
            dismissButton = { TextButton(onClick = { showRevokeConfirm = false }) { Text("Cancel") } }
        )
    }

    // Pause duration dialog
    if (showPauseDialog) {
        PauseDurationDialog(
            onDismiss = { showPauseDialog = false },
            onPause = { resumeAtIso ->
                showPauseDialog = false
                scope.launch {
                    actionLoading = true; error = ""
                    try {
                        settings = ApiService.pauseSwitch(resumeAtIso)
                        settings?.let { applySettings(it) }
                    } catch (e: Exception) { error = e.message ?: "Failed to pause" }
                    finally { actionLoading = false }
                }
            }
        )
    }
}

@Composable
private fun StatusInfoRow(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth().padding(top = 4.dp)) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
        Text(value, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun ActionRow(label: String, subtitle: String, color: Color = Color.Unspecified, onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium), color = if (color != Color.Unspecified) color else Color.Unspecified)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        TextButton(onClick = onClick) {
            Text("Go", color = if (color != Color.Unspecified) color else MaterialTheme.colorScheme.primary)
        }
    }
}

@Composable
private fun NumberPickerRow(label: String, value: Int, min: Int, max: Int, onChange: (Int) -> Unit) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { if (value > min) onChange(value - 1) }, modifier = Modifier.size(32.dp)) {
                Text("−", style = MaterialTheme.typography.titleMedium)
            }
            Text(value.toString(), style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold), modifier = Modifier.padding(horizontal = 8.dp))
            IconButton(onClick = { if (value < max) onChange(value + 1) }, modifier = Modifier.size(32.dp)) {
                Text("+", style = MaterialTheme.typography.titleMedium)
            }
        }
    }
}

@Composable
private fun PauseDurationDialog(onDismiss: () -> Unit, onPause: (String?) -> Unit) {
    val options = listOf("1 week" to 7, "2 weeks" to 14, "1 month" to 30, "Indefinitely" to null)
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Pause Switch") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    "No reminders or triggers will fire while the switch is paused. Use this during planned absences.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(8.dp))
                options.forEach { (label, days) ->
                    TextButton(
                        onClick = {
                            val resumeAt = days?.let {
                                val future = Instant.now().plusSeconds(it.toLong() * 86400L)
                                future.toString()
                            }
                            onPause(resumeAt)
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) { Text(label, modifier = Modifier.fillMaxWidth()) }
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

private fun statusLabel(s: SwitchSettings): String = when (s.status) {
    "active" -> "Switch Active"
    "paused" -> "Switch Paused"
    "triggered" -> "Switch Triggered"
    "delivered" -> "Vault Delivered"
    else -> "Switch Disabled"
}

@Composable
private fun statusColor(s: SwitchSettings): Color = when (s.status) {
    "active" -> MaterialTheme.colorScheme.primary
    "paused" -> MaterialTheme.colorScheme.onSurfaceVariant
    "triggered" -> Color(0xFFFF9800)
    "delivered" -> MaterialTheme.colorScheme.error
    else -> MaterialTheme.colorScheme.onSurfaceVariant
}

private fun isInFuture(isoDate: String): Boolean = try {
    Instant.parse(isoDate).isAfter(Instant.now())
} catch (_: Exception) { false }

private fun formatRelativeDate(isoDate: String): String {
    return try {
        val instant = Instant.parse(isoDate)
        val nowMs = System.currentTimeMillis()
        val thenMs = instant.toEpochMilli()
        val diffMs = thenMs - nowMs
        val diffSec = diffMs / 1000
        val diffMin = diffSec / 60
        val diffHour = diffMin / 60
        val diffDay = diffHour / 24
        when {
            kotlin.math.abs(diffDay) >= 1 -> {
                if (diffDay > 0) "in ${diffDay}d" else "${-diffDay}d ago"
            }
            kotlin.math.abs(diffHour) >= 1 -> {
                if (diffHour > 0) "in ${diffHour}h" else "${-diffHour}h ago"
            }
            kotlin.math.abs(diffMin) >= 1 -> {
                if (diffMin > 0) "in ${diffMin}m" else "${-diffMin}m ago"
            }
            else -> if (diffSec > 0) "soon" else "just now"
        }
    } catch (_: Exception) { isoDate }
}

// Names a reminder by position among however many are enabled (1-3); 1 active is just "Reminder".
private fun reminderLabel(count: Int, index: Int): String = when (count) {
    1 -> "Reminder"
    2 -> listOf("First reminder", "Second reminder")[index]
    3 -> listOf("First reminder", "Second reminder", "Final reminder")[index]
    else -> "Reminder ${index + 1}"
}

private fun formatHour(hour: Int): String {
    val period = if (hour < 12) "AM" else "PM"
    val h = if (hour % 12 == 0) 12 else hour % 12
    return "$h:00 $period"
}
