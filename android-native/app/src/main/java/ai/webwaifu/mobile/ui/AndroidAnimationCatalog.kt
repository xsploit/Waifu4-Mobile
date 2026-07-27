package ai.webwaifu.mobile.ui

import android.content.Context
import ai.webwaifu.mobile.model.BUNDLED_ANIMATION_CLIPS
import ai.webwaifu.mobile.model.BundledAnimationClip
import java.util.Locale

internal fun availableAndroidAnimationClips(context: Context): List<BundledAnimationClip> {
    val legacy =
        context.assets.list("animations")
            .orEmpty()
            .filter { it.endsWith(".fbx", ignoreCase = true) }
            .map { file ->
                BundledAnimationClip(
                    id = "legacy-${file.lowercase(Locale.ROOT)}",
                    label = animationDisplayName(file),
                    assetPath = "animations/$file",
                    safeAutoplay = file.startsWith("Idle", ignoreCase = true),
                )
            }
    val sillyBvh = context.assets.animationDirectory("silly-bvh", "Silly")
    val sillyTavern = context.assets.animationDirectory("silly-tavern", "Silly Tavern")
    return (BUNDLED_ANIMATION_CLIPS + legacy + sillyBvh + sillyTavern)
        .distinctBy { it.assetPath }
}

private fun android.content.res.AssetManager.animationDirectory(
    directory: String,
    labelPrefix: String,
): List<BundledAnimationClip> =
    list("animations/$directory")
        .orEmpty()
        .filter { it.endsWith(".bvh", ignoreCase = true) }
        .map { file ->
            val normalized = file.lowercase(Locale.ROOT)
            BundledAnimationClip(
                id = "$directory-$normalized",
                label = "$labelPrefix ${animationDisplayName(file)}",
                assetPath = "animations/$directory/$file",
                safeAutoplay =
                    ("neutral" in normalized || "idle" in normalized) &&
                        "sit" !in normalized &&
                        "kneel" !in normalized,
            )
        }

private fun animationDisplayName(file: String): String =
    file
        .substringBeforeLast('.')
        .replace('_', ' ')
        .replace('-', ' ')
        .split(' ')
        .filter { it.isNotBlank() }
        .joinToString(" ") { word ->
            word.replaceFirstChar { first ->
                if (first.isLowerCase()) first.titlecase(Locale.ROOT) else first.toString()
            }
        }
