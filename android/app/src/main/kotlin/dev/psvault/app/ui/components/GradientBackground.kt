package dev.psvault.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import dev.psvault.app.ui.theme.GradientDark
import dev.psvault.app.ui.theme.GradientLight

/**
 * Approximates the iOS MeshGradient (AuthBackground) using layered radial gradients.
 * Dark mode: gunmetal dark steel with off-center chrome sheen at ~55%,42%.
 * Light mode: polished silver chrome with near-white sheen.
 */
@Composable
fun GradientBackground(modifier: Modifier = Modifier) {
    val isDark = isSystemInDarkTheme()
    val colors = if (isDark) GradientDark else GradientLight

    // Base color (bottom-left darkest corner)
    val base = colors[6]
    // Dominant mid-tone (interpolated average of corners)
    val mid = colors[3]
    // Sheen highlight — off-center at ~55%, 42%
    val sheen = colors[4]
    // Top gradient tone
    val top = colors[1]

    Canvas(modifier = modifier.fillMaxSize()) {
        val w = size.width
        val h = size.height

        // Base fill
        drawRect(color = base)

        // Top-to-bottom vertical gradient
        drawRect(
            brush = Brush.verticalGradient(
                colors = listOf(top.copy(alpha = 0.9f), base.copy(alpha = 0f)),
                startY = 0f,
                endY = h * 0.65f
            )
        )

        // Off-center radial sheen at ~55%, 42%
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(sheen.copy(alpha = 0.85f), Color.Transparent),
                center = Offset(w * 0.55f, h * 0.42f),
                radius = minOf(w, h) * 0.55f
            ),
            radius = minOf(w, h) * 0.55f,
            center = Offset(w * 0.55f, h * 0.42f)
        )

        // Subtle ambient fill from top-left
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(mid.copy(alpha = 0.4f), Color.Transparent),
                center = Offset(0f, 0f),
                radius = w * 0.7f
            ),
            radius = w * 0.7f,
            center = Offset(0f, 0f)
        )
    }
}

/**
 * Tinted gradient overlay for main app screens (Dashboard, Vaults, etc.)
 * Mirrors iOS: LinearGradient from brandColor.opacity(0.25) → clear, top to 55%.
 */
@Composable
fun BrandGradientOverlay(brandColor: Color, modifier: Modifier = Modifier) {
    if (brandColor == Color.Unspecified) return
    Canvas(modifier = modifier.fillMaxSize()) {
        drawRect(
            brush = Brush.verticalGradient(
                colors = listOf(brandColor.copy(alpha = 0.25f), Color.Transparent),
                startY = 0f,
                endY = size.height * 0.55f
            )
        )
    }
}
