import { Html } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Dispatch,
  MouseEvent as ReactMouseEvent,
  SetStateAction,
  TouchEvent as ReactTouchEvent,
  WheelEvent as ReactWheelEvent,
} from 'react';
import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type {
  AnimationEntry,
  EmotionTelemetryPatch,
  FacialExpressionRequest,
  ManualPlayRequest,
  SequencerSettings,
  VrmTelemetrySnapshot,
  VisualSettings,
} from '../lib/menu/types';
import { crossfadeToAction, loadVrmAnimationClip, resetCrossfadeState } from '../lib/vrm/animation';
import { applyMaterialSettings, disposeVrm, loadVrm, setRealisticMode } from '../lib/vrm/loadVrm';
import { updateLipSync, resetLipSync } from '../lib/vrm/lipsync';
import { initPostProcessing, resizePostProcessing } from '../lib/vrm/postprocessing';
import type { PostProcessingRefs } from '../lib/vrm/postprocessing';
import { AnimationSequencer } from '../lib/vrm/sequencer';
import { getTtsManager, type TtsManager } from '../lib/tts/manager';

type VrmStageProps = {
  active: boolean;
  facialExpressionRequest: FacialExpressionRequest | null;
  manualPlayRequest: ManualPlayRequest | null;
  modelUrl: string | null;
  sequencerSettings: SequencerSettings;
  setSequencerSettings: Dispatch<SetStateAction<SequencerSettings>>;
  setVisualSettings: Dispatch<SetStateAction<VisualSettings>>;
  onAnimationTelemetry?: (patch: EmotionTelemetryPatch) => void;
  onFacialExpressionTelemetry?: (patch: EmotionTelemetryPatch) => void;
  onVrmTelemetry?: (snapshot: VrmTelemetrySnapshot | null) => void;
  visualSettings: VisualSettings;
};

type AvatarProps = {
  modelScale: number;
  modelPositionX: number;
  modelPositionZ: number;
  modelRotationX: number;
  modelRotationY: number;
  modelRotationZ: number;
  modelVerticalOffset: number;
  vrm: VRM | null;
};

type SceneRuntimeProps = {
  active: boolean;
  animationSpeed: number;
  mixer: THREE.AnimationMixer | null;
  onVrmTelemetry?: (snapshot: VrmTelemetrySnapshot | null) => void;
  ttsManager: TtsManager;
  visualSettings: VisualSettings;
  vrm: VRM | null;
};

type VrmExpressionManager = NonNullable<VRM['expressionManager']>;

type BlinkRuntimeState = {
  elapsed: number;
  nextAt: number;
  value: number;
};

type FacialExpressionRuntimeState = {
  animationFrame: number | null;
  names: string[];
  nonce: number | null;
};

type GazeOverlayPart = 'head' | 'neck' | 'leftEye' | 'rightEye';

type GazeRuntimeState = {
  elapsed: number;
  nextAt: number;
  target: THREE.Vector3;
  current: THREE.Vector3;
  noisyTarget: THREE.Vector3;
  targetObject: THREE.Object3D;
  headOverlay: THREE.Quaternion;
  headResult: THREE.Quaternion;
  headTargetOverlay: THREE.Quaternion;
  neckOverlay: THREE.Quaternion;
  neckResult: THREE.Quaternion;
  neckTargetOverlay: THREE.Quaternion;
  leftEyeOverlay: THREE.Quaternion;
  leftEyeResult: THREE.Quaternion;
  leftEyeTargetOverlay: THREE.Quaternion;
  rightEyeOverlay: THREE.Quaternion;
  rightEyeResult: THREE.Quaternion;
  rightEyeTargetOverlay: THREE.Quaternion;
  inverseOverlay: THREE.Quaternion;
  hasHeadOverlay: boolean;
  hasNeckOverlay: boolean;
  hasLeftEyeOverlay: boolean;
  hasRightEyeOverlay: boolean;
  euler: THREE.Euler;
};

type HumanoidBoneCache = {
  chest: THREE.Object3D | null;
  head: THREE.Object3D | null;
  hips: THREE.Object3D | null;
  leftEye: THREE.Object3D | null;
  leftHand: THREE.Object3D | null;
  leftLowerArm: THREE.Object3D | null;
  leftUpperArm: THREE.Object3D | null;
  neck: THREE.Object3D | null;
  rightEye: THREE.Object3D | null;
  rightHand: THREE.Object3D | null;
  rightLowerArm: THREE.Object3D | null;
  rightUpperArm: THREE.Object3D | null;
};

const SCALE_LIMITS = {
  min: 0.25,
  max: 4,
};

const CAMERA_VERTICAL_OFFSET_LIMITS = {
  min: -0.9,
  max: 0.9,
};

const MODEL_VERTICAL_OFFSET_LIMITS = {
  min: -2,
  max: 2,
};

const MODEL_HORIZONTAL_POSITION_LIMITS = {
  min: -3,
  max: 3,
};

const MODEL_DEPTH_POSITION_LIMITS = {
  min: -3,
  max: 3,
};

const MODEL_PITCH_ROLL_LIMITS = {
  min: -45,
  max: 45,
};

const MODEL_YAW_LIMITS = {
  min: -180,
  max: 180,
};

const CAMERA_OFFSET_LIMITS = {
  horizontal: { min: -3, max: 3 },
  vertical: { min: -1.5, max: 1.5 },
  depth: { min: -4, max: 4 },
  fov: { min: 18, max: 70 },
};

const VRM_BASE_VERTICAL_OFFSET = 0.5;

const CAMERA_PRESETS = {
  'full-body': {
    position: new THREE.Vector3(0, 1.45, 3.2),
    target: new THREE.Vector3(0, 1.4, 0),
  },
  'half-body': {
    position: new THREE.Vector3(0, 1.34, 1.45),
    target: new THREE.Vector3(0, 1.32, 0),
  },
} as const;

const ROUTELET_URL_PARAMS =
  typeof window === 'undefined'
    ? new URLSearchParams()
    : new URLSearchParams(window.location.search);
const ROUTELET_RENDER_MODE = ROUTELET_URL_PARAMS.get('routelet') === '1';
const ROUTELET_QUALITY_MODE =
  ROUTELET_RENDER_MODE && ROUTELET_URL_PARAMS.get('routeletQuality') === '1';
const ROUTELET_PIXEL_RATIO = ROUTELET_RENDER_MODE
  ? THREE.MathUtils.clamp(
      Number(ROUTELET_URL_PARAMS.get('routeletDpr') ?? (ROUTELET_QUALITY_MODE ? 1.25 : 1)) || 1,
      1,
      2,
    )
  : 1;
const BLINK_CLOSE_SECONDS = 0.045;
const BLINK_HOLD_SECONDS = 0.028;
const BLINK_OPEN_SECONDS = 0.105;
const BLINK_TOTAL_SECONDS = BLINK_CLOSE_SECONDS + BLINK_HOLD_SECONDS + BLINK_OPEN_SECONDS;
const BLINK_EXPRESSION_CACHE = new WeakMap<VrmExpressionManager, readonly string[]>();
const FACIAL_EXPRESSION_ATTACK_MS = 140;
const FACIAL_EXPRESSION_MIN_DURATION_MS = 500;
const FACIAL_EXPRESSION_MAX_DURATION_MS = 6000;
const FACIAL_EXPRESSION_CANDIDATES: Record<string, string[]> = {
  angry: ['angry', 'annoyed', 'anger'],
  caring: ['caring', 'kind', 'happy', 'relaxed'],
  confused: ['confused', 'doubt', 'surprised', 'relaxed'],
  embarrassed: ['embarrassed', 'shy', 'blush', 'happy', 'relaxed'],
  happy: ['happy', 'joy', 'fun', 'smile'],
  neutral: [],
  relaxed: ['relaxed', 'calm', 'soft'],
  sad: ['sad', 'sorrow', 'troubled'],
  surprised: ['surprised', 'surprise'],
  thinking: ['thinking', 'curious', 'relaxed'],
};
const RESERVED_EXPRESSION_KEYS = new Set([
  'aa',
  'blink',
  'blinkleft',
  'blinkright',
  'ee',
  'ih',
  'lookdown',
  'lookleft',
  'lookright',
  'lookup',
  'oh',
  'ou',
]);
const MOUTH_EXPRESSION_NAMES = ['aa', 'ih', 'ou', 'ee', 'oh'] as const;
const VRM_TELEMETRY_INTERVAL_MS = 250;
const GAZE_CENTER_Y = 1.42;
const GAZE_CENTER_Z = 2.2;
const GAZE_HEAD_MAX_HORIZONTAL = 0.24;
const GAZE_HEAD_MAX_VERTICAL = 0.1;
const GAZE_HEAD_LERP_RATE = 2.6;
const GAZE_HEAD_SWAY_HORIZONTAL = 0.16;
const GAZE_HEAD_SWAY_VERTICAL = 0.06;
const GAZE_HEAD_FOLLOW_FLOOR = 0.55;
const GAZE_EYE_MICRO_HORIZONTAL = 0.018;
const GAZE_EYE_MICRO_VERTICAL = 0.009;
const GAZE_OVERLAY_EPSILON = 0.002;
const ARM_GUARD_EPSILON = 0.0001;
const ARM_GUARD_MAX_UPPER_ANGLE = 0.42;
const ARM_GUARD_MAX_LOWER_ANGLE = 0.34;
const ARM_GUARD_MAX_HAND_ANGLE = 0.24;
const ARM_GUARD_LINE_PADDING = 0.05;

