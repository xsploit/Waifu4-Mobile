package ai.webwaifu.mobile.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class BundledAnimationCatalogTest {
    @Test
    fun exposesTheCompleteSachiVrmaCatalogWithoutDuplicateSelectors() {
        assertEquals(42, BUNDLED_ANIMATION_CLIPS.size)
        assertEquals(42, BUNDLED_ANIMATION_CLIPS.map { it.id }.distinct().size)
        assertEquals(42, BUNDLED_ANIMATION_CLIPS.map { it.assetPath }.distinct().size)
        assertTrue(BUNDLED_ANIMATION_CLIPS.all { it.assetPath.endsWith(".vrma") })
    }

    @Test
    fun onlySafeBaseClipsAreMarkedForAutoplay() {
        val safe = BUNDLED_ANIMATION_CLIPS.filter { it.safeAutoplay }

        assertEquals(9, safe.size)
        assertTrue(safe.none { it.label.contains("Rotate") || it.label.contains("Sit") })
    }
}
