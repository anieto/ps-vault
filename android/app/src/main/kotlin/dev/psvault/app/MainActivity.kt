package dev.psvault.app

import android.content.Intent
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.fragment.app.FragmentActivity
import dev.psvault.app.state.AppViewModel
import dev.psvault.app.ui.RootContent
import dev.psvault.app.ui.theme.PSVaultTheme

val LocalAppViewModel = staticCompositionLocalOf<AppViewModel> {
    error("No AppViewModel provided")
}

class MainActivity : FragmentActivity() {

    private val vm: AppViewModel by viewModels()
    private var backgroundedAt: Long = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        enableEdgeToEdge()
        handleIntent(intent)
        setContent {
            CompositionLocalProvider(LocalAppViewModel provides vm) {
                PSVaultTheme {
                    RootContent()
                }
            }
        }
    }

    override fun onStop() {
        super.onStop()
        if (vm.isAuthenticated && !vm.isLocked) {
            backgroundedAt = System.currentTimeMillis()
        }
    }

    override fun onStart() {
        super.onStart()
        if (vm.isAuthenticated && !vm.isLocked && backgroundedAt > 0L) {
            val elapsedSeconds = (System.currentTimeMillis() - backgroundedAt) / 1000L
            if (vm.lockTimeoutSeconds == 0 || elapsedSeconds >= vm.lockTimeoutSeconds) {
                vm.lock()
            }
            backgroundedAt = 0L
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        // Deep link passed as an extra from a push notification tap
        intent?.getStringExtra(EXTRA_DEEP_LINK)?.let { raw ->
            val uri = android.net.Uri.parse(raw)
            val path = uri.host ?: return
            val token = uri.getQueryParameter("token")
            vm.pendingDeepLinkPath = if (token != null) "$path?token=$token" else path
            return
        }
        // Deep link from URL (HTTPS App Links or psvault:// scheme)
        val data = intent?.data ?: return
        val token = data.getQueryParameter("token")
        val path = when (data.scheme) {
            "https" -> data.path?.trimStart('/') ?: return
            "psvault" -> data.host ?: return
            else -> return
        }
        vm.pendingDeepLinkPath = if (token != null) "$path?token=$token" else path
    }

    companion object {
        const val EXTRA_DEEP_LINK = "deep_link"
    }
}