const armGuardHips = new THREE.Vector3();
const armGuardChest = new THREE.Vector3();
const armGuardTorsoPoint = new THREE.Vector3();
const armGuardPoint = new THREE.Vector3();
const armGuardTarget = new THREE.Vector3();
const armGuardAnchor = new THREE.Vector3();
const armGuardShoulder = new THREE.Vector3();
const armGuardPush = new THREE.Vector3();
const armGuardCurrentDirection = new THREE.Vector3();
const armGuardDesiredDirection = new THREE.Vector3();
const armGuardLine = new THREE.Vector3();
const armGuardPointDelta = new THREE.Vector3();
const armGuardWorldDelta = new THREE.Quaternion();
const armGuardLimitedDelta = new THREE.Quaternion();
const armGuardParentWorld = new THREE.Quaternion();
const armGuardParentInverse = new THREE.Quaternion();
const armGuardLocalDelta = new THREE.Quaternion();
const vrmBaseRotations = new WeakMap<THREE.Object3D, THREE.Quaternion>();
const humanoidBoneCaches = new WeakMap<VRM, HumanoidBoneCache>();

function getHumanoidBoneCache(vrm: VRM): HumanoidBoneCache {
  const cached = humanoidBoneCaches.get(vrm);
  if (cached) {
    return cached;
  }

  const humanoid = vrm.humanoid;
  const bones: HumanoidBoneCache = {
    chest:
      humanoid.getNormalizedBoneNode('upperChest') ??
      humanoid.getNormalizedBoneNode('chest') ??
      humanoid.getNormalizedBoneNode('spine'),
    head: humanoid.getNormalizedBoneNode('head'),
    hips: humanoid.getNormalizedBoneNode('hips'),
    leftEye: humanoid.getNormalizedBoneNode('leftEye'),
    leftHand: humanoid.getNormalizedBoneNode('leftHand'),
    leftLowerArm: humanoid.getNormalizedBoneNode('leftLowerArm'),
    leftUpperArm: humanoid.getNormalizedBoneNode('leftUpperArm'),
    neck: humanoid.getNormalizedBoneNode('neck'),
    rightEye: humanoid.getNormalizedBoneNode('rightEye'),
    rightHand: humanoid.getNormalizedBoneNode('rightHand'),
    rightLowerArm: humanoid.getNormalizedBoneNode('rightLowerArm'),
    rightUpperArm: humanoid.getNormalizedBoneNode('rightUpperArm'),
  };
  humanoidBoneCaches.set(vrm, bones);
  return bones;
}

function clampCameraVerticalOffset(value: number) {
  return THREE.MathUtils.clamp(
    value,
    CAMERA_VERTICAL_OFFSET_LIMITS.min,
    CAMERA_VERTICAL_OFFSET_LIMITS.max,
  );
}

function clampModelVerticalOffset(value: number) {
  return THREE.MathUtils.clamp(
    value,
    MODEL_VERTICAL_OFFSET_LIMITS.min,
    MODEL_VERTICAL_OFFSET_LIMITS.max,
  );
}

function getCameraRigVectors(visualSettings: VisualSettings) {
  const preset = CAMERA_PRESETS[visualSettings.cameraViewMode];
  const cameraPosition = preset.position
    .clone()
    .add(new THREE.Vector3(0, visualSettings.cameraVerticalOffset, 0));
  const cameraTarget = preset.target
    .clone()
    .add(new THREE.Vector3(0, visualSettings.cameraVerticalOffset, 0));

  if (visualSettings.cameraRigMode === 'custom') {
    cameraPosition.add(
      new THREE.Vector3(
        visualSettings.cameraOffsetX,
        visualSettings.cameraOffsetY,
        visualSettings.cameraOffsetZ,
      ),
    );
    cameraTarget.add(
      new THREE.Vector3(
        visualSettings.cameraTargetOffsetX,
        visualSettings.cameraTargetOffsetY,
        visualSettings.cameraTargetOffsetZ,
      ),
    );
  }

  return {
    position: cameraPosition,
    target: cameraTarget,
    fov:
      visualSettings.cameraRigMode === 'custom'
        ? THREE.MathUtils.clamp(
            visualSettings.cameraFov,
            CAMERA_OFFSET_LIMITS.fov.min,
            CAMERA_OFFSET_LIMITS.fov.max,
          )
        : 35,
  };
}

function getBaseVrmRotation(scene: THREE.Object3D) {
  let baseRotation = vrmBaseRotations.get(scene);
  if (!baseRotation) {
    baseRotation = scene.quaternion.clone();
    vrmBaseRotations.set(scene, baseRotation);
  }
  return baseRotation;
}

function hasActivePass(refs: PostProcessingRefs | null) {
  return Boolean(refs?.colorCorrectionPass.enabled);
}

function applyPostProcessingSettings(refs: PostProcessingRefs, visualSettings: VisualSettings) {
  refs.colorCorrectionPass.enabled = visualSettings.colorCorr;
  const powRgbUniform = refs.colorCorrectionPass.uniforms['powRGB'];
  if (powRgbUniform) {
    (powRgbUniform.value as THREE.Vector3).set(
      visualSettings.colorPowR,
      visualSettings.colorPowG,
      visualSettings.colorPowB,
    );
  }
}

function easeBlink(value: number) {
  return 0.5 - Math.cos(Math.PI * THREE.MathUtils.clamp(value, 0, 1)) * 0.5;
}

function getNextBlinkDelay(interval: number) {
  const safeInterval = THREE.MathUtils.clamp(interval, 1.5, 10);
  return THREE.MathUtils.clamp(safeInterval * (0.7 + Math.random() * 0.7), 1, 12);
}

function createBlinkRuntimeState(): BlinkRuntimeState {
  return {
    elapsed: 0,
    nextAt: getNextBlinkDelay(4.2),
    value: 0,
  };
}

function resetBlinkRuntimeState(state: BlinkRuntimeState, vrm: VRM | null, interval: number) {
  state.elapsed = 0;
  state.nextAt = getNextBlinkDelay(interval);
  state.value = 0;
  setBlinkExpression(vrm, 0);
}

function getNextGazeDelay() {
  return 2.4 + Math.random() * 3.4;
}

function createGazeRuntimeState(): GazeRuntimeState {
  const targetObject = new THREE.Object3D();
  targetObject.name = 'YourWifeyProceduralGazeTarget';
  targetObject.position.set(0, GAZE_CENTER_Y, GAZE_CENTER_Z);

  return {
    elapsed: 0,
    nextAt: 0.2,
    target: new THREE.Vector3(0, GAZE_CENTER_Y, GAZE_CENTER_Z),
    current: new THREE.Vector3(0, GAZE_CENTER_Y, GAZE_CENTER_Z),
    noisyTarget: new THREE.Vector3(0, GAZE_CENTER_Y, GAZE_CENTER_Z),
    targetObject,
    headOverlay: new THREE.Quaternion(),
    headResult: new THREE.Quaternion(),
    headTargetOverlay: new THREE.Quaternion(),
    neckOverlay: new THREE.Quaternion(),
    neckResult: new THREE.Quaternion(),
    neckTargetOverlay: new THREE.Quaternion(),
    leftEyeOverlay: new THREE.Quaternion(),
    leftEyeResult: new THREE.Quaternion(),
    leftEyeTargetOverlay: new THREE.Quaternion(),
    rightEyeOverlay: new THREE.Quaternion(),
    rightEyeResult: new THREE.Quaternion(),
    rightEyeTargetOverlay: new THREE.Quaternion(),
    inverseOverlay: new THREE.Quaternion(),
    hasHeadOverlay: false,
    hasNeckOverlay: false,
    hasLeftEyeOverlay: false,
    hasRightEyeOverlay: false,
    euler: new THREE.Euler(0, 0, 0, 'YXZ'),
  };
}

