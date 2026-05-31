export type SettingsTabId =
  | 'account'
  | 'vrm'
  | 'background'
  | 'anim'
  | 'emotion-telemetry'
  | 'character'
  | 'ai'
  | 'twitch'
  | 'context'
  | 'voice-lab'
  | 'tts';

export type CameraViewMode = 'full-body' | 'half-body';

export type CameraRigMode = 'locked' | 'custom';

export type SceneBackgroundMode = 'persona' | 'custom' | 'chroma' | 'transparent';

export type BundledVrmOption = {
  id: string;
  label: string;
  assetPath: string;
};

export type SavedVrmModelSummary = {
  createdAt: number;
  id: string;
  name: string;
  originalFileName: string;
  size: number;
  type: string;
  updatedAt: number;
};

export type AnimationFormat = 'fbx' | 'glb' | 'gltf' | 'vrma' | 'bvh';

export type AnimationPurpose = 'ambient' | 'gesture' | 'emotion' | 'movement' | 'pose';

export type AnimationEntry = {
  id: string;
  name: string;
  url: string;
  format?: AnimationFormat;
  enabled: boolean;
  experimental: boolean;
  weight?: number;
  loopEligible?: boolean;
  purpose?: AnimationPurpose;
  tags?: string[];
};

export type VisualSettings = {
  sceneBackgroundMode: SceneBackgroundMode;
  sceneBackgroundImage: string;
  sceneBackgroundOverlay: string;
  sceneBackgroundFilter: string;
  sceneChromaColor: string;
  cameraViewMode: CameraViewMode;
  cameraRigMode: CameraRigMode;
  cameraVerticalOffset: number;
  cameraOffsetX: number;
  cameraOffsetY: number;
  cameraOffsetZ: number;
  cameraTargetOffsetX: number;
  cameraTargetOffsetY: number;
  cameraTargetOffsetZ: number;
  cameraFov: number;
  modelPositionX: number;
  modelPositionZ: number;
  modelRotationX: number;
  modelRotationY: number;
  modelRotationZ: number;
  modelVerticalOffset: number;
  modelScale: number;
  realisticMode: boolean;
  autoBlink: boolean;
  blinkInterval: number;
  blinkIntensity: number;
  autoGaze: boolean;
  gazeIntensity: number;
  gazeHeadFollow: number;
  gazeHeadDrift: number;
  gazeEyeMotion: number;
  gazePointerFollow: boolean;
  gazeAudienceYOffset: number;
  armClipGuard: boolean;
  armClipGuardStrength: number;
  armClipTorsoRadius: number;
  crossfadeDuration: number;
  outline: boolean;
  outlineAlpha: number;
  outlineColor: string;
  outlineThickness: number;
  colorCorr: boolean;
  sceneExposure: number;
  colorPowR: number;
  colorPowG: number;
  colorPowB: number;
  pbrClearcoat: number;
  pbrClearcoatRoughness: number;
  pbrEnvMapIntensity: number;
  pbrMetalness: number;
  pbrRoughness: number;
  pbrSpecularIntensity: number;
  mtoonTuning: boolean;
  mtoonGiEqualization: number;
  mtoonRimColor: string;
  mtoonRimFresnel: number;
  mtoonRimLift: number;
  mtoonRimLightingMix: number;
  mtoonShadeColor: string;
  mtoonShadeShift: number;
  mtoonToony: number;
  keyLight: number;
  fillLight: number;
  rimLight: number;
  hemiLight: number;
  ambientLight: number;
};

export type SequencerSettings = {
  playing: boolean;
  shuffle: boolean;
  loop: boolean;
  speed: number;
  duration: number;
  currentIndex: number;
  playlist: AnimationEntry[];
};

export type ManualPlayRequest = {
  index: number;
  kind?: 'base' | 'reaction';
  nonce: number;
  telemetryId?: string;
};

export type FacialExpressionRequest = {
  durationMs: number;
  expression: string;
  intensity: number;
  nonce: number;
  telemetryId?: string;
  vad?: {
    arousal: number;
    dominance: number;
    valence: number;
  };
};

export type EmotionTelemetryEvent = {
  affectArousal: number;
  affectDominance: number;
  affectLabel: string;
  affectValence: number;
  id: string;
  createdAt: number;
  emotion: string;
  metadataArousal: number;
  metadataDominance: number;
  metadataValence: number;
  requestedExpression: string;
  requestedIntensity: number;
  requestedDurationMs: number;
  resolvedExpressionNames: string[];
  appliedIntensity: number;
  expressionAccepted: boolean | null;
  expressionReason: string;
  animationIndex: number;
  animationId: string | null;
  animationName: string | null;
  animationAccepted: boolean | null;
  animationReason: string;
};

export type EmotionTelemetryPatch = {
  id: string;
  appliedIntensity?: number;
  animationAccepted?: boolean;
  animationReason?: string;
  expressionAccepted?: boolean;
  expressionReason?: string;
  resolvedExpressionNames?: string[];
};

export type VrmExpressionWeightSnapshot = {
  name: string;
  value: number;
};

export type VrmTelemetrySnapshot = {
  activeExpressionCount: number;
  activeMouthExpression: string | null;
  expressionWeights: VrmExpressionWeightSnapshot[];
  mouthWeights: Record<'aa' | 'ih' | 'ou' | 'ee' | 'oh', number>;
  updatedAt: number;
};
