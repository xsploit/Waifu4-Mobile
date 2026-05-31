import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { BVHLoader } from 'three/examples/jsm/loaders/BVHLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import {
  createVRMAnimationClip,
  VRMAnimationLoaderPlugin,
  VRMLookAtQuaternionProxy,
  type VRMAnimation,
} from '@pixiv/three-vrm-animation';
import type { AnimationEntry, AnimationFormat } from '../menu/types';

type VrmExpressionManager = NonNullable<VRM['expressionManager']>;

// Mixamo to VRM humanoid bone map (from three-vrm examples)
export const mixamoVRMRigMap: Partial<Record<string, VRMHumanBoneName>> = {
  mixamorigHips: 'hips',
  mixamorigSpine: 'spine',
  mixamorigSpine1: 'chest',
  mixamorigSpine2: 'upperChest',
  mixamorigNeck: 'neck',
  mixamorigHead: 'head',
  mixamorigLeftShoulder: 'leftShoulder',
  mixamorigLeftArm: 'leftUpperArm',
  mixamorigLeftForeArm: 'leftLowerArm',
  mixamorigLeftHand: 'leftHand',
  mixamorigLeftHandThumb1: 'leftThumbMetacarpal',
  mixamorigLeftHandThumb2: 'leftThumbProximal',
  mixamorigLeftHandThumb3: 'leftThumbDistal',
  mixamorigLeftHandIndex1: 'leftIndexProximal',
  mixamorigLeftHandIndex2: 'leftIndexIntermediate',
  mixamorigLeftHandIndex3: 'leftIndexDistal',
  mixamorigLeftHandMiddle1: 'leftMiddleProximal',
  mixamorigLeftHandMiddle2: 'leftMiddleIntermediate',
  mixamorigLeftHandMiddle3: 'leftMiddleDistal',
  mixamorigLeftHandRing1: 'leftRingProximal',
  mixamorigLeftHandRing2: 'leftRingIntermediate',
  mixamorigLeftHandRing3: 'leftRingDistal',
  mixamorigLeftHandPinky1: 'leftLittleProximal',
  mixamorigLeftHandPinky2: 'leftLittleIntermediate',
  mixamorigLeftHandPinky3: 'leftLittleDistal',
  mixamorigRightShoulder: 'rightShoulder',
  mixamorigRightArm: 'rightUpperArm',
  mixamorigRightForeArm: 'rightLowerArm',
  mixamorigRightHand: 'rightHand',
  mixamorigRightHandThumb1: 'rightThumbMetacarpal',
  mixamorigRightHandThumb2: 'rightThumbProximal',
  mixamorigRightHandThumb3: 'rightThumbDistal',
  mixamorigRightHandIndex1: 'rightIndexProximal',
  mixamorigRightHandIndex2: 'rightIndexIntermediate',
  mixamorigRightHandIndex3: 'rightIndexDistal',
  mixamorigRightHandMiddle1: 'rightMiddleProximal',
  mixamorigRightHandMiddle2: 'rightMiddleIntermediate',
  mixamorigRightHandMiddle3: 'rightMiddleDistal',
  mixamorigRightHandRing1: 'rightRingProximal',
  mixamorigRightHandRing2: 'rightRingIntermediate',
  mixamorigRightHandRing3: 'rightRingDistal',
  mixamorigRightHandPinky1: 'rightLittleProximal',
  mixamorigRightHandPinky2: 'rightLittleIntermediate',
  mixamorigRightHandPinky3: 'rightLittleDistal',
  mixamorigLeftUpLeg: 'leftUpperLeg',
  mixamorigLeftLeg: 'leftLowerLeg',
  mixamorigLeftFoot: 'leftFoot',
  mixamorigLeftToeBase: 'leftToes',
  mixamorigRightUpLeg: 'rightUpperLeg',
  mixamorigRightLeg: 'rightLowerLeg',
  mixamorigRightFoot: 'rightFoot',
  mixamorigRightToeBase: 'rightToes',
};