function removeProceduralOverlay(
  bone: THREE.Object3D | null | undefined,
  state: GazeRuntimeState,
  part: GazeOverlayPart,
) {
  let hasOverlay = state.hasHeadOverlay;
  let overlay = state.headOverlay;
  let result = state.headResult;
  if (part === 'neck') {
    hasOverlay = state.hasNeckOverlay;
    overlay = state.neckOverlay;
    result = state.neckResult;
  } else if (part === 'leftEye') {
    hasOverlay = state.hasLeftEyeOverlay;
    overlay = state.leftEyeOverlay;
    result = state.leftEyeResult;
  } else if (part === 'rightEye') {
    hasOverlay = state.hasRightEyeOverlay;
    overlay = state.rightEyeOverlay;
    result = state.rightEyeResult;
  }

  if (!hasOverlay) {
    return;
  }

  if (bone && bone.quaternion.angleTo(result) < GAZE_OVERLAY_EPSILON) {
    state.inverseOverlay.copy(overlay).invert();
    bone.quaternion.multiply(state.inverseOverlay);
  }

  if (part === 'head') {
    state.hasHeadOverlay = false;
  } else if (part === 'neck') {
    state.hasNeckOverlay = false;
  } else if (part === 'leftEye') {
    state.hasLeftEyeOverlay = false;
  } else {
    state.hasRightEyeOverlay = false;
  }
}

function applyProceduralOverlay(
  bone: THREE.Object3D | null | undefined,
  state: GazeRuntimeState,
  part: GazeOverlayPart,
  overlay: THREE.Quaternion,
) {
  removeProceduralOverlay(bone, state, part);
  if (!bone) {
    return;
  }

  bone.quaternion.multiply(overlay);
  if (part === 'head') {
    state.headOverlay.copy(overlay);
    state.headResult.copy(bone.quaternion);
    state.hasHeadOverlay = true;
  } else if (part === 'neck') {
    state.neckOverlay.copy(overlay);
    state.neckResult.copy(bone.quaternion);
    state.hasNeckOverlay = true;
  } else if (part === 'leftEye') {
    state.leftEyeOverlay.copy(overlay);
    state.leftEyeResult.copy(bone.quaternion);
    state.hasLeftEyeOverlay = true;
  } else {
    state.rightEyeOverlay.copy(overlay);
    state.rightEyeResult.copy(bone.quaternion);
    state.hasRightEyeOverlay = true;
  }
}

function clearProceduralGaze(vrm: VRM | null, state: GazeRuntimeState) {
  const bones = vrm ? getHumanoidBoneCache(vrm) : null;
  const head = bones?.head;
  const neck = bones?.neck;
  const leftEye = bones?.leftEye;
  const rightEye = bones?.rightEye;
  removeProceduralOverlay(head, state, 'head');
  removeProceduralOverlay(neck, state, 'neck');
  removeProceduralOverlay(leftEye, state, 'leftEye');
  removeProceduralOverlay(rightEye, state, 'rightEye');

  if (vrm?.lookAt?.target === state.targetObject) {
    vrm.lookAt.target = null;
  }
  if (vrm?.lookAt) {
    vrm.lookAt.autoUpdate = true;
  }
}

function resetGazeRuntimeState(state: GazeRuntimeState, vrm: VRM | null, settings: VisualSettings) {
  clearProceduralGaze(vrm, state);
  const baseY = GAZE_CENTER_Y + settings.cameraVerticalOffset;
  state.elapsed = 0;
  state.nextAt = 0.2;
  state.target.set(0, baseY, GAZE_CENTER_Z);
  state.current.copy(state.target);
  state.noisyTarget.copy(state.target);
  state.targetObject.position.copy(state.current);
  state.targetObject.updateMatrixWorld(true);
}

function getBlinkExpressionNames(manager: VrmExpressionManager) {
  const cached = BLINK_EXPRESSION_CACHE.get(manager);
  if (cached) {
    return cached;
  }

  let names: readonly string[] = ['blink'];
  if (!manager.getExpression('blink')) {
    const fallbackNames = ['blinkLeft', 'blinkRight'].filter((name) =>
      Boolean(manager.getExpression(name)),
    );
    names = fallbackNames.length > 0 ? fallbackNames : names;
  }

  BLINK_EXPRESSION_CACHE.set(manager, names);
  return names;
}

function setBlinkExpression(vrm: VRM | null, value: number) {
  const manager = vrm?.expressionManager;
  if (!manager) {
    return;
  }

  const nextValue = THREE.MathUtils.clamp(value, 0, 1);
  const expressionNames = getBlinkExpressionNames(manager);
  for (const expressionName of expressionNames) {
    manager.setValue(expressionName, nextValue);
  }
}

function createFacialExpressionRuntimeState(): FacialExpressionRuntimeState {
  return {
    animationFrame: null,
    names: [],
    nonce: null,
  };
}

function normalizeFacialExpressionKey(value: string) {
  return value
    .toLowerCase()
    .replace(/^vrmexpression/i, '')
    .replace(/[^a-z0-9]+/g, '');
}

function getExpressionNames(manager: VrmExpressionManager) {
  return Object.keys(manager.expressionMap).filter(
    (name) => !RESERVED_EXPRESSION_KEYS.has(normalizeFacialExpressionKey(name)),
  );
}

function getVrmExpressionValue(manager: VrmExpressionManager, name: string) {
  const value = (manager as VrmExpressionManager & { getValue?: (expressionName: string) => number })
    .getValue?.(name);
  return typeof value === 'number' && Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : 0;
}

function createVrmTelemetrySnapshot(vrm: VRM): VrmTelemetrySnapshot | null {
  const manager = vrm.expressionManager;
  if (!manager) {
    return null;
  }

  const mouthWeights = Object.fromEntries(
    MOUTH_EXPRESSION_NAMES.map((name) => [name, getVrmExpressionValue(manager, name)]),
  ) as VrmTelemetrySnapshot['mouthWeights'];
  const activeMouthExpression =
    MOUTH_EXPRESSION_NAMES.map((name) => ({ name, value: mouthWeights[name] }))
      .filter((entry) => entry.value > 0.001)
      .sort((a, b) => b.value - a.value)[0]?.name ?? null;
  const expressionWeights = getExpressionNames(manager)
    .map((name) => ({ name, value: getVrmExpressionValue(manager, name) }))
    .filter((entry) => entry.value > 0.001)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .slice(0, 8);

  return {
    activeExpressionCount: expressionWeights.length,
    activeMouthExpression,
    expressionWeights,
    mouthWeights,
    updatedAt: Date.now(),
  };
}

function resolveFacialExpressionNames(manager: VrmExpressionManager, expression: string) {
  const normalizedExpression = normalizeFacialExpressionKey(expression);
  const candidates = [
    ...(FACIAL_EXPRESSION_CANDIDATES[normalizedExpression] ?? []),
    expression,
  ].map(normalizeFacialExpressionKey);
  const available = getExpressionNames(manager);
  const byNormalizedName = new Map(
    available.map((name) => [normalizeFacialExpressionKey(name), name] as const),
  );

  for (const candidate of candidates) {
    const exact = byNormalizedName.get(candidate);
    if (exact) {
      return [exact];
    }
  }

  for (const candidate of candidates) {
    const fuzzy = available.find((name) => normalizeFacialExpressionKey(name).includes(candidate));
    if (fuzzy) {
      return [fuzzy];
    }
  }

  return [];
}

function setFacialExpressionValues(
  manager: VrmExpressionManager,
  names: readonly string[],
  value: number,
) {
  const nextValue = THREE.MathUtils.clamp(value, 0, 1);
  for (const name of names) {
    manager.setValue(name, nextValue);
  }
}

function clearFacialExpressionRuntime(vrm: VRM | null, state: FacialExpressionRuntimeState) {
  if (state.animationFrame !== null) {
    window.cancelAnimationFrame(state.animationFrame);
    state.animationFrame = null;
  }
  const manager = vrm?.expressionManager;
  if (manager && state.names.length > 0) {
    setFacialExpressionValues(manager, state.names, 0);
  }
  state.names = [];
}

function playFacialExpressionRequest(
  vrm: VRM,
  request: FacialExpressionRequest,
  state: FacialExpressionRuntimeState,
) {
  const manager = vrm.expressionManager;
  if (!manager || state.nonce === request.nonce) {
    return;
  }

  clearFacialExpressionRuntime(vrm, state);
  state.nonce = request.nonce;

  const names = resolveFacialExpressionNames(manager, request.expression);
  const peak = THREE.MathUtils.clamp(request.intensity, 0, 1);
  if (names.length === 0 || peak <= 0) {
    return;
  }

  state.names = names;
  const durationMs = THREE.MathUtils.clamp(
    request.durationMs,
    FACIAL_EXPRESSION_MIN_DURATION_MS,
    FACIAL_EXPRESSION_MAX_DURATION_MS,
  );
  const releaseMs = Math.min(900, Math.max(180, durationMs * 0.34));
  const holdEndMs = Math.max(FACIAL_EXPRESSION_ATTACK_MS, durationMs - releaseMs);
  const startedAt = performance.now();

  const tick = (now: number) => {
    const elapsed = now - startedAt;
    let value = peak;
    if (elapsed < FACIAL_EXPRESSION_ATTACK_MS) {
      value = peak * (elapsed / FACIAL_EXPRESSION_ATTACK_MS);
    } else if (elapsed > holdEndMs) {
      value = peak * Math.max(0, 1 - (elapsed - holdEndMs) / releaseMs);
    }

    setFacialExpressionValues(manager, names, value);
    if (elapsed < durationMs) {
      state.animationFrame = window.requestAnimationFrame(tick);
      return;
    }

    setFacialExpressionValues(manager, names, 0);
    state.animationFrame = null;
    state.names = [];
  };

  state.animationFrame = window.requestAnimationFrame(tick);
}

