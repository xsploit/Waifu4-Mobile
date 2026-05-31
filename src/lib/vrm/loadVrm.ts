import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import type { VRM } from '@pixiv/three-vrm';
import type { VisualSettings } from '../menu/types';

type RotatableVrmUtils = typeof VRMUtils & {
  rotateVRM0?: (vrm: VRM) => void;
};

type MutableMaterial = THREE.Material & { [key: string]: any };

type MeshMaterialState = {
  originalMaterials?: THREE.Material[];
  realisticMaterials?: THREE.Material[];
};

type StoredMToonMaterialState = {
  giEqualizationFactor?: number;
  outlineWidthFactor?: number;
  parametricRimColorFactor?: THREE.Color;
  parametricRimFresnelPowerFactor?: number;
  parametricRimLiftFactor?: number;
  rimLightingMixFactor?: number;
  shadeColorFactor?: THREE.Color;
  shadingShiftFactor?: number;
  shadingToonyFactor?: number;
};

type MaterialUserData = THREE.Material['userData'] & {
  yourwifeyMtoonDefaults?: StoredMToonMaterialState;
};

function createLoader() {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser, { expressionPlugin: undefined }));
  return loader;
}

function disposeMaterial(material: THREE.Material, disposedTextures = new Set<THREE.Texture>()) {
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture && !disposedTextures.has(value)) {
      disposedTextures.add(value);
      value.dispose();
    }
  }

  material.dispose();
}

function asTexture(value: unknown): THREE.Texture | null {
  return value instanceof THREE.Texture ? value : null;
}