// Simple bone map for retargeting generic FBX
const simpleBoneMap: Record<string, string> = {
  Hips: 'J_Bip_C_Hips',
  Spine: 'J_Bip_C_Spine',
  Spine1: 'J_Bip_C_Chest',
  Spine2: 'J_Bip_C_UpperChest',
  Neck: 'J_Bip_C_Neck',
  Head: 'J_Bip_C_Head',
  LeftShoulder: 'J_Bip_L_Shoulder',
  LeftArm: 'J_Bip_L_UpperArm',
  LeftForeArm: 'J_Bip_L_LowerArm',
  LeftHand: 'J_Bip_L_Hand',
  RightShoulder: 'J_Bip_R_Shoulder',
  RightArm: 'J_Bip_R_UpperArm',
  RightForeArm: 'J_Bip_R_LowerArm',
  RightHand: 'J_Bip_R_Hand',
  LeftUpLeg: 'J_Bip_L_UpperLeg',
  LeftLeg: 'J_Bip_L_LowerLeg',
  LeftFoot: 'J_Bip_L_Foot',
  RightUpLeg: 'J_Bip_R_UpperLeg',
  RightLeg: 'J_Bip_R_LowerLeg',
  RightFoot: 'J_Bip_R_Foot',
};

const genericVRMRigMap: Record<string, VRMHumanBoneName> = {
  hips: 'hips',
  hip: 'hips',
  pelvis: 'hips',
  spine: 'spine',
  spine1: 'chest',
  chest: 'chest',
  spine2: 'upperChest',
  upperchest: 'upperChest',
  neck: 'neck',
  head: 'head',
  leftshoulder: 'leftShoulder',
  lshoulder: 'leftShoulder',
  leftarm: 'leftUpperArm',
  leftupperarm: 'leftUpperArm',
  larm: 'leftUpperArm',
  rightshoulder: 'rightShoulder',
  rshoulder: 'rightShoulder',
  rightarm: 'rightUpperArm',
  rightupperarm: 'rightUpperArm',
  rarm: 'rightUpperArm',
  leftforearm: 'leftLowerArm',
  leftlowerarm: 'leftLowerArm',
  lelbow: 'leftLowerArm',
  rightforearm: 'rightLowerArm',
  rightlowerarm: 'rightLowerArm',
  relbow: 'rightLowerArm',
  lefthand: 'leftHand',
  lhand: 'leftHand',
  righthand: 'rightHand',
  rhand: 'rightHand',
  leftupleg: 'leftUpperLeg',
  leftupperleg: 'leftUpperLeg',
  leftleg: 'leftLowerLeg',
  leftlowerleg: 'leftLowerLeg',
  leftfoot: 'leftFoot',
  lefttoebase: 'leftToes',
  lefttoe: 'leftToes',
  rightupleg: 'rightUpperLeg',
  rightupperleg: 'rightUpperLeg',
  rightleg: 'rightLowerLeg',
  rightlowerleg: 'rightLowerLeg',
  rightfoot: 'rightFoot',
  righttoebase: 'rightToes',
  righttoe: 'rightToes',
};

const expressionAliases: Record<string, string> = {
  a: 'aa',
  blinkl: 'blinkLeft',
  blinkleft: 'blinkLeft',
  blinkr: 'blinkRight',
  blinkright: 'blinkRight',
  e: 'ee',
  fclallangry: 'angry',
  fclallfun: 'relaxed',
  fclalljoy: 'happy',
  fclallneutral: 'neutral',
  fclallsorrow: 'sad',
  fclallsurprised: 'surprised',
  fcleyeclose: 'blink',
  fcleyeclosel: 'blinkLeft',
  fcleyecloser: 'blinkRight',
  fclmtha: 'aa',
  fclmthe: 'ee',
  fclmthi: 'ih',
  fclmtho: 'oh',
  fclmthu: 'ou',
  fun: 'relaxed',
  i: 'ih',
  joy: 'happy',
  lookdown: 'lookDown',
  lookleft: 'lookLeft',
  lookright: 'lookRight',
  lookup: 'lookUp',
  o: 'oh',
  sorrow: 'sad',
  surprise: 'surprised',
  u: 'ou',
};

const PROCEDURAL_GAZE_TRACK_MARKERS = [
  'vrmlookatquaternionproxy',
  'lookat',
  'lookleft',
  'lookright',
  'lookup',
  'lookdown',
  'lefteye',
  'righteye',
];