function updateAutoBlink(
  vrm: VRM,
  state: BlinkRuntimeState,
  delta: number,
  settings: VisualSettings,
) {
  if (!settings.autoBlink || settings.blinkIntensity <= 0) {
    if (state.value !== 0) {
      state.value = 0;
      setBlinkExpression(vrm, 0);
    }
    return;
  }

  state.elapsed += Math.min(delta, 0.1);
  let nextValue = 0;

  if (state.elapsed >= state.nextAt) {
    const blinkTime = state.elapsed - state.nextAt;
    if (blinkTime <= BLINK_CLOSE_SECONDS) {
      nextValue = easeBlink(blinkTime / BLINK_CLOSE_SECONDS);
    } else if (blinkTime <= BLINK_CLOSE_SECONDS + BLINK_HOLD_SECONDS) {
      nextValue = 1;
    } else if (blinkTime <= BLINK_TOTAL_SECONDS) {
      nextValue =
        1 - easeBlink((blinkTime - BLINK_CLOSE_SECONDS - BLINK_HOLD_SECONDS) / BLINK_OPEN_SECONDS);
    } else {
      state.elapsed = 0;
      state.nextAt = getNextBlinkDelay(settings.blinkInterval);
    }
  }

  const weightedValue = nextValue * settings.blinkIntensity;
  if (Math.abs(weightedValue - state.value) > 0.001) {
    state.value = weightedValue;
    setBlinkExpression(vrm, weightedValue);
  }
}

function updateAutoGaze(
  vrm: VRM,
  state: GazeRuntimeState,
  delta: number,
  settings: VisualSettings,
  pointer?: THREE.Vector2,
) {
  const intensity = THREE.MathUtils.clamp(settings.gazeIntensity, 0, 1);
  const headFollow = THREE.MathUtils.clamp(settings.gazeHeadFollow, 0, 1);
  const headDrift = intensity * THREE.MathUtils.clamp(settings.gazeHeadDrift, 0, 1);
  const eyeMotion = intensity * THREE.MathUtils.clamp(settings.gazeEyeMotion, 0, 1);
  const audienceYOffset = THREE.MathUtils.clamp(settings.gazeAudienceYOffset, -0.25, 0.15);
  const pointerFollow = settings.gazePointerFollow && Boolean(pointer);
  const pointerX = pointerFollow ? THREE.MathUtils.clamp(pointer?.x ?? 0, -1, 1) : 0;
  const pointerY = pointerFollow ? THREE.MathUtils.clamp(pointer?.y ?? 0, -1, 1) : 0;
  if (!settings.autoGaze || intensity <= 0) {
    clearProceduralGaze(vrm, state);
    return;
  }

  const safeDelta = Math.min(delta, 0.1);
  const baseY = GAZE_CENTER_Y + settings.cameraVerticalOffset;
  const audienceY = baseY + audienceYOffset;
  state.elapsed += safeDelta;

  if (pointerFollow) {
    state.target.set(
      pointerX * GAZE_HEAD_MAX_HORIZONTAL * headDrift,
      baseY + pointerY * GAZE_HEAD_MAX_VERTICAL * headDrift,
      GAZE_CENTER_Z,
    );
  } else if (state.elapsed >= state.nextAt) {
    state.elapsed = 0;
    state.nextAt = getNextGazeDelay();
    state.target.set(
      (Math.random() * 2 - 1) * GAZE_HEAD_MAX_HORIZONTAL * headDrift,
      baseY + (Math.random() * 2 - 1) * GAZE_HEAD_MAX_VERTICAL * headDrift,
      GAZE_CENTER_Z,
    );
  }

  const time = performance.now() * 0.001;
  state.current.lerp(state.target, 1 - Math.exp(-safeDelta * GAZE_HEAD_LERP_RATE));
  const headX =
    state.current.x +
    (Math.sin(time * 0.42) + Math.sin(time * 0.17 + 1.4) * 0.45) *
      GAZE_HEAD_SWAY_HORIZONTAL *
      headDrift;
  const headY =
    state.current.y +
    (Math.sin(time * 0.31 + 0.9) + Math.sin(time * 0.13 + 2.1) * 0.35) *
      GAZE_HEAD_SWAY_VERTICAL *
      headDrift;
  state.noisyTarget.set(
    pointerFollow
      ? pointerX * GAZE_HEAD_MAX_HORIZONTAL * 0.9 * eyeMotion
      : (Math.sin(time * 0.93) + Math.sin(time * 2.17 + 1.7) * 0.35) *
          GAZE_EYE_MICRO_HORIZONTAL *
          eyeMotion,
    pointerFollow
      ? audienceY + pointerY * GAZE_HEAD_MAX_VERTICAL * 1.1 * eyeMotion
      : audienceY + Math.sin(time * 1.21 + 0.8) * GAZE_EYE_MICRO_VERTICAL * eyeMotion,
    GAZE_CENTER_Z,
  );
  state.targetObject.position.copy(state.noisyTarget);
  state.targetObject.updateMatrixWorld(true);

  const bones = getHumanoidBoneCache(vrm);
  const leftEye = bones.leftEye;
  const rightEye = bones.rightEye;
  const hasEyeBones = Boolean(leftEye || rightEye);
  if (vrm.lookAt) {
    if (hasEyeBones) {
      vrm.lookAt.autoUpdate = false;
      if (vrm.lookAt.target === state.targetObject) {
        vrm.lookAt.target = null;
      }
    } else {
      vrm.lookAt.autoUpdate = true;
      vrm.lookAt.target = state.targetObject;
    }
  }

  const follow = headDrift * THREE.MathUtils.lerp(GAZE_HEAD_FOLLOW_FLOOR, 1, headFollow);
  const head = bones.head;
  const neck = bones.neck;
  const xAmount = THREE.MathUtils.clamp(headX / GAZE_HEAD_MAX_HORIZONTAL, -1, 1);
  const yAmount = THREE.MathUtils.clamp((headY - baseY) / GAZE_HEAD_MAX_VERTICAL, -1, 1);
  const yaw = xAmount * 0.28 * follow;
  const pitch = (0.035 - yAmount * 0.08) * follow;

  state.euler.set(pitch, yaw, -yaw * 0.1, 'YXZ');
  state.headTargetOverlay.setFromEuler(state.euler);
  applyProceduralOverlay(head, state, 'head', state.headTargetOverlay);

  state.euler.set(pitch * 0.3, yaw * 0.35, 0, 'YXZ');
  state.neckTargetOverlay.setFromEuler(state.euler);
  applyProceduralOverlay(neck, state, 'neck', state.neckTargetOverlay);

  if (hasEyeBones && eyeMotion > 0) {
    const eyeYaw =
      THREE.MathUtils.clamp(state.noisyTarget.x * 4.8 - yaw * 0.8, -0.22, 0.22) * eyeMotion;
    const eyePitch =
      THREE.MathUtils.clamp((state.noisyTarget.y - audienceY) * 3.2 - pitch * 0.55, -0.15, 0.15) *
      eyeMotion;

    state.euler.set(eyePitch, eyeYaw, 0, 'YXZ');
    state.leftEyeTargetOverlay.setFromEuler(state.euler);
    applyProceduralOverlay(leftEye, state, 'leftEye', state.leftEyeTargetOverlay);

    state.euler.set(eyePitch, eyeYaw, 0, 'YXZ');
    state.rightEyeTargetOverlay.setFromEuler(state.euler);
    applyProceduralOverlay(rightEye, state, 'rightEye', state.rightEyeTargetOverlay);
  } else {
    removeProceduralOverlay(leftEye, state, 'leftEye');
    removeProceduralOverlay(rightEye, state, 'rightEye');
  }

  if (!hasEyeBones) {
    vrm.lookAt?.update(safeDelta);
  }
  vrm.humanoid.update();
}

function getBoneWorldPosition(bone: THREE.Object3D | null | undefined, target: THREE.Vector3) {
  return bone ? bone.getWorldPosition(target) : null;
}

function getNearestTorsoPoint(
  point: THREE.Vector3,
  hips: THREE.Vector3,
  chest: THREE.Vector3,
  target: THREE.Vector3,
) {
  armGuardLine.subVectors(chest, hips);
  const lineLengthSq = armGuardLine.lengthSq();
  if (lineLengthSq <= ARM_GUARD_EPSILON) {
    return target.copy(chest);
  }

  const t = THREE.MathUtils.clamp(
    armGuardPointDelta.subVectors(point, hips).dot(armGuardLine) / lineLengthSq,
    ARM_GUARD_LINE_PADDING,
    1 + ARM_GUARD_LINE_PADDING,
  );
  return target.copy(hips).addScaledVector(armGuardLine, t);
}