function getMeshMaterials(mesh: THREE.Mesh): THREE.Material[] {
  if (!mesh.material) {
    return [];
  }

  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function assignMeshMaterials(mesh: THREE.Mesh, materials: THREE.Material[]) {
  mesh.material = materials.length === 1 ? materials[0]! : materials;
}

function getHexColor(value: string, fallback = '#ffffff'): THREE.Color {
  const normalized = /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
  return new THREE.Color(normalized);
}

function applyOutlineSettings(material: THREE.Material, visualSettings: VisualSettings) {
  const color = getHexColor(visualSettings.outlineColor, '#000000');
  material.userData['outlineParameters'] = {
    thickness: visualSettings.outlineThickness,
    color: color.toArray(),
    alpha: visualSettings.outlineAlpha,
    visible: visualSettings.outline,
    keepAlive: true,
  };
}

function captureMToonDefaults(material: MutableMaterial): StoredMToonMaterialState {
  return {
    giEqualizationFactor: material['giEqualizationFactor'],
    outlineWidthFactor: material['outlineWidthFactor'],
    parametricRimColorFactor: material['parametricRimColorFactor']?.clone?.(),
    parametricRimFresnelPowerFactor: material['parametricRimFresnelPowerFactor'],
    parametricRimLiftFactor: material['parametricRimLiftFactor'],
    rimLightingMixFactor: material['rimLightingMixFactor'],
    shadeColorFactor: material['shadeColorFactor']?.clone?.(),
    shadingShiftFactor: material['shadingShiftFactor'],
    shadingToonyFactor: material['shadingToonyFactor'],
  };
}

function restoreMToonDefaults(material: MutableMaterial) {
  const stored = (material.userData as MaterialUserData).yourwifeyMtoonDefaults;
  if (!stored) {
    return;
  }

  if (typeof stored.giEqualizationFactor === 'number') {
    material['giEqualizationFactor'] = stored.giEqualizationFactor;
  }
  if (typeof stored.outlineWidthFactor === 'number') {
    material['outlineWidthFactor'] = stored.outlineWidthFactor;
  }
  if (stored.parametricRimColorFactor) {
    material['parametricRimColorFactor'] = stored.parametricRimColorFactor.clone();
  }
  if (typeof stored.parametricRimFresnelPowerFactor === 'number') {
    material['parametricRimFresnelPowerFactor'] = stored.parametricRimFresnelPowerFactor;
  }
  if (typeof stored.parametricRimLiftFactor === 'number') {
    material['parametricRimLiftFactor'] = stored.parametricRimLiftFactor;
  }
  if (typeof stored.rimLightingMixFactor === 'number') {
    material['rimLightingMixFactor'] = stored.rimLightingMixFactor;
  }
  if (stored.shadeColorFactor) {
    material['shadeColorFactor'] = stored.shadeColorFactor.clone();
  }
  if (typeof stored.shadingShiftFactor === 'number') {
    material['shadingShiftFactor'] = stored.shadingShiftFactor;
  }
  if (typeof stored.shadingToonyFactor === 'number') {
    material['shadingToonyFactor'] = stored.shadingToonyFactor;
  }
  material.needsUpdate = true;
}

function applyMToonSettings(material: MutableMaterial, visualSettings: VisualSettings) {
  if (!material['isMToonMaterial']) {
    return;
  }

  const userData = material.userData as MaterialUserData;
  if (!userData.yourwifeyMtoonDefaults) {
    userData.yourwifeyMtoonDefaults = captureMToonDefaults(material);
  }

  if (!visualSettings.mtoonTuning) {
    restoreMToonDefaults(material);
    return;
  }

  material['giEqualizationFactor'] = visualSettings.mtoonGiEqualization;
  material['outlineWidthFactor'] = visualSettings.outlineThickness * 1.35;
  material['parametricRimColorFactor'] = getHexColor(visualSettings.mtoonRimColor);
  material['parametricRimFresnelPowerFactor'] = visualSettings.mtoonRimFresnel;
  material['parametricRimLiftFactor'] = visualSettings.mtoonRimLift;
  material['rimLightingMixFactor'] = visualSettings.mtoonRimLightingMix;
  material['shadeColorFactor'] = getHexColor(visualSettings.mtoonShadeColor, '#8a8a8a');
  material['shadingShiftFactor'] = visualSettings.mtoonShadeShift;
  material['shadingToonyFactor'] = visualSettings.mtoonToony;
  material.needsUpdate = true;
}

function applyPbrSettings(material: MutableMaterial, visualSettings: VisualSettings) {
  if (!material['isMeshStandardMaterial'] && !material['isMeshPhysicalMaterial']) {
    return;
  }

  material['roughness'] = visualSettings.pbrRoughness;
  material['metalness'] = visualSettings.pbrMetalness;
  material['envMapIntensity'] = visualSettings.pbrEnvMapIntensity;

  if (material['isMeshPhysicalMaterial']) {
    material['clearcoat'] = visualSettings.pbrClearcoat;
    material['clearcoatRoughness'] = visualSettings.pbrClearcoatRoughness;
    material['specularIntensity'] = visualSettings.pbrSpecularIntensity;
  }

  material.needsUpdate = true;
}

export async function loadVrm(url: string): Promise<VRM> {
  const loader = createLoader();
  const gltf = await loader.loadAsync(url);
  const vrm = gltf.userData['vrm'] as VRM | undefined;

  if (!vrm) {
    throw new Error('Not a VRM file.');
  }

  VRMUtils.removeUnnecessaryVertices?.(vrm.scene);

  if (VRMUtils.combineSkeletons) {
    VRMUtils.combineSkeletons(vrm.scene);
  } else {
    VRMUtils.removeUnnecessaryJoints?.(vrm.scene);
  }

  const utilsWithRotation = VRMUtils as RotatableVrmUtils;
  utilsWithRotation.rotateVRM0?.(vrm);

  vrm.scene.traverse((object) => {
    object.frustumCulled = false;
  });

  vrm.scene.position.set(0, 0.5, 0);
  vrm.scene.rotation.set(0, Math.PI, 0);
  vrm.scene.scale.set(1, 1, 1);

  return vrm;
}

export function makePhysicalFrom(
  oldMaterial: THREE.Material & { [key: string]: any },
  envMap: THREE.Texture | null,
  visualSettings: VisualSettings,
): THREE.Material {
  const uniforms = oldMaterial['uniforms'] as Record<string, { value?: unknown }> | undefined;
  const map =
    (oldMaterial['map'] as THREE.Texture | null | undefined) ??
    asTexture(uniforms?.['mainTexture']?.value) ??
    null;
  const normalMap =
    (oldMaterial['normalMap'] as THREE.Texture | null | undefined) ??
    asTexture(uniforms?.['normalMap']?.value) ??
    null;
  const emissiveMap =
    (oldMaterial['emissiveMap'] as THREE.Texture | null | undefined) ??
    asTexture(uniforms?.['emissiveMap']?.value) ??
    null;
  const emissiveSource = oldMaterial['emissive'] as THREE.Color | undefined;
  const colorSource = oldMaterial['color'] as THREE.Color | undefined;
  const emissiveIntensity = oldMaterial['emissiveIntensity'] as number | undefined;

  if (emissiveMap && !map) {
    return oldMaterial;
  }

  const emissive =
    emissiveSource && emissiveSource.clone ? emissiveSource.clone() : new THREE.Color(0x000000);
  const color =
    colorSource && colorSource.clone ? colorSource.clone() : new THREE.Color(0.9, 0.85, 0.82);

  const parameters: THREE.MeshPhysicalMaterialParameters = {
    map: map || undefined,
    normalMap: normalMap || undefined,
    color: map ? 0xffffff : color,
    emissive,
    emissiveMap: emissiveMap || undefined,
    emissiveIntensity: emissiveIntensity ?? 1,
    roughness: visualSettings.pbrRoughness,
    metalness: visualSettings.pbrMetalness,
    transmission: 0,
    thickness: 0,
    envMapIntensity: envMap ? visualSettings.pbrEnvMapIntensity : 0,
    clearcoat: visualSettings.pbrClearcoat,
    clearcoatRoughness: visualSettings.pbrClearcoatRoughness,
    specularIntensity: visualSettings.pbrSpecularIntensity,
    side: oldMaterial.side !== undefined ? oldMaterial.side : THREE.FrontSide,
    depthWrite: oldMaterial.depthWrite !== undefined ? oldMaterial.depthWrite : true,
    transparent: Boolean(oldMaterial.transparent),
    alphaTest: oldMaterial.alphaTest !== undefined ? oldMaterial.alphaTest : 0,
  };

  if (envMap) {
    parameters.envMap = envMap;
  }

  return new THREE.MeshPhysicalMaterial(parameters);
}

export function applyMaterialSettings(
  root: THREE.Object3D | null | undefined,
  visualSettings: VisualSettings,
) {
  if (!root) {
    return;
  }

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) {
      return;
    }

    getMeshMaterials(mesh).forEach((material) => {
      applyOutlineSettings(material, visualSettings);
      applyMToonSettings(material as MutableMaterial, visualSettings);
      applyPbrSettings(material as MutableMaterial, visualSettings);
    });
  });
}