const fbxLoader = new FBXLoader();
const bvhLoader = new BVHLoader();
const vrmaLoader = new GLTFLoader();
const fbxAssetCache = new Map<string, Promise<THREE.Group>>();
const bvhAssetCache = new Map<string, ReturnType<typeof bvhLoader.loadAsync>>();
const vrmaAssetCache = new Map<string, ReturnType<typeof vrmaLoader.loadAsync>>();
const sniffedFormatCache = new Map<string, Promise<AnimationFormat | null>>();
const retargetedClipCache = new WeakMap<VRM, Map<string, Promise<THREE.AnimationClip | null>>>();

bvhLoader.animateBonePositions = false;
vrmaLoader.register((parser) => new VRMAnimationLoaderPlugin(parser));

function normalizeAnimationUrl(url: string) {
  const trimmed = url.trim();
  return trimmed.startsWith('./assets/') ? trimmed.replace(/^\.\//, '/') : trimmed;
}

function loadFbxAsset(url: string) {
  const normalizedUrl = normalizeAnimationUrl(url);
  const cached = fbxAssetCache.get(normalizedUrl);
  if (cached) {
    return cached;
  }

  const pending = fbxLoader.loadAsync(normalizedUrl).catch((error) => {
    fbxAssetCache.delete(normalizedUrl);
    throw error;
  });
  fbxAssetCache.set(normalizedUrl, pending);
  return pending;
}

function loadBvhAsset(url: string) {
  const normalizedUrl = normalizeAnimationUrl(url);
  const cached = bvhAssetCache.get(normalizedUrl);
  if (cached) {
    return cached;
  }

  const pending = bvhLoader.loadAsync(normalizedUrl).catch((error) => {
    bvhAssetCache.delete(normalizedUrl);
    throw error;
  });
  bvhAssetCache.set(normalizedUrl, pending);
  return pending;
}

function loadVrmaAsset(url: string) {
  const normalizedUrl = normalizeAnimationUrl(url);
  const cached = vrmaAssetCache.get(normalizedUrl);
  if (cached) {
    return cached;
  }

  const pending = vrmaLoader.loadAsync(normalizedUrl).catch((error) => {
    vrmaAssetCache.delete(normalizedUrl);
    throw error;
  });
  vrmaAssetCache.set(normalizedUrl, pending);
  return pending;
}

async function sniffAnimationFormat(url: string): Promise<AnimationFormat | null> {
  const normalizedUrl = normalizeAnimationUrl(url);
  const cached = sniffedFormatCache.get(normalizedUrl);
  if (cached) {
    return cached;
  }

  const pending = fetch(normalizedUrl)
    .then(async (response) => {
      if (!response.ok) {
        return null;
      }

      const bytes = new Uint8Array(await response.arrayBuffer());
      const prefix = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 96));
      const trimmedPrefix = prefix.trimStart();

      if (bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46) {
        const version = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
          4,
          true,
        );
        return version >= 2 ? 'glb' : null;
      }
      if (prefix.startsWith('Kaydara FBX Binary') || trimmedPrefix.startsWith('; FBX')) {
        return 'fbx';
      }
      if (trimmedPrefix.startsWith('HIERARCHY')) {
        return 'bvh';
      }
      if (trimmedPrefix.startsWith('{')) {
        try {
          const gltf = JSON.parse(new TextDecoder('utf-8', { fatal: false }).decode(bytes)) as {
            asset?: { version?: unknown };
          };
          const version = Number.parseFloat(String(gltf.asset?.version ?? '0'));
          return version >= 2 ? 'gltf' : null;
        } catch {
          return null;
        }
      }

      return null;
    })
    .catch(() => null);

  sniffedFormatCache.set(normalizedUrl, pending);
  return pending;
}

function inferAnimationFormat(url: string, format?: AnimationFormat): AnimationFormat {
  if (format) {
    return format;
  }

  const cleanUrl = url.split('?')[0]?.split('#')[0]?.toLowerCase() ?? '';
  if (cleanUrl.endsWith('.vrma')) return 'vrma';
  if (cleanUrl.endsWith('.bvh')) return 'bvh';
  if (cleanUrl.endsWith('.glb')) return 'glb';
  if (cleanUrl.endsWith('.gltf')) return 'gltf';
  return 'fbx';
}