function getGuardedArmPoint(
  point: THREE.Vector3,
  torsoPoint: THREE.Vector3,
  shoulder: THREE.Vector3,
  radius: number,
  strength: number,
  target: THREE.Vector3,
) {
  armGuardPush.subVectors(point, torsoPoint);
  armGuardPush.y = 0;
  let distance = armGuardPush.length();

  if (distance >= radius) {
    return false;
  }

  if (distance <= ARM_GUARD_EPSILON) {
    armGuardPush.set(shoulder.x < torsoPoint.x ? -1 : 1, 0, 0);
    distance = 0;
  } else {
    armGuardPush.multiplyScalar(1 / distance);
  }

  target.copy(point).addScaledVector(armGuardPush, (radius - distance) * strength);
  return true;
}

function applyArmGuardCorrection(
  bone: THREE.Object3D | null | undefined,
  anchor: THREE.Vector3,
  point: THREE.Vector3,
  target: THREE.Vector3,
  maxAngle: number,
) {
  if (!bone || !bone.parent) {
    return false;
  }

  armGuardCurrentDirection.subVectors(point, anchor);
  armGuardDesiredDirection.subVectors(target, anchor);
  if (
    armGuardCurrentDirection.lengthSq() <= ARM_GUARD_EPSILON ||
    armGuardDesiredDirection.lengthSq() <= ARM_GUARD_EPSILON
  ) {
    return false;
  }

  armGuardCurrentDirection.normalize();
  armGuardDesiredDirection.normalize();
  armGuardWorldDelta.setFromUnitVectors(armGuardCurrentDirection, armGuardDesiredDirection);
  const angle = 2 * Math.acos(THREE.MathUtils.clamp(armGuardWorldDelta.w, -1, 1));
  if (angle <= ARM_GUARD_EPSILON) {
    return false;
  }

  if (angle > maxAngle) {
    armGuardLimitedDelta.identity().slerp(armGuardWorldDelta, maxAngle / angle);
  } else {
    armGuardLimitedDelta.copy(armGuardWorldDelta);
  }

  bone.parent.getWorldQuaternion(armGuardParentWorld);
  armGuardParentInverse.copy(armGuardParentWorld).invert();
  armGuardLocalDelta
    .copy(armGuardParentInverse)
    .multiply(armGuardLimitedDelta)
    .multiply(armGuardParentWorld);
  bone.quaternion.premultiply(armGuardLocalDelta);
  return true;
}

function guardArmSide(
  vrm: VRM,
  upperArm: THREE.Object3D | null | undefined,
  lowerArm: THREE.Object3D | null | undefined,
  hand: THREE.Object3D | null | undefined,
  torsoRadius: number,
  strength: number,
) {
  if (!upperArm) {
    return false;
  }

  const shoulder = getBoneWorldPosition(upperArm, armGuardShoulder);
  if (!shoulder) {
    return false;
  }

  let changed = false;
  const elbow = getBoneWorldPosition(lowerArm, armGuardPoint);
  if (elbow) {
    const torsoPoint = getNearestTorsoPoint(elbow, armGuardHips, armGuardChest, armGuardTorsoPoint);
    if (getGuardedArmPoint(elbow, torsoPoint, shoulder, torsoRadius, strength, armGuardTarget)) {
      changed = applyArmGuardCorrection(
        upperArm,
        shoulder,
        elbow,
        armGuardTarget,
        ARM_GUARD_MAX_UPPER_ANGLE * strength,
      );
      if (changed) {
        vrm.scene.updateMatrixWorld(true);
      }
    }
  }

  const wrist = getBoneWorldPosition(hand, armGuardPoint);
  if (wrist) {
    const refreshedShoulder = getBoneWorldPosition(upperArm, armGuardShoulder) ?? shoulder;
    const torsoPoint = getNearestTorsoPoint(wrist, armGuardHips, armGuardChest, armGuardTorsoPoint);
    if (
      getGuardedArmPoint(
        wrist,
        torsoPoint,
        refreshedShoulder,
        torsoRadius,
        strength,
        armGuardTarget,
      )
    ) {
      const elbowAnchor = getBoneWorldPosition(lowerArm, armGuardAnchor);
      const lowerChanged = elbowAnchor
        ? applyArmGuardCorrection(
            lowerArm,
            elbowAnchor,
            wrist,
            armGuardTarget,
            ARM_GUARD_MAX_LOWER_ANGLE * strength,
          )
        : false;
      const upperChanged = applyArmGuardCorrection(
        upperArm,
        refreshedShoulder,
        wrist,
        armGuardTarget,
        ARM_GUARD_MAX_HAND_ANGLE * strength,
      );
      changed = lowerChanged || upperChanged || changed;
      if (lowerChanged || upperChanged) {
        vrm.scene.updateMatrixWorld(true);
      }
    }
  }

  return changed;
}

function updateArmClipGuard(vrm: VRM, settings: VisualSettings) {
  const strength = THREE.MathUtils.clamp(settings.armClipGuardStrength, 0, 1);
  if (!settings.armClipGuard || strength <= 0) {
    return;
  }

  const bones = getHumanoidBoneCache(vrm);
  const hips = bones.hips;
  const chest = bones.chest;
  if (!getBoneWorldPosition(hips, armGuardHips) || !getBoneWorldPosition(chest, armGuardChest)) {
    return;
  }

  const sceneScale = Math.max(Math.abs(vrm.scene.scale.x), Math.abs(vrm.scene.scale.y), 1);
  const torsoRadius = THREE.MathUtils.clamp(settings.armClipTorsoRadius, 0.08, 0.55) * sceneScale;
  const changedLeft = guardArmSide(
    vrm,
    bones.leftUpperArm,
    bones.leftLowerArm,
    bones.leftHand,
    torsoRadius,
    strength,
  );
  const changedRight = guardArmSide(
    vrm,
    bones.rightUpperArm,
    bones.rightLowerArm,
    bones.rightHand,
    torsoRadius,
    strength,
  );

  if (changedLeft || changedRight) {
    vrm.humanoid.update();
  }
}

function isTtsPlaybackActive(ttsManager: TtsManager) {
  return ttsManager.isPlaybackActive();
}

function updateVrmFrame(
  vrm: VRM,
  ttsManager: TtsManager,
  delta: number,
  updateMouthFromTts: boolean,
) {
  if (updateMouthFromTts) {
    updateLipSync(vrm, ttsManager);
  }

  if (!ROUTELET_RENDER_MODE) {
    vrm.update(delta);
    return;
  }

  vrm.humanoid.update();
  if (vrm.lookAt?.autoUpdate !== false) {
    vrm.lookAt?.update(delta);
  }
  vrm.expressionManager?.update();
  vrm.nodeConstraintManager?.update();
  vrm.springBoneManager?.update(delta);
  vrm.materials?.forEach((material) => {
    const updatableMaterial = material as THREE.Material & { update?: (delta: number) => void };
    updatableMaterial.update?.(delta);
  });
}

