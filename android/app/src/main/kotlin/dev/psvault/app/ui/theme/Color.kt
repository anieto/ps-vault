package dev.psvault.app.ui.theme

import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color

// MARK: - Mesh gradient colors (matches iOS AuthBackground — Metallic/Steel Option 2)

// Dark mode — gunmetal dark steel
val GradientDark = listOf(
    Color(0.10f, 0.12f, 0.15f), // top-left
    Color(0.20f, 0.22f, 0.25f), // top-center
    Color(0.08f, 0.10f, 0.13f), // top-right
    Color(0.14f, 0.16f, 0.20f), // mid-left
    Color(0.32f, 0.34f, 0.38f), // center (sheen)
    Color(0.11f, 0.13f, 0.17f), // mid-right
    Color(0.05f, 0.06f, 0.08f), // bottom-left
    Color(0.12f, 0.14f, 0.18f), // bottom-center
    Color(0.06f, 0.07f, 0.10f)  // bottom-right
)

// Light mode — polished silver chrome
val GradientLight = listOf(
    Color(0.82f, 0.84f, 0.88f),
    Color(0.94f, 0.95f, 0.97f),
    Color(0.80f, 0.82f, 0.86f),
    Color(0.86f, 0.88f, 0.91f),
    Color(0.97f, 0.97f, 0.98f),
    Color(0.79f, 0.81f, 0.85f),
    Color(0.76f, 0.78f, 0.82f),
    Color(0.88f, 0.89f, 0.92f),
    Color(0.78f, 0.80f, 0.84f)
)

// MARK: - Material 3 color schemes

val DarkColorScheme = darkColorScheme(
    primary = Color(0xFF8EAFD4),
    onPrimary = Color(0xFF0D1C2E),
    primaryContainer = Color(0xFF1F3450),
    onPrimaryContainer = Color(0xFFD0E4FF),
    secondary = Color(0xFFB3C8E8),
    onSecondary = Color(0xFF1B3048),
    background = Color(0xFF0D0F14),
    onBackground = Color(0xFFE2E6ED),
    surface = Color(0xFF191C22),
    onSurface = Color(0xFFE2E6ED),
    surfaceVariant = Color(0xFF252830),
    onSurfaceVariant = Color(0xFFBCC5D3),
    outline = Color(0xFF404654),
    error = Color(0xFFFF6B6B),
    onError = Color(0xFF1A0000)
)

val LightColorScheme = lightColorScheme(
    primary = Color(0xFF2B5F8E),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFD0E4FF),
    onPrimaryContainer = Color(0xFF001D36),
    secondary = Color(0xFF4A6780),
    onSecondary = Color(0xFFFFFFFF),
    background = Color(0xFFD1D6E0),
    onBackground = Color(0xFF1A1F26),
    surface = Color(0xFFE8EBF0),
    onSurface = Color(0xFF1A1F26),
    surfaceVariant = Color(0xFFDADFE8),
    onSurfaceVariant = Color(0xFF3A4352),
    outline = Color(0xFF9AA4B2),
    error = Color(0xFFBA1A1A),
    onError = Color(0xFFFFFFFF)
)