async function resolveAnimationFormat(
  entry: Pick<AnimationEntry, 'url' | 'format'>,
): Promise<AnimationFormat> {
  const requested = inferAnimationFormat(entry.url, entry.format);
  if (requested === 'fbx' || requested === 'bvh') {
    return requested;
  }

  const sniffed = await sniffAnimationFormat(entry.url);
  if (!sniffed || sniffed === requested) {
    return requested;
  }
  if (requested === 'vrma' && (sniffed === 'glb' || sniffed === 'gltf')) {
    return requested;
  }

  console.warn(
    `[VrmStage] Animation "${entry.url}" was marked as ${requested}, but the file header looks like ${sniffed}. Using ${sniffed}.`,
  );
  return sniffed;
}

function normalizeRigName(name: string) {
  return name
    .split('|')
    .pop()!
    .split(':')
    .pop()!
    .replace(/^mixamorig/i, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}

function normalizeExpressionKey(name: string) {
  return name.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function addExpressionNameCandidates(candidates: string[], rawName: string | null | undefined) {
  const trimmed = rawName?.trim();
  if (!trimmed) {
    return;
  }

  const baseNames = [
    trimmed,
    trimmed.split('|').pop() ?? trimmed,
    trimmed.split(':').pop() ?? trimmed,
    trimmed.split('/').pop() ?? trimmed,
    trimmed.split('.').pop() ?? trimmed,
  ];
  const prefixes = [
    /^VRMExpression[_\s.-]*/i,
    /^BlendShape[_\s.-]*/i,
    /^BlendShapeProxy[_\s.-]*/i,
    /^Expression[_\s.-]*/i,
    /^Preset[_\s.-]*/i,
    /^Custom[_\s.-]*/i,
  ];

  for (const baseName of baseNames) {
    if (baseName && !candidates.includes(baseName)) {
      candidates.push(baseName);
    }
    for (const prefix of prefixes) {
      const candidate = baseName?.replace(prefix, '');
      if (candidate && !candidates.includes(candidate)) {
        candidates.push(candidate);
      }
    }
  }
}

function resolveExpressionName(
  expressionManager: VrmExpressionManager,
  candidates: string[],
): string | null {
  const expressionNames = Object.keys(expressionManager.expressionMap);
  const exact = new Set(expressionNames);
  const byLower = new Map(expressionNames.map((name) => [name.toLowerCase(), name]));
  const byNormalized = new Map(
    expressionNames.map((name) => [normalizeExpressionKey(name), name] as const),
  );

  for (const candidate of candidates) {
    if (exact.has(candidate)) {
      return candidate;
    }

    const lowerMatch = byLower.get(candidate.toLowerCase());
    if (lowerMatch) {
      return lowerMatch;
    }

    const normalized = normalizeExpressionKey(candidate);
    const alias = expressionAliases[normalized];
    if (alias && exact.has(alias)) {
      return alias;
    }

    const normalizedMatch = byNormalized.get(alias ? normalizeExpressionKey(alias) : normalized);
    if (normalizedMatch) {
      return normalizedMatch;
    }
  }

  return null;
}

function resolveVRMBoneName(rigName: string): VRMHumanBoneName | null {
  return mixamoVRMRigMap[rigName] ?? genericVRMRigMap[normalizeRigName(rigName)] ?? null;
}

function parseTrackBinding(trackName: string) {
  try {
    return THREE.PropertyBinding.parseTrackName(trackName) as {
      nodeName?: string;
      objectName?: string;
      propertyName?: string;
      propertyIndex?: string;
    };
  } catch {
    const match =
      /^(?<nodeName>.+?)\.(?<propertyName>[^[.]+)(?:\[(?<propertyIndex>[^\]]+)])?$/.exec(trackName);
    return match?.groups ?? null;
  }
}

function getSourceMorphTargetName(
  sourceRoot: THREE.Object3D,
  nodeName: string | undefined,
  propertyIndex: string | undefined,
) {
  if (!propertyIndex || Number.isNaN(Number(propertyIndex))) {
    return propertyIndex;
  }

  const sourceNode = nodeName ? sourceRoot.getObjectByName(nodeName) : null;
  const morphTargetDictionary = (sourceNode as THREE.Mesh | null)?.morphTargetDictionary;
  if (!morphTargetDictionary) {
    return null;
  }

  const targetIndex = Number(propertyIndex);
  return (
    Object.entries(morphTargetDictionary).find(([, index]) => index === targetIndex)?.[0] ?? null
  );
}

function toNumberKeyframeValues(track: THREE.KeyframeTrack, componentIndex: number) {
  const stride = track.values.length / track.times.length;
  if (!Number.isInteger(stride) || stride <= componentIndex) {
    return null;
  }

  const values = new Float32Array(track.times.length);
  for (let index = 0; index < values.length; index += 1) {
    values[index] = THREE.MathUtils.clamp(track.values[index * stride + componentIndex] ?? 0, 0, 1);
  }
  return values;
}

function createExpressionTrack(
  track: THREE.KeyframeTrack,
  targetTrackName: string,
  componentIndex: number,
) {
  const values = toNumberKeyframeValues(track, componentIndex);
  if (!values) {
    return null;
  }

  return new THREE.NumberKeyframeTrack(
    targetTrackName,
    track.times,
    values,
    track.getInterpolation(),
  );
}

function isProceduralGazeTrackName(trackName: string) {
  const normalized = trackName.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return PROCEDURAL_GAZE_TRACK_MARKERS.some((marker) => normalized.includes(marker));
}

function stripProceduralGazeTracks(clip: THREE.AnimationClip) {
  const tracks = clip.tracks.filter((track) => !isProceduralGazeTrackName(track.name));
  return tracks.length === clip.tracks.length
    ? clip
    : new THREE.AnimationClip(clip.name || 'vrmAnimation', clip.duration, tracks);
}

function createGltfExpressionTracks(
  clip: THREE.AnimationClip,
  sourceRoot: THREE.Object3D,
  vrm: VRM,
) {
  const expressionManager = vrm.expressionManager;
  if (!expressionManager) {
    return [];
  }

  const expressionTracks: THREE.KeyframeTrack[] = [];
  for (const track of clip.tracks) {
    const binding = parseTrackBinding(track.name);
    const propertyName = binding?.propertyName;
    const candidates: string[] = [];
    let componentIndex = 0;

    if (propertyName === 'weight') {
      addExpressionNameCandidates(candidates, binding?.nodeName);
    } else if (propertyName === 'position') {
      addExpressionNameCandidates(candidates, binding?.nodeName);
      componentIndex = 0;
    } else if (propertyName === 'morphTargetInfluences') {
      addExpressionNameCandidates(candidates, binding?.propertyIndex);
      addExpressionNameCandidates(
        candidates,
        getSourceMorphTargetName(sourceRoot, binding?.nodeName, binding?.propertyIndex),
      );
    } else {
      continue;
    }

    const expressionName = resolveExpressionName(expressionManager, candidates);
    if (expressionName && isProceduralGazeTrackName(expressionName)) {
      continue;
    }

    const targetTrackName = expressionName
      ? expressionManager.getExpressionTrackName(expressionName)
      : null;
    if (!targetTrackName) {
      continue;
    }

    const expressionTrack = createExpressionTrack(track, targetTrackName, componentIndex);
    if (expressionTrack) {
      expressionTracks.push(expressionTrack);
    }
  }

  return expressionTracks;
}

function copyQuaternionTrackValues(track: THREE.QuaternionKeyframeTrack, vrm: VRM) {
  const value = new Float32Array(track.values.length);
  for (let i = 0; i < track.values.length; i += 4) {
    const x = track.values[i] ?? 0;
    const y = track.values[i + 1] ?? 0;
    const z = track.values[i + 2] ?? 0;
    const w = track.values[i + 3] ?? 1;
    value[i] = vrm.meta?.metaVersion === '0' ? -x : x;
    value[i + 1] = y;
    value[i + 2] = vrm.meta?.metaVersion === '0' ? -z : z;
    value[i + 3] = w;
  }
  return value;
}

function retargetHumanoidClipByBoneName(
  clip: THREE.AnimationClip,
  vrm: VRM,
  options: { includeHipsTranslation: boolean },
): THREE.AnimationClip | null {
  const tracks: THREE.KeyframeTrack[] = [];

  clip.tracks.forEach((track) => {
    const [rigName, propertyName] = track.name.split('.');
    if (!rigName || !propertyName) {
      return;
    }

    const vrmBoneName = resolveVRMBoneName(rigName);
    if (!vrmBoneName) {
      return;
    }

    const vrmNodeName = vrm.humanoid?.getNormalizedBoneNode(vrmBoneName)?.name;
    if (!vrmNodeName) {
      return;
    }

    if (track instanceof THREE.QuaternionKeyframeTrack) {
      tracks.push(
        new THREE.QuaternionKeyframeTrack(
          `${vrmNodeName}.${propertyName}`,
          track.times,
          copyQuaternionTrackValues(track, vrm),
        ),
      );
      return;
    }

    if (
      options.includeHipsTranslation &&
      vrmBoneName === 'hips' &&
      track instanceof THREE.VectorKeyframeTrack
    ) {
      tracks.push(
        new THREE.VectorKeyframeTrack(
          `${vrmNodeName}.${propertyName}`,
          track.times,
          new Float32Array(track.values),
        ),
      );
    }
  });

  return tracks.length > 0
    ? new THREE.AnimationClip(clip.name || 'vrmAnimation', clip.duration, tracks)
    : null;
}

function ensureLookAtQuaternionProxy(vrm: VRM) {
  if (!vrm.lookAt) {
    return;
  }

  const existing = vrm.scene.children.find((child) => child instanceof VRMLookAtQuaternionProxy);
  if (existing) {
    if (!existing.name) {
      existing.name = 'VRMLookAtQuaternionProxy';
    }
    return;
  }

  const proxy = new VRMLookAtQuaternionProxy(vrm.lookAt);
  proxy.name = 'VRMLookAtQuaternionProxy';
  vrm.scene.add(proxy);
}

function createVrmClip(vrmAnimation: VRMAnimation, vrm: VRM) {
  ensureLookAtQuaternionProxy(vrm);
  return stripProceduralGazeTracks(createVRMAnimationClip(vrmAnimation, vrm));
}

function animationLoadError(error: unknown, url: string, expected: string) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('Unsupported asset') || message.includes('glTF versions >=2.0')) {
    return new Error(
      `Animation "${url}" is not a valid ${expected} file. Expected VRMA/glTF 2.0, FBX, or BVH motion data.`,
    );
  }
  return error;
}