function SceneRuntime({
  active,
  animationSpeed,
  mixer,
  onVrmTelemetry,
  ttsManager,
  visualSettings,
  vrm,
}: SceneRuntimeProps) {
  const { camera, gl } = useThree();
  const scene = useThree((state) => state.scene);
  const size = useThree((state) => state.size);
  const postProcessingRef = useRef<PostProcessingRefs | null>(null);
  const initialCameraRig = getCameraRigVectors(visualSettings);
  const cameraTargetPositionRef = useRef(initialCameraRig.position.clone());
  const cameraLookAtRef = useRef(initialCameraRig.target.clone());
  const cameraLookAtTargetRef = useRef(initialCameraRig.target.clone());
  const blinkRuntimeRef = useRef(createBlinkRuntimeState());
  const gazeRuntimeRef = useRef(createGazeRuntimeState());
  const lastTelemetryAtRef = useRef(0);

  useEffect(() => {
    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    const cameraRig = getCameraRigVectors(visualSettings);

    gl.setPixelRatio(
      ROUTELET_RENDER_MODE ? ROUTELET_PIXEL_RATIO : Math.min(window.devicePixelRatio, 2),
    );
    gl.setClearColor(0x02040a, 0);
    gl.autoClear = true;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = visualSettings.sceneExposure;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.shadowMap.enabled = false;

    perspectiveCamera.fov = cameraRig.fov;
    perspectiveCamera.near = 0.1;
    perspectiveCamera.far = 100;
    perspectiveCamera.position.copy(cameraRig.position);
    perspectiveCamera.lookAt(cameraRig.target);
    perspectiveCamera.updateProjectionMatrix();
    cameraTargetPositionRef.current.copy(cameraRig.position);
    cameraLookAtRef.current.copy(cameraRig.target);
    cameraLookAtTargetRef.current.copy(cameraRig.target);

    if (!ROUTELET_RENDER_MODE) {
      const postProcessing = initPostProcessing(gl, scene, perspectiveCamera);
      postProcessingRef.current = postProcessing;
      applyPostProcessingSettings(postProcessing, visualSettings);
    }

    return () => {
      postProcessingRef.current?.composer.dispose();
      postProcessingRef.current = null;
    };
  }, [camera, gl, scene]);

  useEffect(() => {
    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    const cameraRig = getCameraRigVectors(visualSettings);
    cameraTargetPositionRef.current.copy(cameraRig.position);
    cameraLookAtTargetRef.current.copy(cameraRig.target);
    if (Math.abs(perspectiveCamera.fov - cameraRig.fov) > 0.001) {
      perspectiveCamera.fov = cameraRig.fov;
      perspectiveCamera.updateProjectionMatrix();
    }
  }, [
    camera,
    visualSettings.cameraFov,
    visualSettings.cameraOffsetX,
    visualSettings.cameraOffsetY,
    visualSettings.cameraOffsetZ,
    visualSettings.cameraRigMode,
    visualSettings.cameraTargetOffsetX,
    visualSettings.cameraTargetOffsetY,
    visualSettings.cameraTargetOffsetZ,
    visualSettings.cameraVerticalOffset,
    visualSettings.cameraViewMode,
  ]);

  useEffect(() => {
    if (!postProcessingRef.current) {
      return;
    }

    resizePostProcessing(postProcessingRef.current, size.width, size.height);
  }, [gl, size.height, size.width]);

  useEffect(() => {
    gl.toneMappingExposure = visualSettings.sceneExposure;
  }, [gl, visualSettings.sceneExposure]);

  useEffect(() => {
    if (!postProcessingRef.current) {
      return;
    }

    applyPostProcessingSettings(postProcessingRef.current, visualSettings);
  }, [visualSettings]);

  useEffect(() => {
    resetBlinkRuntimeState(blinkRuntimeRef.current, vrm, visualSettings.blinkInterval);
  }, [visualSettings.autoBlink, visualSettings.blinkInterval, vrm]);

  useEffect(() => {
    resetGazeRuntimeState(gazeRuntimeRef.current, vrm, visualSettings);
    return () => clearProceduralGaze(vrm, gazeRuntimeRef.current);
  }, [visualSettings.autoGaze, vrm]);

  useEffect(() => {
    if (!vrm) {
      onVrmTelemetry?.(null);
      lastTelemetryAtRef.current = 0;
    }
  }, [onVrmTelemetry, vrm]);

  useFrame((frameState, delta) => {
    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    const ttsPlaybackActive = isTtsPlaybackActive(ttsManager);
    const cameraLerp = 1 - Math.exp(-delta * 9);
    perspectiveCamera.position.lerp(cameraTargetPositionRef.current, cameraLerp);
    cameraLookAtRef.current.lerp(cameraLookAtTargetRef.current, cameraLerp);
    perspectiveCamera.lookAt(cameraLookAtRef.current);

    if (vrm && active) {
      if (!ttsPlaybackActive) {
        updateLipSync(vrm, ttsManager);
      }
      updateAutoBlink(vrm, blinkRuntimeRef.current, delta, visualSettings);
    }

    if (mixer && active) {
      if (mixer.timeScale !== animationSpeed) {
        mixer.timeScale = animationSpeed;
      }
      mixer.update(delta);
    }

    if (vrm && active) {
      updateVrmFrame(vrm, ttsManager, delta, ttsPlaybackActive);
      updateArmClipGuard(vrm, visualSettings);
      updateAutoGaze(vrm, gazeRuntimeRef.current, delta, visualSettings, frameState.pointer);
      const now = performance.now();
      if (onVrmTelemetry && now - lastTelemetryAtRef.current >= VRM_TELEMETRY_INTERVAL_MS) {
        lastTelemetryAtRef.current = now;
        onVrmTelemetry(createVrmTelemetrySnapshot(vrm));
      }
    } else if (vrm) {
      clearProceduralGaze(vrm, gazeRuntimeRef.current);
    }

    const postProcessing = postProcessingRef.current;
    if (!postProcessing) {
      gl.render(scene, camera);
      return;
    }

    if (visualSettings.outline && postProcessing.outlineEffect) {
      postProcessing.outlineEffect.render(scene, camera);
    } else if (hasActivePass(postProcessing)) {
      postProcessing.composer.render();
    } else {
      gl.render(scene, camera);
    }
  }, 1);

  return null;
}

function Avatar({
  modelPositionX,
  modelPositionZ,
  modelRotationX,
  modelRotationY,
  modelRotationZ,
  modelScale,
  modelVerticalOffset,
  vrm,
}: AvatarProps) {
  const placementRotationRef = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));
  const placementQuaternionRef = useRef(new THREE.Quaternion());

  useEffect(() => {
    if (!vrm) {
      return;
    }

    vrm.scene.scale.set(modelScale, modelScale, 1);
    vrm.scene.position.set(
      THREE.MathUtils.clamp(
        modelPositionX,
        MODEL_HORIZONTAL_POSITION_LIMITS.min,
        MODEL_HORIZONTAL_POSITION_LIMITS.max,
      ),
      VRM_BASE_VERTICAL_OFFSET + modelVerticalOffset,
      THREE.MathUtils.clamp(
        modelPositionZ,
        MODEL_DEPTH_POSITION_LIMITS.min,
        MODEL_DEPTH_POSITION_LIMITS.max,
      ),
    );
    const placementRotation = placementRotationRef.current.set(
      THREE.MathUtils.degToRad(
        THREE.MathUtils.clamp(
          modelRotationX,
          MODEL_PITCH_ROLL_LIMITS.min,
          MODEL_PITCH_ROLL_LIMITS.max,
        ),
      ),
      THREE.MathUtils.degToRad(
        THREE.MathUtils.clamp(modelRotationY, MODEL_YAW_LIMITS.min, MODEL_YAW_LIMITS.max),
      ),
      THREE.MathUtils.degToRad(
        THREE.MathUtils.clamp(
          modelRotationZ,
          MODEL_PITCH_ROLL_LIMITS.min,
          MODEL_PITCH_ROLL_LIMITS.max,
        ),
      ),
    );
    vrm.scene.quaternion
      .copy(getBaseVrmRotation(vrm.scene))
      .multiply(placementQuaternionRef.current.setFromEuler(placementRotation));
  }, [
    modelPositionX,
    modelPositionZ,
    modelRotationX,
    modelRotationY,
    modelRotationZ,
    modelScale,
    modelVerticalOffset,
    vrm,
  ]);

  if (!vrm) {
    return null;
  }

  return <primitive object={vrm.scene} />;
}

