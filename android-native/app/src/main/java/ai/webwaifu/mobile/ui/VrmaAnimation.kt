package ai.webwaifu.mobile.ui

import dev.romainguy.kotlin.math.Quaternion
import io.github.sceneview.node.ModelNode
import io.github.sceneview.node.Node
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.acos
import kotlin.math.sin
import kotlin.math.sqrt
import org.json.JSONArray
import org.json.JSONObject

/**
 * Minimal native reader for Waifu4's bundled VRMC_vrm_animation clips.
 *
 * VRMA is a GLB containing humanoid bone tracks. Waifu4 retargets those tracks through
 * `createVRMAnimationClip`; this class performs the same normalized-humanoid conversion against
 * SceneView/Filament's raw bone nodes.
 */
internal class NativeVrmaAnimator private constructor(
    val durationSeconds: Float,
    private val bindings: List<BoneBinding>,
) {
    val restPose: Map<Node, Q> =
        bindings.associate { binding -> binding.node to binding.targetLocalRest }

    fun writePose(
        elapsedSeconds: Double,
        output: MutableMap<Node, Q>,
        loop: Boolean = true,
    ) {
        if (durationSeconds <= 0f) return
        val clipTime =
            if (loop) {
                (elapsedSeconds % durationSeconds).toFloat()
            } else {
                elapsedSeconds.toFloat().coerceIn(0f, durationSeconds)
            }
        bindings.forEach { binding ->
            val sampled = binding.track.sample(clipTime)
            val target =
                retargetVrmAnimationRotation(
                    sampled = sampled,
                    sourceParentWorldRest = binding.track.sourceParentWorldRest,
                    sourceBoneWorldRest = binding.track.sourceBoneWorldRest,
                    targetParentWorldRest = binding.targetParentWorldRest,
                    targetLocalRest = binding.targetLocalRest,
                    targetIsVrm0 = binding.targetIsVrm0,
                )
            output[binding.node] = target
        }
    }

    private data class BoneBinding(
        val node: Node,
        val targetLocalRest: Q,
        val targetParentWorldRest: Q,
        val targetIsVrm0: Boolean,
        val track: RotationTrack,
    )

    companion object {
        fun bind(
            clip: VrmaClip,
            modelNode: ModelNode,
            targetRig: TargetHumanoidRig,
        ): NativeVrmaAnimator {
            val nodesByName =
                modelNode.nodes
                    .mapNotNull { node -> node.name?.let { it to node } }
                    .toMap()
            val bindings =
                clip.tracks.mapNotNull { track ->
                    if (track.bone in FACIAL_BONES_OWNED_BY_EXPRESSION_RUNTIME) {
                        return@mapNotNull null
                    }
                    val targetBone = targetRig.bones[track.bone] ?: return@mapNotNull null
                    val node = nodesByName[targetBone.nodeName] ?: return@mapNotNull null
                    BoneBinding(
                        node = node,
                        targetLocalRest = targetBone.localRest,
                        targetParentWorldRest = targetBone.parentWorldRest,
                        targetIsVrm0 = targetRig.isVrm0,
                        track = track,
                    )
                }
            return NativeVrmaAnimator(clip.durationSeconds, bindings)
        }

        private val FACIAL_BONES_OWNED_BY_EXPRESSION_RUNTIME =
            setOf("jaw", "leftEye", "rightEye")
    }
}

internal fun blendAnimationBone(
    previous: Q?,
    current: Q?,
    rest: Q,
    progress: Float,
): Q =
    (previous ?: rest).slerp(
        current ?: rest,
        progress.coerceIn(0f, 1f),
    )