export async function loadMixamoAnimation(
  url: string,
  vrm: VRM,
): Promise<THREE.AnimationClip | null> {
  const asset = await loadFbxAsset(url);
  const clip = THREE.AnimationClip.findByName(asset.animations, 'mixamo.com');
  if (!clip) return null;

  const tracks: THREE.KeyframeTrack[] = [];
  const restRotationInverse = new THREE.Quaternion();
  const parentRestWorldRotation = new THREE.Quaternion();
  const quatA = new THREE.Quaternion();
  const vector = new THREE.Vector3();

  const motionHipsHeight = asset.getObjectByName('mixamorigHips')?.position.y ?? 1;
  const vrmHipsY = vrm.humanoid?.getNormalizedBoneNode('hips')?.getWorldPosition(vector).y ?? 0;
  const vrmRootY = vrm.scene.getWorldPosition(vector).y;
  const vrmHipsHeight = Math.abs(vrmHipsY - vrmRootY);
  const hipsPositionScale = vrmHipsHeight / motionHipsHeight;

  clip.tracks.forEach((track) => {
    const trackSplitted = track.name.split('.');
    const mixamoRigName = trackSplitted[0];
    if (!mixamoRigName) return;
    const vrmBoneName = mixamoVRMRigMap[mixamoRigName];
    if (!vrmBoneName) return;
    const vrmNodeName = vrm.humanoid?.getNormalizedBoneNode(vrmBoneName)?.name;
    const mixamoRigNode = asset.getObjectByName(mixamoRigName);

    if (vrmNodeName != null && mixamoRigNode) {
      const propertyName = trackSplitted[1];
      if (!propertyName) return;

      mixamoRigNode.getWorldQuaternion(restRotationInverse).invert();
      mixamoRigNode.parent!.getWorldQuaternion(parentRestWorldRotation);

      if (track instanceof THREE.QuaternionKeyframeTrack) {
        const value = new Float32Array(track.values.length);
        for (let i = 0; i < track.values.length; i += 4) {
          quatA.set(
            track.values[i] ?? 0,
            track.values[i + 1] ?? 0,
            track.values[i + 2] ?? 0,
            track.values[i + 3] ?? 1,
          );
          quatA.premultiply(parentRestWorldRotation).multiply(restRotationInverse);
          value[i] = vrm.meta?.metaVersion === '0' ? -quatA.x : quatA.x;
          value[i + 1] = quatA.y;
          value[i + 2] = vrm.meta?.metaVersion === '0' ? -quatA.z : quatA.z;
          value[i + 3] = quatA.w;
        }

        tracks.push(
          new THREE.QuaternionKeyframeTrack(`${vrmNodeName}.${propertyName}`, track.times, value),
        );
      } else if (track instanceof THREE.VectorKeyframeTrack) {
        // Only retarget hips translation; other positional tracks cause skeleton drift on many VRMs.
        if (vrmBoneName !== 'hips') return;

        // Compute position as delta from Mixamo rest pose, scaled, then offset to VRM rest
        // This prevents animations with different rest hips heights from pushing the VRM up
        const vrmNode = vrm.humanoid?.getNormalizedBoneNode(vrmBoneName);
        const vrmRestX = vrmNode ? vrmNode.position.x : 0;
        const vrmRestY = vrmNode ? vrmNode.position.y : 0;
        const vrmRestZ = vrmNode ? vrmNode.position.z : 0;
        const mixRestX = mixamoRigNode.position.x;
        const mixRestY = mixamoRigNode.position.y;
        const mixRestZ = mixamoRigNode.position.z;
        let baseDx = (track.values[0] ?? mixRestX) - mixRestX;
        let baseDy = (track.values[1] ?? mixRestY) - mixRestY;
        let baseDz = (track.values[2] ?? mixRestZ) - mixRestZ;
        if (vrm.meta?.metaVersion === '0') {
          baseDx = -baseDx;
          baseDz = -baseDz;
        }

        const value = new Float32Array(track.values.length);
        for (let i = 0; i < track.values.length; i += 3) {
          let dx = (track.values[i] ?? mixRestX) - mixRestX;
          let dy = (track.values[i + 1] ?? mixRestY) - mixRestY;
          let dz = (track.values[i + 2] ?? mixRestZ) - mixRestZ;
          if (vrm.meta?.metaVersion === '0') {
            dx = -dx;
            dz = -dz;
          }
          dx -= baseDx;
          dy -= baseDy;
          dz -= baseDz;
          // Lock horizontal root motion so looped clips stay centered in the scene.
          dx = 0;
          dz = 0;
          value[i] = vrmRestX + dx * hipsPositionScale;
          value[i + 1] = vrmRestY + dy * hipsPositionScale;
          value[i + 2] = vrmRestZ + dz * hipsPositionScale;
        }

        tracks.push(
          new THREE.VectorKeyframeTrack(`${vrmNodeName}.${propertyName}`, track.times, value),
        );
      }
    }
  });

  return tracks.length > 0 ? new THREE.AnimationClip('vrmAnimation', clip.duration, tracks) : null;
}

