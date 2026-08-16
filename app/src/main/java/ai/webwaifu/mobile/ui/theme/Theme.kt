package ai.webwaifu.mobile.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val WaifuPink = Color(0xFFFF4778)
val WaifuPeach = Color(0xFFFFB39B)
val WaifuInk = Color(0xFF09070D)
val WaifuSurface = Color(0xFF15101B)
val WaifuCyan = Color(0xFF5DE8EA)

private val Colors =
    darkColorScheme(
        primary = WaifuPink,
        onPrimary = Color(0xFF21000C),
        secondary = WaifuPeach,
        onSecondary = Color(0xFF241009),
        tertiary = WaifuCyan,
        background = WaifuInk,
        onBackground = Color(0xFFFFF4F3),
        surface = WaifuSurface,
        onSurface = Color(0xFFFFF4F3),
        surfaceVariant = Color(0xFF241B2A),
        onSurfaceVariant = Color(0xFFD8C1CE),
        outline = Color(0xFF8C6F7D),
        error = Color(0xFFFF8A80),
    )

@Composable
fun WebWaifuTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = Colors,
        typography = MaterialTheme.typography,
        content = content,
    )
}
