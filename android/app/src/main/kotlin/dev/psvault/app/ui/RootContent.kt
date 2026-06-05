package dev.psvault.app.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import dev.psvault.app.LocalAppViewModel
import dev.psvault.app.ui.screens.CheckinConfirmScreen
import dev.psvault.app.ui.screens.MainScreen
import dev.psvault.app.ui.screens.ResetPasswordScreen
import dev.psvault.app.ui.screens.VerifyEmailScreen
import dev.psvault.app.ui.screens.auth.ForgotPasswordScreen
import dev.psvault.app.ui.screens.auth.LoginScreen
import dev.psvault.app.ui.screens.auth.RegisterScreen
import dev.psvault.app.ui.screens.lock.LockScreen
import dev.psvault.app.ui.screens.setup.SetupScreen

/**
 * Root composable — decides what to show based on auth state.
 * Mirrors iOS RootView exactly.
 */
@Composable
fun RootContent() {
    val vm = LocalAppViewModel.current
    val navController = rememberNavController()

    // Navigate based on state changes
    LaunchedEffect(vm.serverUrl, vm.isAuthenticated, vm.isLocked) {
        when {
            vm.serverUrl.isEmpty() -> navController.navigate(Screen.Setup.route) {
                popUpTo(0) { inclusive = true }
            }
            !vm.isAuthenticated -> navController.navigate(Screen.Login.route) {
                popUpTo(0) { inclusive = true }
            }
            vm.isLocked -> navController.navigate("lock") {
                popUpTo(0) { inclusive = true }
            }
            else -> navController.navigate(Screen.Main.route) {
                popUpTo(0) { inclusive = true }
            }
        }
    }

    NavHost(
        navController = navController,
        startDestination = when {
            vm.serverUrl.isEmpty() -> Screen.Setup.route
            !vm.isAuthenticated -> Screen.Login.route
            vm.isLocked -> "lock"
            else -> Screen.Main.route
        }
    ) {
        composable(Screen.Setup.route) {
            SetupScreen(onSetupComplete = {
                navController.navigate(Screen.Login.route) {
                    popUpTo(Screen.Setup.route) { inclusive = true }
                }
            })
        }

        composable(Screen.Login.route) {
            LoginScreen(
                onLoginSuccess = {
                    navController.navigate(Screen.Main.route) {
                        popUpTo(0) { inclusive = true }
                    }
                },
                onNavigateToRegister = { navController.navigate(Screen.Register.route) },
                onNavigateToForgotPassword = { navController.navigate(Screen.ForgotPassword.route) }
            )
        }

        composable(Screen.Register.route) {
            RegisterScreen(
                onRegistered = {
                    navController.navigate(Screen.Main.route) {
                        popUpTo(0) { inclusive = true }
                    }
                },
                onBack = { navController.popBackStack() }
            )
        }

        composable(Screen.ForgotPassword.route) {
            ForgotPasswordScreen(onBack = { navController.popBackStack() })
        }

        composable("lock") {
            LockScreen(
                onUnlocked = {
                    navController.navigate(Screen.Main.route) {
                        popUpTo(0) { inclusive = true }
                    }
                },
                onSignOut = {
                    navController.navigate(Screen.Login.route) {
                        popUpTo(0) { inclusive = true }
                    }
                }
            )
        }

        composable(Screen.Main.route) {
            MainScreen()
        }

        composable(Screen.VerifyEmail.route) {
            VerifyEmailScreen(navController)
        }

        composable(Screen.ResetPassword.route) { back ->
            val token = back.arguments?.getString("token") ?: ""
            ResetPasswordScreen(token = token, nav = navController)
        }

        composable("checkin_confirm") {
            CheckinConfirmScreen(navController)
        }
    }

    // Handle pending deep links from MainActivity.handleIntent
    LaunchedEffect(vm.pendingDeepLinkPath) {
        val path = vm.pendingDeepLinkPath ?: return@LaunchedEffect
        vm.pendingDeepLinkPath = null
        when {
            path.startsWith("verify-email") -> {
                val token = path.substringAfter("token=", "")
                if (token.isNotEmpty()) navController.navigate(Screen.VerifyEmail.route(token))
            }
            path.startsWith("reset-password") -> {
                val token = path.substringAfter("token=", "")
                if (token.isNotEmpty()) navController.navigate(Screen.ResetPassword.route(token))
            }
            path.startsWith("checkin") -> {
                navController.navigate("checkin_confirm")
            }
            path.startsWith("death-report") -> {
                // Navigate to main screen — dashboard shows the active death report banner
                navController.navigate(Screen.Main.route) {
                    popUpTo(0) { inclusive = true }
                }
            }
        }
    }
}