export function setRealisticMode(
  root: THREE.Object3D | null | undefined,
  envMap: THREE.Texture | null,
  enable: boolean,
  visualSettings: VisualSettings,
) {
  if (!root) {
    return;
  }

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) {
      return;
    }

    const name = object.name?.toLowerCase() || '';
    if (name.includes('eye') || name.includes('iris') || name.includes('lash')) {
      return;
    }

    const meshState = mesh.userData as MeshMaterialState;
    const materials = getMeshMaterials(mesh);

    if (enable) {
      if (!meshState.originalMaterials) {
        meshState.originalMaterials = materials.slice();
      }

      if (!meshState.realisticMaterials) {
        meshState.realisticMaterials = meshState.originalMaterials.map((material) =>
          makePhysicalFrom(material as MutableMaterial, envMap, visualSettings),
        );
      }

      assignMeshMaterials(mesh, meshState.realisticMaterials);
      return;
    }

    const originalMaterials = meshState.originalMaterials;
    if (!originalMaterials) {
      return;
    }

    const originalSet = new Set(originalMaterials);
    meshState.realisticMaterials?.forEach((material) => {
      if (!originalSet.has(material)) {
        material.dispose();
      }
    });
    meshState.realisticMaterials = undefined;
    assignMeshMaterials(mesh, originalMaterials);
  });
}

export function disposeVrm(vrm: VRM) {
  const disposedMaterials = new Set<THREE.Material>();
  const disposedTextures = new Set<THREE.Texture>();

  vrm.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;

    mesh.geometry?.dispose();

    if (!mesh.material) {
      return;
    }

    const meshState = mesh.userData as MeshMaterialState;
    const materials = [
      ...getMeshMaterials(mesh),
      ...(meshState.originalMaterials ?? []),
      ...(meshState.realisticMaterials ?? []),
    ];
    materials.forEach((material) => {
      if (disposedMaterials.has(material)) {
        return;
      }
      disposedMaterials.add(material);
      disposeMaterial(material, disposedTextures);
    });
  });
}
