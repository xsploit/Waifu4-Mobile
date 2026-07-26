package ai.webwaifu.mobile.ui

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import org.junit.Assert.assertEquals
import org.junit.Test

class VrmaAnimationTest {
    @Test
    fun sourceRestPoseMapsToTargetRestPose() {
        val sourceParent = axisAngle(0f, 1f, 0f, 35f)
        val sourceLocal = axisAngle(1f, 0f, 0f, -22f)
        val sourceWorld = sourceParent * sourceLocal
        val targetParent = axisAngle(0f, 0f, 1f, 17f)
        val targetLocal = axisAngle(1f, 0f, 0f, 9f)

        val actual =
            retargetVrmAnimationRotation(
                sampled = sourceLocal,
                sourceParentWorldRest = sourceParent,
                sourceBoneWorldRest = sourceWorld,
                targetParentWorldRest = targetParent,
                targetLocalRest = targetLocal,
                targetIsVrm0 = false,
            )

        assertQuaternionEquals(targetLocal, actual)
    }

    @Test
    fun normalizedMotionIsConvertedIntoTargetRawRig() {
        val sourceParent = axisAngle(0f, 1f, 0f, 31f)
        val sourceLocal = axisAngle(1f, 0f, 0f, -13f)
        val sourceWorld = sourceParent * sourceLocal
        val normalizedMotion = axisAngle(0f, 0f, 1f, 28f)
        val sampled = sourceParent.inverse() * normalizedMotion * sourceWorld
        val targetParent = axisAngle(0f, 1f, 0f, -19f)
        val targetLocal = axisAngle(1f, 0f, 0f, 7f)
        val expected =
            targetParent.inverse() *
                normalizedMotion *
                targetParent *
                targetLocal

        val actual =
            retargetVrmAnimationRotation(
                sampled = sampled,
                sourceParentWorldRest = sourceParent,
                sourceBoneWorldRest = sourceWorld,
                targetParentWorldRest = targetParent,
                targetLocalRest = targetLocal,
                targetIsVrm0 = false,
            )

        assertQuaternionEquals(expected.normalized(), actual)
    }

    @Test
    fun vrm0UsesPixivAxisConversion() {
        val sampled = Q(0.1f, 0.2f, 0.3f, 0.9f).normalized()

        val actual =
            retargetVrmAnimationRotation(
                sampled = sampled,
                sourceParentWorldRest = Q.IDENTITY,
                sourceBoneWorldRest = Q.IDENTITY,
                targetParentWorldRest = Q.IDENTITY,
                targetLocalRest = Q.IDENTITY,
                targetIsVrm0 = true,
            )

        assertQuaternionEquals(Q(-sampled.x, sampled.y, -sampled.z, sampled.w), actual)
    }

    @Test
    fun crossfadeReturnsBonesMissingFromNextClipToRest() {
        val rest = axisAngle(1f, 0f, 0f, 8f)
        val previous = axisAngle(0f, 0f, 1f, 70f)

        assertQuaternionEquals(
            previous,
            blendAnimationBone(previous, null, rest, 0f),
        )
        assertQuaternionEquals(
            rest,
            blendAnimationBone(previous, null, rest, 1f),
        )
    }

    @Test
    fun activeClipUsesRestForBonesItDoesNotTrack() {
        val rest = axisAngle(1f, 0f, 0f, -11f)

        assertQuaternionEquals(
            rest,
            blendAnimationBone(null, null, rest, 1f),
        )
    }

    private fun axisAngle(
        x: Float,
        y: Float,
        z: Float,
        degrees: Float,
    ): Q {
        val radians = degrees * PI.toFloat() / 180f
        val half = radians / 2f
        val scale = sin(half)
        return Q(x * scale, y * scale, z * scale, cos(half)).normalized()
    }

    private fun assertQuaternionEquals(
        expected: Q,
        actual: Q,
    ) {
        val dot =
            expected.x * actual.x +
                expected.y * actual.y +
                expected.z * actual.z +
                expected.w * actual.w
        val sign = if (dot < 0f) -1f else 1f
        assertEquals(expected.x, actual.x * sign, 0.0001f)
        assertEquals(expected.y, actual.y * sign, 0.0001f)
        assertEquals(expected.z, actual.z * sign, 0.0001f)
        assertEquals(expected.w, actual.w * sign, 0.0001f)
    }
}
