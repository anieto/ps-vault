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
        val data = intent?.data ?: return
        val token = data.getQueryParameter("token") ?: return
        val path = when (data.scheme) {
            "https" -> data.path?.trimStart('/') ?: return
            "psvault" -> data.host ?: return  // legacy fallback
            else -> return
        }
        vm.pendingDeepLinkPath = "$path?token=$token"
    }
}