internal fun retargetVrmAnimationRotation(
    sampled: Q,
    sourceParentWorldRest: Q,
    sourceBoneWorldRest: Q,
    targetParentWorldRest: Q,
    targetLocalRest: Q,
    targetIsVrm0: Boolean,
): Q {
    var normalized =
        (
            sourceParentWorldRest *
                sampled *
                sourceBoneWorldRest.inverse()
        ).normalized()
    if (targetIsVrm0) {
        // createVRMAnimationHumanoidTracks applies this conversion for VRM 0.x targets.
        normalized = Q(-normalized.x, normalized.y, -normalized.z, normalized.w)
    }
    // VRMHumanoidRig.update copies a normalized bone rotation back onto its raw bone using
    // inv(parentWorldRest) * normalized * parentWorldRest * localBoneRest.
    return (
        targetParentWorldRest.inverse() *
            normalized *
            targetParentWorldRest *
            targetLocalRest
    ).normalized()
}

internal data class VrmaClip(
    val durationSeconds: Float,
    val tracks: List<RotationTrack>,
)

internal data class RotationTrack(
    val bone: String,
    val times: FloatArray,
    val rotations: List<Q>,
    val sourceParentWorldRest: Q,
    val sourceBoneWorldRest: Q,
) {
    fun sample(time: Float): Q {
        if (times.isEmpty() || rotations.isEmpty()) return sourceBoneWorldRest
        if (times.size == 1 || time <= times.first()) return rotations.first()
        if (time >= times.last()) return rotations.last()

        var low = 0
        var high = times.lastIndex
        while (high - low > 1) {
            val middle = (low + high) / 2
            if (times[middle] <= time) low = middle else high = middle
        }
        val span = times[high] - times[low]
        val fraction = if (span <= 0f) 0f else ((time - times[low]) / span).coerceIn(0f, 1f)
        return rotations[low].slerp(rotations[high], fraction)
    }
}

internal data class Q(
    val x: Float,
    val y: Float,
    val z: Float,
    val w: Float,
) {
    operator fun times(other: Q): Q =
        Q(
            x = w * other.x + x * other.w + y * other.z - z * other.y,
            y = w * other.y - x * other.z + y * other.w + z * other.x,
            z = w * other.z + x * other.y - y * other.x + z * other.w,
            w = w * other.w - x * other.x - y * other.y - z * other.z,
        )

    fun inverse(): Q {
        val norm = x * x + y * y + z * z + w * w
        return if (norm <= 0f) IDENTITY else Q(-x / norm, -y / norm, -z / norm, w / norm)
    }

    fun normalized(): Q {
        val norm = sqrt(x * x + y * y + z * z + w * w)
        return if (norm <= 0f) IDENTITY else Q(x / norm, y / norm, z / norm, w / norm)
    }

    fun slerp(otherValue: Q, amount: Float): Q {
        var other = otherValue
        var dot = x * other.x + y * other.y + z * other.z + w * other.w
        if (dot < 0f) {
            other = Q(-other.x, -other.y, -other.z, -other.w)
            dot = -dot
        }
        if (dot > 0.9995f) {
            return Q(
                x + (other.x - x) * amount,
                y + (other.y - y) * amount,
                z + (other.z - z) * amount,
                w + (other.w - w) * amount,
            ).normalized()
        }
        val theta = acos(dot.coerceIn(-1f, 1f))
        val denominator = sin(theta)
        if (denominator == 0f) return this
        val first = sin((1f - amount) * theta) / denominator
        val second = sin(amount * theta) / denominator
        return Q(
            x * first + other.x * second,
            y * first + other.y * second,
            z * first + other.z * second,
            w * first + other.w * second,
        )
    }

    companion object {
        val IDENTITY = Q(0f, 0f, 0f, 1f)
    }
}

internal data class TargetHumanoidRig(
    val isVrm0: Boolean,
    val bones: Map<String, TargetBoneRest>,
)

internal data class TargetBoneRest(
    val nodeName: String,
    val localRest: Q,
    val parentWorldRest: Q,
)

internal data class VrmExpressionRig(
    val bindingsByTarget: Map<String, Map<String, List<VrmMorphBind>>>,
)

internal data class VrmMorphBind(
    val index: Int,
    val weight: Float,
)

