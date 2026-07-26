package ai.webwaifu.mobile.ui

import com.google.android.filament.Engine
import com.google.android.filament.EntityManager
import com.google.android.filament.Material
import com.google.android.filament.MaterialInstance
import com.google.android.filament.Texture
import com.google.android.filament.TextureSampler
import com.google.android.filament.filamat.MaterialBuilder
import com.google.android.filament.gltfio.AssetLoader
import com.google.android.filament.gltfio.FilamentAsset
import com.google.android.filament.gltfio.MaterialProvider
import com.google.android.filament.gltfio.ResourceLoader
import io.github.sceneview.node.ModelNode
import java.nio.ByteBuffer
import org.json.JSONObject

/**
 * Native Filament implementation of the material stages used by Waifu4's MToonMaterial:
 * toon shade boundary, normal map, emission, parametric rim, matcap, and inverted-hull outline.
 *
 * It intentionally uses gltfio's normal MaterialProvider contract, so mesh loading, skinning,
 * morph targets, texture caching, and animation all remain native.
 */
internal class MToonMaterialProvider(
    private val engine: Engine,
    private val configs: List<VrmMToon.Material>,
) : MaterialProvider {
    private val configsByIndex = configs.associateBy(VrmMToon.Material::index)
    private val materials = linkedMapOf<Int, Material>()
    private val dummyTexture = createDummyTexture(engine)
    private val sampler =
        TextureSampler(
            TextureSampler.MinFilter.LINEAR_MIPMAP_LINEAR,
            TextureSampler.MagFilter.LINEAR,
            TextureSampler.WrapMode.REPEAT,
        )

    init {
        ensureCompilerInitialized()
    }

    override fun createMaterialInstance(
        key: MaterialProvider.MaterialKey,
        uvMap: IntArray,
        label: String?,
        extras: String?,
    ): MaterialInstance {
        val config =
            extras
                ?.takeIf(String::isNotBlank)
                ?.let(::JSONObject)
                ?.optInt(VrmMToon.EXTRAS_MTOON_INDEX, -1)
                ?.takeIf { it >= 0 }
                ?.let(configsByIndex::get)
                ?: configs.firstOrNull { it.name == label }
                ?: configs.first()
        val material = materialFor(key.alphaMode)
        return material.createInstance(label ?: config.name).apply {
            setParameter("baseColorFactor", 1f, 1f, 1f, 1f)
            setParameter("emissiveFactor", 0f, 0f, 0f)
            setParameter("metallicFactor", 0f)
            setParameter("roughnessFactor", 1f)
            setParameter("specularFactor", 1f, 1f, 1f)
            setParameter("glossinessFactor", 1f)
            setParameter("normalScale", config.normalScale)
            setParameter("aoStrength", 1f)
            setParameter("baseColorIndex", uvIndex(key.baseColorUV, key.hasBaseColorTexture, uvMap))
            setParameter("normalIndex", uvIndex(key.normalUV, key.hasNormalTexture, uvMap))
            setParameter("emissiveIndex", uvIndex(key.emissiveUV, key.hasEmissiveTexture, uvMap))
            setParameter(
                "shadeIndex",
                if (config.shadeTexture == config.baseTexture) {
                    uvIndex(key.baseColorUV, key.hasBaseColorTexture, uvMap)
                } else {
                    uvIndex(key.sheenColorUV, key.hasSheenColorTexture, uvMap)
                },
            )
            setParameter(
                "matcapIndex",
                uvIndex(key.metallicRoughnessUV, key.hasMetallicRoughnessTexture, uvMap),
            )
            setParameter("outlineIndex", uvIndex(key.aoUV, key.hasOcclusionTexture, uvMap))
            setMat3("baseColorUvMatrix", IDENTITY_MAT3)
            setMat3("normalUvMatrix", IDENTITY_MAT3)
            setMat3("emissiveUvMatrix", IDENTITY_MAT3)
            setMat3("sheenColorUvMatrix", IDENTITY_MAT3)
            setMat3("metallicRoughnessUvMatrix", IDENTITY_MAT3)
            setMat3("occlusionUvMatrix", IDENTITY_MAT3)

            setParameter("baseColorMap", dummyTexture, sampler)
            setParameter("normalMap", dummyTexture, sampler)
            setParameter("emissiveMap", dummyTexture, sampler)
            setParameter("sheenColorMap", dummyTexture, sampler)
            setParameter("metallicRoughnessMap", dummyTexture, sampler)
            setParameter("occlusionMap", dummyTexture, sampler)

            setParameter("hasBaseColorTexture", key.hasBaseColorTexture)
            setParameter("hasNormalTexture", key.hasNormalTexture)
            setParameter("hasEmissiveTexture", key.hasEmissiveTexture)
            setParameter("hasShadeMultiplyTexture", config.shadeTexture != null)
            setParameter("shadeUsesBaseMap", config.shadeTexture == config.baseTexture)
            setParameter("hasMatcapTexture", config.matcapTexture != null)
            setParameter("hasOutlineWidthTexture", config.outlineWidthTexture != null)
            setParameter("isOutline", false)
            setParameter("shadeColorFactor", config.shadeColor[0], config.shadeColor[1], config.shadeColor[2])
            setParameter("shadingShiftFactor", config.shadingShift)
            setParameter("shadingToonyFactor", config.shadingToony)
            setParameter("giEqualizationFactor", config.giEqualization)
            setParameter("rimColorFactor", config.rimColor[0], config.rimColor[1], config.rimColor[2])
            setParameter("rimLightingMixFactor", config.rimLightingMix)
            setParameter("rimFresnelPowerFactor", config.rimFresnelPower)
            setParameter("rimLiftFactor", config.rimLift)
            setParameter("outlineWidthMode", config.outlineWidthMode)
            setParameter("outlineWidthFactor", config.outlineWidth)
            setParameter(
                "outlineColorFactor",
                config.outlineColor[0],
                config.outlineColor[1],
                config.outlineColor[2],
                config.outlineColor[3],
            )
            setParameter("outlineLightingMixFactor", config.outlineLightingMix)
            setParameter("sheenColorFactor", 0f, 0f, 0f)
            setParameter("sheenRoughnessFactor", 0f)

            setDoubleSided(config.doubleSided)
            setCullingMode(
                if (config.doubleSided) Material.CullingMode.NONE else Material.CullingMode.BACK,
            )
            setDepthWrite(key.alphaMode != ALPHA_BLEND || config.transparentWithZWrite)
        }
    }

    override fun getMaterial(
        key: MaterialProvider.MaterialKey,
        uvMap: IntArray,
        label: String?,
    ): Material = materialFor(key.alphaMode)

    override fun getMaterials(): Array<Material> = materials.values.toTypedArray()

    override fun needsDummyData(attribute: Int): Boolean =
        attribute == VERTEX_COLOR || attribute == VERTEX_UV0 || attribute == VERTEX_UV1

    override fun destroyMaterials() {
        materials.values.forEach(engine::destroyMaterial)
        materials.clear()
    }

    override fun destroy() {
        destroyMaterials()
        engine.destroyTexture(dummyTexture)
    }

    /** Compile outside AssetLoader's JNI callback so shader diagnostics can never abort the VM. */
    fun prepareMaterials() {
        materialFor(0)
        materialFor(ALPHA_MASK)
        materialFor(ALPHA_BLEND)
    }

    private fun materialFor(alphaMode: Int): Material =
        materials.getOrPut(alphaMode) {
            val blending =
                when (alphaMode) {
                    ALPHA_MASK -> MaterialBuilder.BlendingMode.MASKED
                    ALPHA_BLEND -> MaterialBuilder.BlendingMode.TRANSPARENT
                    else -> MaterialBuilder.BlendingMode.OPAQUE
                }
            val packageBuffer =
                MaterialBuilder()
                    .name("WebWaifuMToon-$alphaMode")
                    .platform(MaterialBuilder.Platform.MOBILE)
                    .targetApi(MaterialBuilder.TargetApi.OPENGL)
                    .optimization(MaterialBuilder.Optimization.PERFORMANCE)
                    .shading(MaterialBuilder.Shading.LIT)
                    .blending(blending)
                    .culling(MaterialBuilder.CullingMode.NONE)
                    .doubleSided(true)
                    .customSurfaceShading(true)
                    .require(MaterialBuilder.VertexAttribute.UV0)
                    .uniform(MaterialBuilder.UniformType.FLOAT4, "baseColorFactor")
                    .uniform(MaterialBuilder.UniformType.FLOAT3, "emissiveFactor")
                    .uniform(MaterialBuilder.UniformType.FLOAT, "metallicFactor")
                    .uniform(MaterialBuilder.UniformType.FLOAT, "roughnessFactor")
                    .uniform(MaterialBuilder.UniformType.FLOAT3, "specularFactor")
                    .uniform(MaterialBuilder.UniformType.FLOAT, "glossinessFactor")
                    .uniform(MaterialBuilder.UniformType.FLOAT, "normalScale")
                    .uniform(MaterialBuilder.UniformType.FLOAT, "aoStrength")
                    .uniform(MaterialBuilder.UniformType.INT, "baseColorIndex")
                    .uniform(MaterialBuilder.UniformType.INT, "normalIndex")
                    .uniform(MaterialBuilder.UniformType.INT, "emissiveIndex")
                    .uniform(MaterialBuilder.UniformType.INT, "shadeIndex")
                    .uniform(MaterialBuilder.UniformType.INT, "matcapIndex")
                    .uniform(MaterialBuilder.UniformType.INT, "outlineIndex")
                    .uniform(MaterialBuilder.UniformType.MAT3, "baseColorUvMatrix")
                    .uniform(MaterialBuilder.UniformType.MAT3, "normalUvMatrix")
                    .uniform(MaterialBuilder.UniformType.MAT3, "emissiveUvMatrix")
                    .uniform(MaterialBuilder.UniformType.MAT3, "sheenColorUvMatrix")
                    .uniform(MaterialBuilder.UniformType.MAT3, "metallicRoughnessUvMatrix")
                    .uniform(MaterialBuilder.UniformType.MAT3, "occlusionUvMatrix")
                    .uniform(MaterialBuilder.UniformType.BOOL, "hasBaseColorTexture")
                    .uniform(MaterialBuilder.UniformType.BOOL, "hasNormalTexture")
                    .uniform(MaterialBuilder.UniformType.BOOL, "hasEmissiveTexture")
                    .uniform(MaterialBuilder.UniformType.BOOL, "hasShadeMultiplyTexture")
                    .uniform(MaterialBuilder.UniformType.BOOL, "shadeUsesBaseMap")
                    .uniform(MaterialBuilder.UniformType.BOOL, "hasMatcapTexture")
                    .uniform(MaterialBuilder.UniformType.BOOL, "hasOutlineWidthTexture")
                    .uniform(MaterialBuilder.UniformType.BOOL, "isOutline")
                    .uniform(MaterialBuilder.UniformType.FLOAT3, "shadeColorFactor")
                    .uniform(MaterialBuilder.UniformType.FLOAT, "shadingShiftFactor")
                    .uniform(MaterialBuilder.UniformType.FLOAT, "shadingToonyFactor")
                    .uniform(MaterialBuilder.UniformType.FLOAT, "giEqualizationFactor")
                    .uniform(MaterialBuilder.UniformType.FLOAT3, "rimColorFactor")
                    .uniform(MaterialBuilder.UniformType.FLOAT, "rimLightingMixFactor")
                    .uniform(MaterialBuilder.UniformType.FLOAT, "rimFresnelPowerFactor")
                    .uniform(MaterialBuilder.UniformType.FLOAT, "rimLiftFactor")
                    .uniform(MaterialBuilder.UniformType.INT, "outlineWidthMode")
                    .uniform(MaterialBuilder.UniformType.FLOAT, "outlineWidthFactor")
                    .uniform(MaterialBuilder.UniformType.FLOAT4, "outlineColorFactor")
                    .uniform(MaterialBuilder.UniformType.FLOAT, "outlineLightingMixFactor")
                    .uniform(MaterialBuilder.UniformType.FLOAT3, "sheenColorFactor")
                    .uniform(MaterialBuilder.UniformType.FLOAT, "sheenRoughnessFactor")
                    .sampler("baseColorMap")
                    .sampler("normalMap")
                    .sampler("emissiveMap")
                    .sampler("sheenColorMap")
                    .sampler("metallicRoughnessMap")
                    .sampler("occlusionMap")
                    .material(MTOON_FRAGMENT)
                    .materialVertex(MTOON_VERTEX)
                    .build(engine)
            check(packageBuffer.isValid) { "Filament rejected the native MToon shader." }
            Material.Builder()
                .payload(packageBuffer.buffer, packageBuffer.buffer.remaining())
                .build(engine)
        }

    private fun MaterialBuilder.uniform(
        type: MaterialBuilder.UniformType,
        name: String,
    ): MaterialBuilder = uniformParameter(type, name)

    private fun MaterialBuilder.sampler(name: String): MaterialBuilder =
        samplerParameter(
            MaterialBuilder.SamplerType.SAMPLER_2D,
            MaterialBuilder.SamplerFormat.FLOAT,
            MaterialBuilder.ParameterPrecision.DEFAULT,
            name,
        )

    private fun MaterialInstance.setMat3(
        name: String,
        value: FloatArray,
    ) {
        setParameter(name, MaterialInstance.FloatElement.MAT3, value, 0, 1)
    }

    private fun uvIndex(
        source: Int,
        hasTexture: Boolean,
        uvMap: IntArray,
    ): Int =
        if (hasTexture && source in uvMap.indices) {
            (uvMap[source] - 1).coerceAtLeast(0)
        } else {
            0
        }

    private companion object {
        private const val ALPHA_MASK = 1
        private const val ALPHA_BLEND = 2
        private const val VERTEX_COLOR = 2
        private const val VERTEX_UV0 = 3
        private const val VERTEX_UV1 = 4
        private val IDENTITY_MAT3 =
            floatArrayOf(
                1f, 0f, 0f,
                0f, 1f, 0f,
                0f, 0f, 1f,
            )
        private var compilerInitialized = false

        @Synchronized
        private fun ensureCompilerInitialized() {
            if (!compilerInitialized) {
                MaterialBuilder.init()
                compilerInitialized = true
            }
        }

        private fun createDummyTexture(engine: Engine): Texture {
            val texture =
                Texture.Builder()
                    .width(1)
                    .height(1)
                    .levels(1)
                    .sampler(Texture.Sampler.SAMPLER_2D)
                    .format(Texture.InternalFormat.RGBA8)
                    .build(engine)
            val pixel = ByteBuffer.allocateDirect(4).put(byteArrayOf(-1, -1, -1, -1)).apply { flip() }
            texture.setImage(
                engine,
                0,
                Texture.PixelBufferDescriptor(pixel, Texture.Format.RGBA, Texture.Type.UBYTE),
            )
            return texture
        }

        private val MTOON_VERTEX =
            """
            void materialVertex(inout MaterialVertexInputs material) {
                if (!materialParams.isOutline || materialParams.outlineWidthMode == 0 ||
                        materialParams.outlineWidthFactor <= 0.0) {
                    return;
                }
                float width = materialParams.outlineWidthFactor;
                if (materialParams.hasOutlineWidthTexture) {
                    vec2 uv = (materialParams.occlusionUvMatrix * vec3(material.uv0, 1.0)).xy;
                    width *= textureLod(materialParams_occlusionMap, uv, 0.0).g;
                }
                if (materialParams.outlineWidthMode == 2) {
                    width *= max(0.25, length(material.worldPosition.xyz));
                }
                material.worldPosition.xyz += normalize(material.worldNormal) * width;
            }
            """.trimIndent()

        private val MTOON_FRAGMENT =
            """
            vec2 mtoonUv(int index, mat3 uvMatrix) {
                return (uvMatrix * vec3(getUV0(), 1.0)).xy;
            }

            vec4 mtoonBaseColor() {
                vec4 color = materialParams.baseColorFactor;
                if (materialParams.hasBaseColorTexture) {
                    color *= texture(
                        materialParams_baseColorMap,
                        mtoonUv(materialParams.baseColorIndex, materialParams.baseColorUvMatrix)
                    );
                }
                return color;
            }

            vec3 mtoonShadeColor() {
                vec3 color = materialParams.shadeColorFactor;
                if (materialParams.hasShadeMultiplyTexture) {
                    if (materialParams.shadeUsesBaseMap) {
                        color *= texture(
                            materialParams_baseColorMap,
                            mtoonUv(materialParams.shadeIndex, materialParams.baseColorUvMatrix)
                        ).rgb;
                    } else {
                        color *= texture(
                            materialParams_sheenColorMap,
                            mtoonUv(materialParams.shadeIndex, materialParams.sheenColorUvMatrix)
                        ).rgb;
                    }
                }
                return color;
            }

            void material(inout MaterialInputs material) {
                vec4 base = mtoonBaseColor();
                if (materialParams.isOutline) {
                    if (materialParams.outlineWidthMode == 0 ||
                            materialParams.outlineWidthFactor <= 0.0) {
                        discard;
                    }
                    material.baseColor = vec4(
                        materialParams.outlineColorFactor.rgb,
                        base.a * materialParams.outlineColorFactor.a
                    );
                    material.roughness = 1.0;
                    material.metallic = 0.0;
                    prepareMaterial(material);
                    return;
                }

                if (materialParams.hasNormalTexture) {
                    vec3 normal = texture(
                        materialParams_normalMap,
                        mtoonUv(materialParams.normalIndex, materialParams.normalUvMatrix)
                    ).xyz * 2.0 - 1.0;
                    normal.xy *= materialParams.normalScale;
                    material.normal = normalize(normal);
                }
                material.baseColor = base;
                material.metallic = 0.0;
                material.roughness = 1.0;
                material.ambientOcclusion = mix(1.0, 0.9, materialParams.giEqualizationFactor);
                if (materialParams.hasEmissiveTexture) {
                    vec3 emission = texture(
                        materialParams_emissiveMap,
                        mtoonUv(materialParams.emissiveIndex, materialParams.emissiveUvMatrix)
                    ).rgb;
                    material.emissive = vec4(emission * materialParams.emissiveFactor, 0.0);
                } else {
                    material.emissive = vec4(materialParams.emissiveFactor, 0.0);
                }
                prepareMaterial(material);

                vec3 rim = vec3(0.0);
                float rimAmount = pow(
                    saturate(1.0 - getNdotV() + materialParams.rimLiftFactor),
                    max(0.001, materialParams.rimFresnelPowerFactor)
                );
                rim += materialParams.rimColorFactor * rimAmount;

                if (materialParams.hasMatcapTexture) {
                    vec3 viewNormal = mat3(getViewFromWorldMatrix()) * getWorldNormalVector();
                    vec2 matcapUv = viewNormal.xy * 0.5 + 0.5;
                    rim += texture(materialParams_metallicRoughnessMap, matcapUv).rgb;
                }
                // Waifu4 lights every avatar with ambient white plus a blue-sky/dark-ground
                // hemisphere light. Filament has no hemisphere light entity, so preserve that
                // contribution here while the three directional lights use native light nodes.
                float hemiMix = getWorldNormalVector().y * 0.5 + 0.5;
                vec3 hemi = mix(
                    vec3(0.0116, 0.0137, 0.0194),
                    vec3(0.7388, 0.8070, 1.0),
                    saturate(hemiMix)
                ) * 0.35;
                vec3 ambientLight = vec3(0.35) + hemi;
                material.postLightingColor = vec4(
                    base.rgb * ambientLight +
                        rim * mix(0.65, 1.0, materialParams.rimLightingMixFactor),
                    1.0
                );
            }

            vec3 surfaceShading(
                    const MaterialInputs materialInputs,
                    const ShadingData shadingData,
                    const LightData lightData) {
                vec3 light = lightData.colorIntensity.rgb * lightData.colorIntensity.w;
                if (materialParams.isOutline) {
                    float outlineLight = mix(
                        1.0,
                        lightData.NdotL * lightData.visibility * lightData.attenuation,
                        materialParams.outlineLightingMixFactor
                    );
                    return materialParams.outlineColorFactor.rgb * light * outlineLight;
                }

                float signedNdotL = dot(getWorldNormalVector(), lightData.l);
                float shifted = signedNdotL + materialParams.shadingShiftFactor;
                float feather = max(0.0001, 1.0 - materialParams.shadingToonyFactor);
                float toon = saturate((shifted - (-feather)) / (2.0 * feather));
                toon *= lightData.visibility * lightData.attenuation;

                vec3 base = mtoonBaseColor().rgb;
                vec3 shade = mtoonShadeColor();
                vec3 color = mix(shade, base, toon);
                return min(color * light, base);
            }
            """.trimIndent()
    }
}