async function loadVrmaAnimation(url: string, vrm: VRM): Promise<THREE.AnimationClip | null> {
  const asset = await loadVrmaAsset(url).catch((error) => {
    throw animationLoadError(error, url, 'VRMA');
  });
  const animations = asset.userData['vrmAnimations'] as VRMAnimation[] | undefined;
  const vrmAnimation = animations?.[0];
  return vrmAnimation ? createVrmClip(vrmAnimation, vrm) : null;
}

async function loadBvhAnimation(url: string, vrm: VRM): Promise<THREE.AnimationClip | null> {
  const asset = await loadBvhAsset(url);
  return retargetHumanoidClipByBoneName(asset.clip, vrm, { includeHipsTranslation: false });
}

async function loadGltfAnimation(url: string, vrm: VRM): Promise<THREE.AnimationClip | null> {
  const asset = await loadVrmaAsset(url).catch((error) => {
    throw animationLoadError(error, url, 'glTF');
  });
  const vrmAnimation = (asset.userData['vrmAnimations'] as VRMAnimation[] | undefined)?.[0];
  if (vrmAnimation) {
    return createVrmClip(vrmAnimation, vrm);
  }

  const clip = asset.animations[0];
  if (!clip) {
    return null;
  }

  const humanoidClip = retargetHumanoidClipByBoneName(clip, vrm, {
    includeHipsTranslation: true,
  });
  const tracks = [
    ...(humanoidClip?.tracks ?? []),
    ...createGltfExpressionTracks(clip, asset.scene, vrm),
  ];

  return tracks.length > 0
    ? new THREE.AnimationClip(clip.name || 'vrmAnimation', clip.duration, tracks)
    : null;
}