internal object VrmaParser {
    fun parse(bytes: ByteArray): VrmaClip {
        val glb = parseGlb(bytes)
        val root = glb.json
        val humanBones =
            root
                .getJSONObject("extensions")
                .getJSONObject("VRMC_vrm_animation")
                .getJSONObject("humanoid")
                .getJSONObject("humanBones")
        val boneByNode = mutableMapOf<Int, String>()
        humanBones.keys().forEach { bone ->
            boneByNode[humanBones.getJSONObject(bone).getInt("node")] = bone
        }

        val nodes = root.getJSONArray("nodes")
        val parentByNode = buildParentMap(nodes)
        val worldRestRotations = buildWorldRestRotations(nodes, parentByNode)
        val animation = root.getJSONArray("animations").getJSONObject(0)
        val samplers = animation.getJSONArray("samplers")
        val accessors = root.getJSONArray("accessors")
        val bufferViews = root.getJSONArray("bufferViews")
        val tracks = mutableListOf<RotationTrack>()
        var duration = 0f

        val channels = animation.getJSONArray("channels")
        for (index in 0 until channels.length()) {
            val channel = channels.getJSONObject(index)
            val target = channel.getJSONObject("target")
            if (target.getString("path") != "rotation") continue
            val nodeIndex = target.getInt("node")
            val bone = boneByNode[nodeIndex] ?: continue
            val sampler = samplers.getJSONObject(channel.getInt("sampler"))
            val times =
                readAccessor(
                    sampler.getInt("input"),
                    accessors,
                    bufferViews,
                    glb.binary,
                ).map { it[0] }.toFloatArray()
            val rotations =
                readAccessor(
                    sampler.getInt("output"),
                    accessors,
                    bufferViews,
                    glb.binary,
                ).map { Q(it[0], it[1], it[2], it[3]).normalized() }
            val sourceParentWorldRest =
                sourceHumanoidParentWorldRest(
                    bone = bone,
                    nodeIndex = nodeIndex,
                    nodeByBone = boneByNode.entries.associate { (node, name) -> name to node },
                    parentByNode = parentByNode,
                    worldRestRotations = worldRestRotations,
                )
            val sourceBoneWorldRest = worldRestRotations[nodeIndex] ?: Q.IDENTITY
            duration = maxOf(duration, times.lastOrNull() ?: 0f)
            tracks +=
                RotationTrack(
                    bone = bone,
                    times = times,
                    rotations = rotations,
                    sourceParentWorldRest = sourceParentWorldRest,
                    sourceBoneWorldRest = sourceBoneWorldRest,
                )
        }
        return VrmaClip(duration, tracks)
    }

    fun parseTargetHumanoidRig(bytes: ByteArray): TargetHumanoidRig {
        val root = parseGlb(bytes).json
        val nodes = root.getJSONArray("nodes")
        val extensions = root.getJSONObject("extensions")
        val parentByNode = buildParentMap(nodes)
        val worldRestRotations = buildWorldRestRotations(nodes, parentByNode)
        val boneNodes = mutableMapOf<String, Int>()

        extensions.optJSONObject("VRMC_vrm")
            ?.optJSONObject("humanoid")
            ?.optJSONObject("humanBones")
            ?.let { humanBones ->
                humanBones.keys().forEach { bone ->
                    val nodeIndex = humanBones.getJSONObject(bone).getInt("node")
                    boneNodes[bone] = nodeIndex
                }
            }

        extensions.optJSONObject("VRM")
            ?.optJSONObject("humanoid")
            ?.optJSONArray("humanBones")
            ?.let { humanBones ->
                for (index in 0 until humanBones.length()) {
                    val binding = humanBones.getJSONObject(index)
                    val bone = binding.optString("bone")
                    val nodeIndex = binding.optInt("node", -1)
                    if (bone.isBlank() || nodeIndex < 0) continue
                    boneNodes[bone] = nodeIndex
                }
            }

        val bones =
            boneNodes.mapNotNull { (bone, nodeIndex) ->
                val node = nodes.optJSONObject(nodeIndex) ?: return@mapNotNull null
                val nodeName = node.optString("name").takeIf(String::isNotBlank)
                    ?: return@mapNotNull null
                val parentWorldRest =
                    parentByNode[nodeIndex]
                        ?.let { worldRestRotations[it] }
                        ?: Q.IDENTITY
                bone to
                    TargetBoneRest(
                        nodeName = nodeName,
                        localRest = node.optQuaternion("rotation"),
                        parentWorldRest = parentWorldRest,
                    )
            }.toMap()
        return TargetHumanoidRig(
            isVrm0 = extensions.optJSONObject("VRM") != null,
            bones = bones,
        )
    }

