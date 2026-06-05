package dev.psvault.app.ui.screens.dashboard

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.unit.sp
import dev.psvault.app.LocalAppViewModel
import dev.psvault.app.api.ApiService
import dev.psvault.app.models.DeathReport
import dev.psvault.app.models.SwitchSettings
import dev.psvault.app.models.Vault
import dev.psvault.app.ui.components.*
import kotlinx.coroutines.launch
import java.time.Instant

private val GREETINGS = listOf("Welcome back", "Hey", "Hey there", "Hi", "Good to see you")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen() {
    val vm = LocalAppViewModel.current
    val scope = rememberCoroutineScope()

    var switchSettings by remember { mutableStateOf<SwitchSettings?>(null) }
    var deathReport by remember { mutableStateOf<DeathReport?>(null) }
    var vaults by remember { mutableStateOf<List<Vault>>(emptyList()) }
    var beneficiaryCount by remember { mutableStateOf<Int?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf("") }
    var checkinLoading by remember { mutableStateOf(false) }
    var checkinError by remember { mutableStateOf("") }
    var isAborting by remember { mutableStateOf(false) }
    var showDeactivateDialog by remember { mutableStateOf(false) }
    val greeting = remember { GREETINGS.random() }

    suspend fun load() {
        error = ""; checkinError = ""
        try {
            switchSettings = ApiService.getSwitchSettings()
            deathReport = ApiService.getActiveDeathReport()
            vaults = ApiService.listVaults()
            beneficiaryCount = ApiService.listBeneficiaries().size
        } catch (e: Exception) { error = e.message ?: "Failed to load" }
        finally { loading = false }
    }

    LaunchedEffect(Unit) { load() }

    val sw = switchSettings
    val isOverdue = isDeadlinePast(sw?.nextCheckinDeadline)
    val isUrgent = !isOverdue && hoursUntil(sw?.nextCheckinDeadline)?.let { it < 24 } == true

    val subtitle = when (sw?.status) {
        "active" -> when {
            isOverdue -> "Your check-in is overdue — check in now."
            isUrgent -> "Your check-in is coming up soon."
            else -> "Everything looks good. Your vault is ready."
        }
        "paused" -> "Your switch is currently paused."
        "triggered" -> if (sw.abortDeadline?.let { !isDeadlinePast(it) } == true)
            "Your vault is pending delivery — act now to cancel." else "Delivery is in progress."
        "delivered" -> "Your vault has been delivered to your beneficiaries."
        "inactive" -> "Let's get your vault set up."
        else -> if (loading) "Loading..." else if (error.isNotEmpty()) "Could not load status." else ""
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Dashboard", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold)) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        },
        containerColor = Color.Transparent
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize()) {
            GradientBackground()
            BrandGradientOverlay(brandColor = vm.brandColor)

            if (loading) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            } else {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(padding)
                        .padding(horizontal = 20.dp)
                        .padding(bottom = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Spacer(Modifier.height(4.dp))

                    // Greeting
                    val firstName = vm.user?.let { u ->
                        val name = if (u.displayName.isEmpty()) u.email else u.displayName
                        name.split(" ").firstOrNull() ?: name
                    } ?: "there"
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(
                            "$greeting, $firstName.",
                            fontSize = 26.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onBackground
                        )
                        if (subtitle.isNotEmpty()) {
                            Text(
                                subtitle,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    if (error.isNotEmpty()) ErrorBanner(error)

                    // Death report banner
                    deathReport?.let { report ->
                        DashStatusBanner(
                            icon = Icons.Default.Warning,
                            title = "A death report has been filed",
                            message = "${report.reporterName} has reported your passing. Check in or tap the I'm Okay link in your email to clear this report. You must respond before ${formatDeadline(report.responseDeadline)} or your vaults will be released.",
                            tint = Color(0xFFF97316),
                            actionLabel = if (checkinLoading) null else "I'm okay — check in",
                            actionLoading = checkinLoading,
                            onAction = {
                                scope.launch {
                                    checkinLoading = true
                                    try {
                                        switchSettings = ApiService.checkin()
                                        deathReport = ApiService.getActiveDeathReport()
                                    } catch (e: Exception) { error = e.message ?: "Failed" }
                                    finally { checkinLoading = false }
                                }
                            }
                        )
                    }

                    // Switch status section
                    sw?.let {
                        when (sw.status) {
                            "inactive" -> DashStatusBanner(
                                icon = Icons.Default.Warning,
                                title = "Your switch is not active",
                                message = "Enable your Emergency Switch in Settings to protect your vault.",
                                tint = Color(0xFFF97316)
                            )
                            "paused" -> DashStatusBanner(
                                icon = Icons.Default.Pause,
                                title = "Switch is paused",
                                message = sw.pausedUntil?.let { "Resumes ${formatRelative(it)}" } ?: "Paused indefinitely",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            "triggered" -> {
                                val abortOpen = sw.abortDeadline?.let { !isDeadlinePast(it) } == true
                                DashStatusBanner(
                                    icon = Icons.Default.Warning,
                                    title = "Your switch has triggered",
                                    message = if (abortOpen)
                                        sw.abortDeadline?.let { "Abort window closes ${formatRelative(it)}" } ?: "Abort window is open."
                                    else "Delivery in progress — contact support to reset.",
                                    tint = MaterialTheme.colorScheme.error,
                                    actionLabel = if (abortOpen && !isAborting) "I'm here" else null,
                                    actionLoading = isAborting,
                                    onAction = if (abortOpen) ({
                                        scope.launch {
                                            isAborting = true
                                            try { switchSettings = ApiService.abortTrigger() }
                                            catch (e: Exception) { error = e.message ?: "Failed" }
                                            finally { isAborting = false }
                                        }
                                    }) else null
                                )
                            }
                            "delivered" -> DashStatusBanner(
                                icon = Icons.Default.CheckCircle,
                                title = "Vault delivered",
                                message = "Your vault was delivered to your beneficiaries.",
                                tint = MaterialTheme.colorScheme.error
                            )
                            else -> { // "active"
                                if (isOverdue) {
                                    DashStatusBanner(
                                        icon = Icons.Default.Warning,
                                        title = "Check-in overdue",
                                        message = "Your check-in window has passed. Check in now to prevent vault delivery.",
                                        tint = MaterialTheme.colorScheme.error,
                                        actionLabel = if (!checkinLoading) "Check in now" else null,
                                        actionLoading = checkinLoading,
                                        onAction = {
                                            scope.launch {
                                                checkinLoading = true; checkinError = ""
                                                try { switchSettings = ApiService.checkin() }
                                                catch (e: Exception) { checkinError = e.message ?: "Failed" }
                                                finally { checkinLoading = false }
                                            }
                                        }
                                    )
                                } else {
                                    ActiveSwitchCard(
                                        sw = sw,
                                        isUrgent = isUrgent,
                                        isCheckingIn = checkinLoading,
                                        loginCountsAsCheckin = vm.loginCountsAsCheckin,
                                        brandColor = vm.brandColor,
                                        onCheckin = {
                                            scope.launch {
                                                checkinLoading = true; checkinError = ""
                                                try { switchSettings = ApiService.checkin() }
                                                catch (e: Exception) { checkinError = e.message ?: "Failed" }
                                                finally { checkinLoading = false }
                                            }
                                        }
                                    )
                                }
                                if (checkinError.isNotEmpty()) {
                                    Text(
                                        checkinError,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.error,
                                        modifier = Modifier.padding(horizontal = 4.dp)
                                    )
                                }
                            }
                        }
                    }

                    // Quick stats
                    sw?.let {
                        val accentColor = vm.brandColor.takeIf { it != Color.Unspecified }
                            ?: MaterialTheme.colorScheme.primary
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            DashStatCard(
                                title = "Vaults",
                                value = "${vaults.size}",
                                icon = Icons.Default.Lock,
                                color = accentColor,
                                modifier = Modifier.weight(1f)
                            )
                            DashStatCard(
                                title = "Beneficiaries",
                                value = beneficiaryCount?.toString() ?: "—",
                                icon = Icons.Default.People,
                                color = Color(0xFF8B5CF6),
                                modifier = Modifier.weight(1f)
                            )
                        }
                        sw.lastCheckinAt?.let { last ->
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.padding(horizontal = 4.dp)
                            ) {
                                Icon(Icons.Default.CheckCircle, null, modifier = Modifier.size(13.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(
                                    "Last check-in: ${formatRelative(last)}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }

                    // Vaults preview
                    if (vaults.isNotEmpty()) {
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(
                                "YOUR VAULTS",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(horizontal = 4.dp)
                            )
                            vaults.take(3).forEach { vault ->
                                VaultCard(modifier = Modifier.clickable { vm.selectedTab = "vaults" }) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(vault.icon, fontSize = 20.sp)
                                        Spacer(Modifier.width(12.dp))
                                        Text(
                                            vault.name,
                                            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
                                            modifier = Modifier.weight(1f)
                                        )
                                        Icon(Icons.Default.ChevronRight, null, modifier = Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                }
                            }
                        }
                    }

                    Spacer(Modifier.height(4.dp))
                }
            }
        }
    }

    if (showDeactivateDialog) {
        ConfirmDialog(
            title = "Deactivate Emergency Switch",
            message = "Beneficiaries will no longer receive vault access when the switch fires.",
            confirmText = "Deactivate",
            confirmColor = MaterialTheme.colorScheme.error,
            onConfirm = {
                showDeactivateDialog = false
                scope.launch {
                    try { switchSettings = ApiService.updateSwitchSettings(isActive = false) }
                    catch (e: Exception) { error = e.message ?: "Failed" }
                }
            },
            onDismiss = { showDeactivateDialog = false }
        )
    }
}

// MARK: - Status Banner

@Composable
private fun DashStatusBanner(
    icon: ImageVector,
    title: String,
    message: String,
    tint: Color,
    actionLabel: String? = null,
    actionLoading: Boolean = false,
    onAction: (() -> Unit)? = null
) {
    val isNeutral = tint == MaterialTheme.colorScheme.onSurfaceVariant
    Surface(
        color = if (isNeutral) MaterialTheme.colorScheme.surfaceVariant else tint.copy(alpha = 0.08f),
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Icon(icon, null, modifier = Modifier.size(18.dp).padding(top = 1.dp), tint = tint)
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(
                    title,
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                    color = tint
                )
                Text(
                    message,
                    style = MaterialTheme.typography.bodySmall,
                    color = if (isNeutral) MaterialTheme.colorScheme.onSurfaceVariant else tint.copy(alpha = 0.85f)
                )
            }
            if (actionLoading) {
                CircularProgressIndicator(modifier = Modifier.size(20.dp).align(Alignment.CenterVertically), strokeWidth = 2.dp, color = tint)
            } else if (actionLabel != null && onAction != null) {
                TextButton(
                    onClick = onAction,
                    modifier = Modifier.align(Alignment.CenterVertically),
                    colors = ButtonDefaults.textButtonColors(contentColor = tint)
                ) {
                    Text(actionLabel, style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold))
                }
            }
        }
    }
}

// MARK: - Active Switch Card

@Composable
private fun ActiveSwitchCard(
    sw: SwitchSettings,
    isUrgent: Boolean,
    isCheckingIn: Boolean,
    loginCountsAsCheckin: Boolean,
    brandColor: Color,
    onCheckin: () -> Unit
) {
    val tint = if (isUrgent) Color(0xFFF97316)
    else brandColor.takeIf { it != Color.Unspecified } ?: MaterialTheme.colorScheme.primary
    val deadlineText = buildDeadlineText(sw.nextCheckinDeadline, isUrgent)

    Surface(
        color = if (isUrgent) Color(0xFFF97316).copy(alpha = 0.08f) else MaterialTheme.colorScheme.surfaceVariant,
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                if (isUrgent) Icons.Default.Warning else Icons.Default.Security,
                null,
                modifier = Modifier.size(18.dp),
                tint = tint
            )
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(
                    "Switch is active",
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                    color = if (isUrgent) tint else MaterialTheme.colorScheme.onSurface
                )
                Text(
                    deadlineText,
                    style = MaterialTheme.typography.bodySmall,
                    color = if (isUrgent) tint.copy(alpha = 0.8f) else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                if (isCheckingIn) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp, color = tint)
                } else {
                    TextButton(
                        onClick = onCheckin,
                        colors = ButtonDefaults.textButtonColors(contentColor = tint)
                    ) {
                        Text("Check in", style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold))
                    }
                }
                if (loginCountsAsCheckin) {
                    Text(
                        "Login also counts",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

// MARK: - Stat Card

@Composable
private fun DashStatCard(title: String, value: String, icon: ImageVector, color: Color, modifier: Modifier = Modifier) {
    VaultCard(modifier = modifier) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Icon(icon, null, modifier = Modifier.size(11.dp), tint = color)
            Text(
                title.uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Spacer(Modifier.height(4.dp))
        Text(value, fontSize = 24.sp, fontWeight = FontWeight.Bold)
    }
}

// MARK: - Date helpers

private fun isDeadlinePast(iso: String?): Boolean {
    if (iso.isNullOrEmpty()) return false
    return try { Instant.parse(iso).isBefore(Instant.now()) } catch (_: Exception) { false }
}

private fun hoursUntil(iso: String?): Double? {
    if (iso.isNullOrEmpty()) return null
    return try {
        val diff = Instant.parse(iso).epochSecond - Instant.now().epochSecond
        diff.toDouble() / 3600.0
    } catch (_: Exception) { null }
}

private fun buildDeadlineText(iso: String?, isUrgent: Boolean): String {
    val hours = hoursUntil(iso) ?: return "Waiting for first check-in"
    return if (isUrgent) {
        if (hours < 1) "Check in soon — due in less than an hour"
        else "Check in soon — due in ${hours.toInt()}h"
    } else {
        val days = (hours / 24).toInt()
        if (days > 0) "Next check-in due in $days day${if (days == 1) "" else "s"}"
        else "Next check-in due today"
    }
}

private fun formatDeadline(iso: String): String = iso.replace("T", " ").take(16)
private fun formatRelative(iso: String): String = iso.replace("T", " ").take(16)