export function VrmStage({
  active,
  facialExpressionRequest,
  manualPlayRequest,
  modelUrl,
  onAnimationTelemetry,
  onFacialExpressionTelemetry,
  onVrmTelemetry,
  sequencerSettings,
  setSequencerSettings,
  setVisualSettings,
  visualSettings,
}: VrmStageProps) {
  const ttsManager = useMemo(() => getTtsManager(), []);
  const clampScale = (value: number) =>
    THREE.MathUtils.clamp(value, SCALE_LIMITS.min, SCALE_LIMITS.max);
  const [vrm, setVrm] = useState<VRM | null>(null);
  const [mixer, setMixer] = useState<THREE.AnimationMixer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modelScale, setModelScale] = useState(() => clampScale(visualSettings.modelScale));
  const modelScaleTargetRef = useRef(clampScale(visualSettings.modelScale));
  const scaleAnimationFrameRef = useRef<number | null>(null);
  const pinchDistanceRef = useRef(0);
  const cameraDragRef = useRef<{
    startClientY: number;
    startOffset: number;
  } | null>(null);
  const modelDragRef = useRef<{
    startClientY: number;
    startOffset: number;
  } | null>(null);
  const animationRequestRef = useRef(0);
  const lastManualPlayNonceRef = useRef<number | null>(null);
  const sequencerRef = useRef<AnimationSequencer | null>(null);
  const autoStartTimerRef = useRef<number | null>(null);
  const vrmRef = useRef<VRM | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const facialExpressionRuntimeRef = useRef(createFacialExpressionRuntimeState());

  const keyLightRef = useRef<THREE.DirectionalLight | null>(null);
  const fillLightRef = useRef<THREE.DirectionalLight | null>(null);
  const rimLightRef = useRef<THREE.DirectionalLight | null>(null);
  const hemiLightRef = useRef<THREE.HemisphereLight | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);

  const materialVisualSettings = useMemo(
    () => visualSettings,
    [
      visualSettings.mtoonGiEqualization,
      visualSettings.mtoonRimColor,
      visualSettings.mtoonRimFresnel,
      visualSettings.mtoonRimLift,
      visualSettings.mtoonRimLightingMix,
      visualSettings.mtoonShadeColor,
      visualSettings.mtoonShadeShift,
      visualSettings.mtoonToony,
      visualSettings.mtoonTuning,
      visualSettings.outline,
      visualSettings.outlineAlpha,
      visualSettings.outlineColor,
      visualSettings.outlineThickness,
      visualSettings.pbrClearcoat,
      visualSettings.pbrClearcoatRoughness,
      visualSettings.pbrEnvMapIntensity,
      visualSettings.pbrMetalness,
      visualSettings.pbrRoughness,
      visualSettings.pbrSpecularIntensity,
      visualSettings.realisticMode,
    ],
  );

  const cancelScaleAnimation = useCallback(() => {
    if (scaleAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(scaleAnimationFrameRef.current);
      scaleAnimationFrameRef.current = null;
    }
  }, []);

  const scheduleScaleAnimation = useCallback(() => {
    if (scaleAnimationFrameRef.current !== null) {
      return;
    }

    const tick = () => {
      scaleAnimationFrameRef.current = null;
      setModelScale((current) => {
        const target = modelScaleTargetRef.current;
        const next = THREE.MathUtils.lerp(current, target, 0.24);
        if (Math.abs(target - next) <= 0.0015) {
          return target;
        }

        scaleAnimationFrameRef.current = window.requestAnimationFrame(tick);
        return next;
      });
    };

    scaleAnimationFrameRef.current = window.requestAnimationFrame(tick);
  }, []);

  useEffect(() => () => cancelScaleAnimation(), [cancelScaleAnimation]);

  useEffect(() => {
    const nextScale = clampScale(visualSettings.modelScale);
    modelScaleTargetRef.current = nextScale;
    if (Math.abs(nextScale - modelScale) <= 0.0015) {
      setModelScale(nextScale);
      return;
    }
    scheduleScaleAnimation();
  }, [modelScale, scheduleScaleAnimation, visualSettings.modelScale]);

  useEffect(() => {
    vrmRef.current = vrm;
  }, [vrm]);

  useEffect(() => {
    mixerRef.current = mixer;
  }, [mixer]);

  const playAnimation = useCallback(
    (entry: AnimationEntry, index: number) => {
      const currentVrm = vrmRef.current;
      if (!currentVrm) {
        return;
      }

      const requestId = animationRequestRef.current + 1;
      animationRequestRef.current = requestId;

      void loadVrmAnimationClip(entry, currentVrm)
        .then((clip) => {
          const latestVrm = vrmRef.current;
          if (
            !clip ||
            animationRequestRef.current !== requestId ||
            !latestVrm ||
            latestVrm !== currentVrm
          ) {
            return;
          }

          let nextMixer = mixerRef.current;
          if (!nextMixer) {
            nextMixer = new THREE.AnimationMixer(latestVrm.scene);
            mixerRef.current = nextMixer;
            setMixer(nextMixer);
          }

          setSequencerSettings((current) =>
            current.currentIndex === index
              ? current
              : {
                  ...current,
                  currentIndex: index,
                },
          );
          crossfadeToAction(
            nextMixer.clipAction(clip),
            visualSettings.crossfadeDuration,
            sequencerSettings.speed,
            {
              clampWhenFinished: entry.loopEligible === false,
              loop: entry.loopEligible !== false,
            },
          );
        })
        .catch((nextError) => {
          console.error('[VrmStage] Failed to load animation:', nextError);
        });
    },
    [sequencerSettings.speed, setSequencerSettings, visualSettings.crossfadeDuration],
  );

  useEffect(() => {
    let disposed = false;
    let loadedVrm: VRM | null = null;

    setError(null);
    cancelScaleAnimation();
    modelScaleTargetRef.current = clampScale(visualSettings.modelScale);
    setModelScale(clampScale(visualSettings.modelScale));
    vrmRef.current = null;
    mixerRef.current = null;
    setVrm(null);
    setMixer(null);
    if (autoStartTimerRef.current !== null) {
      window.clearTimeout(autoStartTimerRef.current);
      autoStartTimerRef.current = null;
    }
    setSequencerSettings((current) =>
      current.currentIndex === -1
        ? current
        : {
            ...current,
            currentIndex: -1,
          },
    );

    if (!modelUrl) {
      return () => {
        disposed = true;
      };
    }

    loadVrm(modelUrl)
      .then((nextVrm) => {
        if (disposed) {
          disposeVrm(nextVrm);
          return;
        }

        loadedVrm = nextVrm;
        vrmBaseRotations.set(nextVrm.scene, nextVrm.scene.quaternion.clone());
        vrmRef.current = nextVrm;
        mixerRef.current = null;
        setVrm(nextVrm);
        setMixer(null);

        autoStartTimerRef.current = window.setTimeout(() => {
          if (disposed || loadedVrm !== nextVrm) {
            return;
          }

          setSequencerSettings((current) => {
            const hasEnabledEntries = current.playlist.some((entry) => entry.enabled);
            if (!hasEnabledEntries) {
              return current;
            }

            return {
              ...current,
              playing: true,
            };
          });
        }, 500);
      })
      .catch((nextError: unknown) => {
        if (disposed) {
          return;
        }

        const message =
          nextError instanceof Error ? nextError.message : 'The VRM model failed to load.';
        setError(message);
      });

    return () => {
      disposed = true;
      animationRequestRef.current += 1;
      lastManualPlayNonceRef.current = null;
      if (autoStartTimerRef.current !== null) {
        window.clearTimeout(autoStartTimerRef.current);
        autoStartTimerRef.current = null;
      }
      sequencerRef.current?.stop(false);
      sequencerRef.current = null;
      resetCrossfadeState();
      const currentMixer = mixerRef.current;
      if (currentMixer) {
        currentMixer.stopAllAction();
      }
      if (loadedVrm && currentMixer) {
        currentMixer.uncacheRoot(loadedVrm.scene);
      }
      mixerRef.current = null;
      vrmRef.current = null;

      if (loadedVrm) {
        clearFacialExpressionRuntime(loadedVrm, facialExpressionRuntimeRef.current);
        resetLipSync(loadedVrm);
        disposeVrm(loadedVrm);
      }
    };
    // modelScale is intentionally omitted: a scale change (e.g. scroll-wheel zoom)
    // must NOT retrigger a full VRM teardown/reload (that caused the model to vanish
    // briefly and re-download on every notch). The scale-animation effect and the
    // Avatar scale application keep modelScale in sync after load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelScaleAnimation, modelUrl, setSequencerSettings]);

  useEffect(() => {
    if (!vrm) {
      return;
    }

    setRealisticMode(vrm.scene, null, materialVisualSettings.realisticMode, materialVisualSettings);
    applyMaterialSettings(vrm.scene, materialVisualSettings);
  }, [materialVisualSettings, vrm]);

  useEffect(() => {
    if (keyLightRef.current) {
      keyLightRef.current.intensity = visualSettings.keyLight;
    }
    if (fillLightRef.current) {
      fillLightRef.current.intensity = visualSettings.fillLight;
    }
    if (rimLightRef.current) {
      rimLightRef.current.intensity = visualSettings.rimLight;
    }
    if (hemiLightRef.current) {
      hemiLightRef.current.intensity = visualSettings.hemiLight;
    }
    if (ambientLightRef.current) {
      ambientLightRef.current.intensity = visualSettings.ambientLight;
    }
  }, [
    visualSettings.ambientLight,
    visualSettings.fillLight,
    visualSettings.hemiLight,
    visualSettings.keyLight,
    visualSettings.rimLight,
  ]);

  useEffect(() => {
    if (!manualPlayRequest) {
      return;
    }
    if (!vrm) {
      if (manualPlayRequest.telemetryId) {
        onAnimationTelemetry?.({
          id: manualPlayRequest.telemetryId,
          animationAccepted: false,
          animationReason: 'no VRM loaded',
        });
      }
      return;
    }

    if (lastManualPlayNonceRef.current === manualPlayRequest.nonce) {
      if (manualPlayRequest.telemetryId) {
        onAnimationTelemetry?.({
          id: manualPlayRequest.telemetryId,
          animationAccepted: false,
          animationReason: 'duplicate nonce',
        });
      }
      return;
    }

    const entry = sequencerSettings.playlist[manualPlayRequest.index];
    if (!entry) {
      if (manualPlayRequest.telemetryId) {
        onAnimationTelemetry?.({
          id: manualPlayRequest.telemetryId,
          animationAccepted: false,
          animationReason: 'missing animation entry',
        });
      }
      return;
    }

    lastManualPlayNonceRef.current = manualPlayRequest.nonce;
    if (manualPlayRequest.telemetryId) {
      onAnimationTelemetry?.({
        id: manualPlayRequest.telemetryId,
        animationAccepted: true,
        animationReason: 'requested',
      });
    }
    playAnimation(entry, manualPlayRequest.index);
  }, [manualPlayRequest, onAnimationTelemetry, playAnimation, sequencerSettings.playlist, vrm]);

  useEffect(() => {
    if (!facialExpressionRequest) {
      return;
    }
    if (!vrm) {
      if (facialExpressionRequest.telemetryId) {
        onFacialExpressionTelemetry?.({
          id: facialExpressionRequest.telemetryId,
          appliedIntensity: 0,
          expressionAccepted: false,
          expressionReason: 'no VRM loaded',
          resolvedExpressionNames: [],
        });
      }
      return;
    }
    if (facialExpressionRuntimeRef.current.nonce === facialExpressionRequest.nonce) {
      if (facialExpressionRequest.telemetryId) {
        onFacialExpressionTelemetry?.({
          id: facialExpressionRequest.telemetryId,
          appliedIntensity: 0,
          expressionAccepted: false,
          expressionReason: 'duplicate nonce',
          resolvedExpressionNames: facialExpressionRuntimeRef.current.names,
        });
      }
      return;
    }

    const manager = vrm.expressionManager;
    const names = manager
      ? resolveFacialExpressionNames(manager, facialExpressionRequest.expression)
      : [];
    const peak = THREE.MathUtils.clamp(facialExpressionRequest.intensity, 0, 1);
    playFacialExpressionRequest(vrm, facialExpressionRequest, facialExpressionRuntimeRef.current);
    if (facialExpressionRequest.telemetryId) {
      onFacialExpressionTelemetry?.({
        id: facialExpressionRequest.telemetryId,
        appliedIntensity: peak,
        expressionAccepted: Boolean(manager && names.length > 0 && peak > 0),
        expressionReason:
          !manager
            ? 'missing expression manager'
            : names.length === 0
              ? 'no matching VRM expression'
              : peak <= 0
                ? 'zero intensity'
                : 'applied',
        resolvedExpressionNames: names,
      });
    }
  }, [facialExpressionRequest, onFacialExpressionTelemetry, vrm]);

  useEffect(() => {
    if (!vrm) {
      return;
    }

    if (!sequencerRef.current) {
      sequencerRef.current = new AnimationSequencer();
    }

    const sequencer = sequencerRef.current;
    const enabledEntries = sequencerSettings.playlist.filter((entry) => entry.enabled);
    if (enabledEntries.length === 0) {
      sequencer.stop(false);
      setSequencerSettings((current) =>
        current.playing || current.currentIndex !== -1
          ? {
              ...current,
              playing: false,
              currentIndex: -1,
            }
          : current,
      );
      return;
    }

    sequencer.onAdvance = (entry, index) => {
      playAnimation(entry, index);
    };
    sequencer.onStop = () => {
      setSequencerSettings((current) => ({
        ...current,
        playing: false,
        currentIndex: -1,
      }));
    };

    if (!sequencerSettings.playing) {
      sequencer.stop(false);
      setSequencerSettings((current) =>
        current.currentIndex === -1
          ? current
          : {
              ...current,
              currentIndex: -1,
            },
      );
      return;
    }

    sequencer.start(sequencerSettings.playlist, {
      shuffle: sequencerSettings.shuffle,
      loop: sequencerSettings.loop,
      duration: sequencerSettings.duration,
    });

    return () => {
      sequencer.stop(false);
    };
  }, [
    playAnimation,
    sequencerSettings.duration,
    sequencerSettings.loop,
    sequencerSettings.playing,
    sequencerSettings.playlist,
    sequencerSettings.shuffle,
    setSequencerSettings,
    vrm,
  ]);

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (event.cancelable) {
      event.preventDefault();
    }
    const nextScale = clampScale(modelScaleTargetRef.current * Math.exp(-event.deltaY * 0.00065));
    modelScaleTargetRef.current = nextScale;
    setVisualSettings((current) =>
      current.modelScale === nextScale
        ? current
        : {
            ...current,
            modelScale: nextScale,
          },
    );
  };

  const handleTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2) {
      return;
    }

    const firstTouch = event.touches.item(0);
    const secondTouch = event.touches.item(1);
    if (!firstTouch || !secondTouch) {
      return;
    }

    const dx = firstTouch.clientX - secondTouch.clientX;
    const dy = firstTouch.clientY - secondTouch.clientY;
    pinchDistanceRef.current = Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2 || pinchDistanceRef.current <= 0) {
      return;
    }

    event.preventDefault();

    const firstTouch = event.touches.item(0);
    const secondTouch = event.touches.item(1);
    if (!firstTouch || !secondTouch) {
      return;
    }

    const dx = firstTouch.clientX - secondTouch.clientX;
    const dy = firstTouch.clientY - secondTouch.clientY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const factor = distance / pinchDistanceRef.current;

    const nextScale = clampScale(modelScaleTargetRef.current * factor);
    modelScaleTargetRef.current = nextScale;
    setVisualSettings((current) =>
      current.modelScale === nextScale
        ? current
        : {
            ...current,
            modelScale: nextScale,
          },
    );
    pinchDistanceRef.current = distance;
  };

  const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button === 0 && event.altKey) {
      event.preventDefault();
      modelDragRef.current = {
        startClientY: event.clientY,
        startOffset: visualSettings.modelVerticalOffset,
      };
      return;
    }

    if (event.button !== 0 || !event.ctrlKey) {
      return;
    }

    event.preventDefault();
    cameraDragRef.current = {
      startClientY: event.clientY,
      startOffset: visualSettings.cameraVerticalOffset,
    };
  };

  const handleMouseMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (modelDragRef.current) {
      event.preventDefault();
      const deltaY = event.clientY - modelDragRef.current.startClientY;
      const nextOffset = clampModelVerticalOffset(
        modelDragRef.current.startOffset - deltaY * 0.0035,
      );
      setVisualSettings((current) =>
        current.modelVerticalOffset === nextOffset
          ? current
          : {
              ...current,
              modelVerticalOffset: nextOffset,
            },
      );
      return;
    }

    if (!cameraDragRef.current) {
      return;
    }

    event.preventDefault();
    const deltaY = event.clientY - cameraDragRef.current.startClientY;
    const nextOffset = clampCameraVerticalOffset(
      cameraDragRef.current.startOffset + deltaY * 0.0035,
    );
    setVisualSettings((current) =>
      current.cameraVerticalOffset === nextOffset
        ? current
        : {
            ...current,
            cameraVerticalOffset: nextOffset,
          },
    );
  };

  const handleMouseUp = () => {
    cameraDragRef.current = null;
    modelDragRef.current = null;
  };

  return (
    <div
      className="stage-root"
      onMouseDown={handleMouseDown}
      onMouseLeave={handleMouseUp}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onTouchEnd={() => {
        pinchDistanceRef.current = 0;
      }}
      onTouchMove={handleTouchMove}
      onTouchStart={handleTouchStart}
      onWheel={handleWheel}
    >
      <Canvas
        dpr={ROUTELET_RENDER_MODE ? ROUTELET_PIXEL_RATIO : [1, 2]}
        gl={{
          alpha: true,
          antialias: !ROUTELET_RENDER_MODE || ROUTELET_QUALITY_MODE,
          powerPreference: 'high-performance',
          precision: ROUTELET_RENDER_MODE && !ROUTELET_QUALITY_MODE ? 'mediump' : 'highp',
          stencil: false,
        }}
      >
        <SceneRuntime
          active={active}
          animationSpeed={sequencerSettings.speed}
          mixer={mixer}
          onVrmTelemetry={onVrmTelemetry}
          ttsManager={ttsManager}
          visualSettings={visualSettings}
          vrm={vrm}
        />

        <ambientLight ref={ambientLightRef} intensity={visualSettings.ambientLight} />
        <hemisphereLight
          args={['#dfe8ff', '#1c1f26', visualSettings.hemiLight]}
          ref={hemiLightRef}
        />
        <directionalLight
          color="#ffffff"
          intensity={visualSettings.keyLight}
          position={[1.5, 2.2, 1.2]}
          ref={keyLightRef}
        />
        <directionalLight
          color="#bad1ff"
          intensity={visualSettings.fillLight}
          position={[-1.4, 1.5, -1]}
          ref={fillLightRef}
        />
        <directionalLight
          color="#8fbaff"
          intensity={visualSettings.rimLight}
          position={[-1.2, 2, -2]}
          ref={rimLightRef}
        />

        <Avatar
          modelPositionX={visualSettings.modelPositionX}
          modelPositionZ={visualSettings.modelPositionZ}
          modelRotationX={visualSettings.modelRotationX}
          modelRotationY={visualSettings.modelRotationY}
          modelRotationZ={visualSettings.modelRotationZ}
          modelScale={modelScale}
          modelVerticalOffset={visualSettings.modelVerticalOffset}
          vrm={vrm}
        />

        {error ? (
          <Html center>
            <div className="stage-badge stage-badge-error">{error}</div>
          </Html>
        ) : null}

        {!vrm && !error ? (
          <Html center>
            <div className="stage-badge">Loading VRM...</div>
          </Html>
        ) : null}
      </Canvas>
    </div>
  );
}