    /** Parse the same VRM expression preset bindings used by `VRMExpressionManager`. */
    fun parseExpressionRig(bytes: ByteArray): VrmExpressionRig {
        val root = parseGlb(bytes).json
        val nodes = root.optJSONArray("nodes") ?: JSONArray()
        val meshes = root.optJSONArray("meshes") ?: JSONArray()
        val extensions = root.optJSONObject("extensions") ?: JSONObject()
        val collected =
            linkedMapOf<String, MutableMap<String, MutableList<VrmMorphBind>>>()

        fun add(
            target: String,
            expression: String,
            index: Int,
            weight: Float,
        ) {
            if (target.isBlank() || expression.isBlank() || index < 0) return
            collected
                .getOrPut(target) { linkedMapOf() }
                .getOrPut(expression.lowercase()) { mutableListOf() }
                .add(VrmMorphBind(index, weight.coerceIn(0f, 1f)))
        }

        val vrm1Expressions =
            extensions.optJSONObject("VRMC_vrm")
                ?.optJSONObject("expressions")
        listOf("preset", "custom").forEach groupLoop@ { groupName ->
            val group = vrm1Expressions?.optJSONObject(groupName) ?: return@groupLoop
            group.keys().forEach expressionLoop@ { expression ->
                val binds = group.optJSONObject(expression)?.optJSONArray("morphTargetBinds")
                    ?: return@expressionLoop
                for (index in 0 until binds.length()) {
                    val bind = binds.optJSONObject(index) ?: continue
                    val nodeIndex = bind.optInt("node", -1)
                    val targetNode = nodes.optJSONObject(nodeIndex)
                    val meshIndex = targetNode?.optInt("mesh", -1) ?: -1
                    val targetNames =
                        buildSet {
                            targetNode?.optString("name")?.takeIf(String::isNotBlank)?.let(::add)
                            meshes.optJSONObject(meshIndex)
                                ?.optString("name")
                                ?.takeIf(String::isNotBlank)
                                ?.let(::add)
                        }
                    targetNames.forEach { target ->
                        add(
                            target = target,
                            expression = expression,
                            index = bind.optInt("index", -1),
                            weight = bind.optDouble("weight", 1.0).toFloat(),
                        )
                    }
                }
            }
        }

        extensions.optJSONObject("VRM")
            ?.optJSONObject("blendShapeMaster")
            ?.optJSONArray("blendShapeGroups")
            ?.let { groups ->
                for (groupIndex in 0 until groups.length()) {
                    val group = groups.optJSONObject(groupIndex) ?: continue
                    val expression =
                        group.optString("presetName")
                            .takeUnless { it.equals("unknown", ignoreCase = true) }
                            ?.takeIf(String::isNotBlank)
                            ?: group.optString("name")
                    val binds = group.optJSONArray("binds") ?: continue
                    for (bindIndex in 0 until binds.length()) {
                        val bind = binds.optJSONObject(bindIndex) ?: continue
                        val meshIndex = bind.optInt("mesh", -1)
                        val targetNames =
                            buildSet {
                                meshes.optJSONObject(meshIndex)
                                    ?.optString("name")
                                    ?.takeIf(String::isNotBlank)
                                    ?.let(::add)
                                for (nodeIndex in 0 until nodes.length()) {
                                    nodes.optJSONObject(nodeIndex)
                                        ?.takeIf { it.optInt("mesh", -1) == meshIndex }
                                        ?.optString("name")
                                        ?.takeIf(String::isNotBlank)
                                        ?.let(::add)
                                }
                            }
                        targetNames.forEach { target ->
                            add(
                                target = target,
                                expression = expression,
                                index = bind.optInt("index", -1),
                                weight = (bind.optDouble("weight", 100.0) / 100.0).toFloat(),
                            )
                        }
                    }
                }
            }

        return VrmExpressionRig(
            bindingsByTarget =
                collected.mapValues { (_, expressions) ->
                    expressions.mapValues { (_, binds) -> binds.toList() }
                },
        )
    }

