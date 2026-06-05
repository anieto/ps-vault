package dev.psvault.app

import android.content.Intent
import android.os.Bundle
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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
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

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        val data = intent?.data ?: return
        val host = data.host ?: return
        val token = data.getQueryParameter("token") ?: return
        vm.pendingDeepLinkPath = "$host?token=$token"
    }
}