export async function loadVrmAnimationClip(
  entry: Pick<AnimationEntry, 'url' | 'format'>,
  vrm: VRM,
): Promise<THREE.AnimationClip | null> {
  const normalizedUrl = normalizeAnimationUrl(entry.url);
  const cacheKey = `${entry.format ?? 'auto'}:${normalizedUrl}`;
  let clipsForVrm = retargetedClipCache.get(vrm);
  if (!clipsForVrm) {
    clipsForVrm = new Map();
    retargetedClipCache.set(vrm, clipsForVrm);
  }

  const cached = clipsForVrm.get(cacheKey);
  if (cached) {
    return cached;
  }

  const pending = loadVrmAnimationClipUncached(entry, vrm).catch((error) => {
    clipsForVrm?.delete(cacheKey);
    throw error;
  });
  clipsForVrm.set(cacheKey, pending);
  return pending;
}

async function loadVrmAnimationClipUncached(
  entry: Pick<AnimationEntry, 'url' | 'format'>,
  vrm: VRM,
): Promise<THREE.AnimationClip | null> {
  let clip: THREE.AnimationClip | null = null;
  switch (await resolveAnimationFormat(entry)) {
    case 'vrma':
      clip = await loadVrmaAnimation(entry.url, vrm);
      break;
    case 'bvh':
      clip = await loadBvhAnimation(entry.url, vrm);
      break;
    case 'glb':
    case 'gltf':
      clip = await loadGltfAnimation(entry.url, vrm);
      break;
    case 'fbx':
    default:
      clip = await loadMixamoAnimation(entry.url, vrm);
      break;
  }
  return clip ? stripProceduralGazeTracks(clip) : null;
}