    private fun sourceHumanoidParentWorldRest(
        bone: String,
        nodeIndex: Int,
        nodeByBone: Map<String, Int>,
        parentByNode: Map<Int, Int>,
        worldRestRotations: Map<Int, Q>,
    ): Q {
        if (bone == "hips") {
            return parentByNode[nodeIndex]?.let { worldRestRotations[it] } ?: Q.IDENTITY
        }
        var parentBone = HUMAN_BONE_PARENT[bone]
        while (parentBone != null) {
            val parentNode = nodeByBone[parentBone]
            if (parentNode != null) return worldRestRotations[parentNode] ?: Q.IDENTITY
            parentBone = HUMAN_BONE_PARENT[parentBone]
        }
        return Q.IDENTITY
    }

    private fun buildParentMap(nodes: JSONArray): Map<Int, Int> {
        val parents = mutableMapOf<Int, Int>()
        for (parentIndex in 0 until nodes.length()) {
            val children = nodes.getJSONObject(parentIndex).optJSONArray("children") ?: continue
            for (childIndex in 0 until children.length()) {
                parents[children.getInt(childIndex)] = parentIndex
            }
        }
        return parents
    }

    private fun buildWorldRestRotations(
        nodes: JSONArray,
        parentByNode: Map<Int, Int>,
    ): Map<Int, Q> {
        val rotations = mutableMapOf<Int, Q>()
        fun worldRotation(nodeIndex: Int): Q =
            rotations.getOrPut(nodeIndex) {
                val local = nodes.getJSONObject(nodeIndex).optQuaternion("rotation")
                val parent = parentByNode[nodeIndex]
                if (parent == null) local else (worldRotation(parent) * local).normalized()
            }
        for (nodeIndex in 0 until nodes.length()) worldRotation(nodeIndex)
        return rotations
    }

    private data class Glb(
        val json: JSONObject,
        val binary: ByteArray,
    )

    private fun parseGlb(bytes: ByteArray): Glb {
        val source = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        require(source.int == GLB_MAGIC) { "Not a binary glTF/VRM file." }
        require(source.int == 2) { "Only glTF 2 VRM files are supported." }
        source.int

        var json: JSONObject? = null
        var binary = ByteArray(0)
        while (source.remaining() >= 8) {
            val length = source.int
            val type = source.int
            require(length >= 0 && length <= source.remaining()) { "Invalid GLB chunk." }
            val chunk = ByteArray(length)
            source.get(chunk)
            when (type) {
                JSON_CHUNK -> {
                    val text =
                        chunk.toString(Charsets.UTF_8)
                            .trimEnd('\u0000', ' ', '\n', '\r', '\t')
                    json = JSONObject(text)
                }
                BINARY_CHUNK -> binary = chunk
            }
        }
        return Glb(requireNotNull(json) { "VRM JSON chunk is missing." }, binary)
    }

    private fun readAccessor(
        accessorIndex: Int,
        accessors: JSONArray,
        bufferViews: JSONArray,
        binary: ByteArray,
    ): List<FloatArray> {
        val accessor = accessors.getJSONObject(accessorIndex)
        require(accessor.getInt("componentType") == FLOAT_COMPONENT) {
            "Only float VRMA tracks are supported."
        }
        val components =
            when (accessor.getString("type")) {
                "SCALAR" -> 1
                "VEC3" -> 3
                "VEC4" -> 4
                else -> error("Unsupported VRMA accessor type.")
            }
        val view = bufferViews.getJSONObject(accessor.getInt("bufferView"))
        val baseOffset = view.optInt("byteOffset", 0) + accessor.optInt("byteOffset", 0)
        val stride = view.optInt("byteStride", components * Float.SIZE_BYTES)
        val buffer = ByteBuffer.wrap(binary).order(ByteOrder.LITTLE_ENDIAN)
        return List(accessor.getInt("count")) { item ->
            FloatArray(components) { component ->
                buffer.getFloat(baseOffset + item * stride + component * Float.SIZE_BYTES)
            }
        }
    }