/** Owns a gltfio asset whose body and outline instances share meshes, textures, and source data. */
internal class NativeMToonModel private constructor(
    val bodyNode: ModelNode,
    val outlineNode: ModelNode,
    private val asset: FilamentAsset,
    private val assetLoader: AssetLoader,
    private val resourceLoader: ResourceLoader,
    private val materialProvider: MToonMaterialProvider,
) {
    fun destroyResources() {
        assetLoader.destroyAsset(asset)
        resourceLoader.destroy()
        assetLoader.destroy()
        materialProvider.destroy()
    }

    companion object {
        fun create(
            engine: Engine,
            prepared: VrmMToon.PreparedModel,
        ): NativeMToonModel {
            require(prepared.materials.isNotEmpty()) { "The VRM does not contain MToon materials." }
            val provider = MToonMaterialProvider(engine, prepared.materials)
            provider.prepareMaterials()
            val assetLoader = AssetLoader(engine, provider, EntityManager.get())
            val resourceLoader = ResourceLoader(engine)
            try {
                val asset =
                    requireNotNull(assetLoader.createAsset(ByteBuffer.wrap(prepared.bytes))) {
                        "Filament could not create the native MToon asset."
                    }
                val bodyInstance = requireNotNull(asset.instance)
                val outlineInstance =
                    requireNotNull(assetLoader.createInstance(asset)) {
                        "Filament could not create the shared outline instance."
                    }
                resourceLoader.loadResources(asset)
                asset.releaseSourceData()

                bodyInstance.materialInstances.forEach { material ->
                    material.setParameter("isOutline", false)
                }
                outlineInstance.materialInstances.forEach { material ->
                    material.setParameter("isOutline", true)
                    material.setCullingMode(Material.CullingMode.FRONT)
                    material.setDoubleSided(false)
                    material.setDepthWrite(true)
                    material.setDepthCulling(true)
                }
                val bodyNode = ModelNode(modelInstance = bodyInstance, autoAnimate = false)
                val outlineNode = ModelNode(modelInstance = outlineInstance, autoAnimate = false)
                return NativeMToonModel(
                    bodyNode = bodyNode,
                    outlineNode = outlineNode,
                    asset = asset,
                    assetLoader = assetLoader,
                    resourceLoader = resourceLoader,
                    materialProvider = provider,
                )
            } catch (error: Throwable) {
                resourceLoader.destroy()
                assetLoader.destroy()
                provider.destroy()
                throw error
            }
        }
    }
}