export function retargetClip(clip: THREE.AnimationClip, vrm: VRM): THREE.AnimationClip | null {
  if (!clip || !vrm) return null;
  const have = new Set<string>();
  vrm.scene.traverse((object) => have.add(object.name));
  const out = clip.clone();
  out.tracks = out.tracks.filter((track) => {
    const [node, rest] = track.name.split('.');
    const mapped = simpleBoneMap[node ?? ''] ?? node;
    if (!mapped || !rest || !have.has(mapped)) return false;
    track.name = `${mapped}.${rest}`;
    return true;
  });
  return out.tracks.length ? out : null;
}

let currentAction: THREE.AnimationAction | null = null;
let previousAction: THREE.AnimationAction | null = null;
const fadeStopTimers = new Set<ReturnType<typeof setTimeout>>();

type CrossfadeOptions = {
  clampWhenFinished?: boolean;
  loop?: boolean;
};

function stopActionAfterFade(action: THREE.AnimationAction, duration: number) {
  const timeout = setTimeout(
    () => {
      fadeStopTimers.delete(timeout);
      if (action !== currentAction) {
        action.stop();
      }
      if (previousAction === action) {
        previousAction = null;
      }
    },
    Math.max(0, duration * 1000 + 120),
  );
  fadeStopTimers.add(timeout);
}

export function crossfadeToAction(
  newAction: THREE.AnimationAction,
  duration = 1.0,
  timeScale = 1.0,
  options: CrossfadeOptions = {},
) {
  const fadeDuration = Math.max(0, duration);
  const loop = options.loop ?? true;

  newAction.enabled = true;
  newAction.clampWhenFinished = options.clampWhenFinished ?? !loop;
  newAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
  newAction.setEffectiveTimeScale(Math.max(0.1, timeScale));
  newAction.setEffectiveWeight(1);

  if (currentAction === newAction) {
    newAction.reset().fadeIn(fadeDuration).play();
    return;
  }

  if (previousAction && previousAction !== currentAction) {
    previousAction.stop();
    previousAction = null;
  }

  if (currentAction) {
    currentAction.fadeOut(fadeDuration);
    stopActionAfterFade(currentAction, fadeDuration);
    previousAction = currentAction;
  }

  newAction.reset().fadeIn(fadeDuration).play();
  currentAction = newAction;
}

export function resetCrossfadeState() {
  for (const timeout of fadeStopTimers) {
    clearTimeout(timeout);
  }
  fadeStopTimers.clear();
  currentAction?.stop();
  previousAction?.stop();
  currentAction = null;
  previousAction = null;
}