    private fun JSONObject.optQuaternion(key: String): Q {
        val value = optJSONArray(key) ?: return Q.IDENTITY
        return if (value.length() >= 4) {
            Q(
                value.optDouble(0, 0.0).toFloat(),
                value.optDouble(1, 0.0).toFloat(),
                value.optDouble(2, 0.0).toFloat(),
                value.optDouble(3, 1.0).toFloat(),
            ).normalized()
        } else {
            Q.IDENTITY
        }
    }

    private const val GLB_MAGIC = 0x46546C67
    private const val JSON_CHUNK = 0x4E4F534A
    private const val BINARY_CHUNK = 0x004E4942
    private const val FLOAT_COMPONENT = 5126

    private val HUMAN_BONE_PARENT =
        mapOf(
            "spine" to "hips",
            "chest" to "spine",
            "upperChest" to "chest",
            "neck" to "upperChest",
            "head" to "neck",
            "leftEye" to "head",
            "rightEye" to "head",
            "jaw" to "head",
            "leftUpperLeg" to "hips",
            "leftLowerLeg" to "leftUpperLeg",
            "leftFoot" to "leftLowerLeg",
            "leftToes" to "leftFoot",
            "rightUpperLeg" to "hips",
            "rightLowerLeg" to "rightUpperLeg",
            "rightFoot" to "rightLowerLeg",
            "rightToes" to "rightFoot",
            "leftShoulder" to "upperChest",
            "leftUpperArm" to "leftShoulder",
            "leftLowerArm" to "leftUpperArm",
            "leftHand" to "leftLowerArm",
            "rightShoulder" to "upperChest",
            "rightUpperArm" to "rightShoulder",
            "rightLowerArm" to "rightUpperArm",
            "rightHand" to "rightLowerArm",
            "leftThumbMetacarpal" to "leftHand",
            "leftThumbProximal" to "leftThumbMetacarpal",
            "leftThumbDistal" to "leftThumbProximal",
            "leftIndexProximal" to "leftHand",
            "leftIndexIntermediate" to "leftIndexProximal",
            "leftIndexDistal" to "leftIndexIntermediate",
            "leftMiddleProximal" to "leftHand",
            "leftMiddleIntermediate" to "leftMiddleProximal",
            "leftMiddleDistal" to "leftMiddleIntermediate",
            "leftRingProximal" to "leftHand",
            "leftRingIntermediate" to "leftRingProximal",
            "leftRingDistal" to "leftRingIntermediate",
            "leftLittleProximal" to "leftHand",
            "leftLittleIntermediate" to "leftLittleProximal",
            "leftLittleDistal" to "leftLittleIntermediate",
            "rightThumbMetacarpal" to "rightHand",
            "rightThumbProximal" to "rightThumbMetacarpal",
            "rightThumbDistal" to "rightThumbProximal",
            "rightIndexProximal" to "rightHand",
            "rightIndexIntermediate" to "rightIndexProximal",
            "rightIndexDistal" to "rightIndexIntermediate",
            "rightMiddleProximal" to "rightHand",
            "rightMiddleIntermediate" to "rightMiddleProximal",
            "rightMiddleDistal" to "rightMiddleIntermediate",
            "rightRingProximal" to "rightHand",
            "rightRingIntermediate" to "rightRingProximal",
            "rightRingDistal" to "rightRingIntermediate",
            "rightLittleProximal" to "rightHand",
            "rightLittleIntermediate" to "rightLittleProximal",
            "rightLittleDistal" to "rightLittleIntermediate",
        )
}
