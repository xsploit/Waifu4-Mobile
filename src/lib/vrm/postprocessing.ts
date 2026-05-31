import * as THREE from 'three';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { ColorCorrectionShader } from 'three/examples/jsm/shaders/ColorCorrectionShader.js';

export interface PostProcessingRefs {
  colorCorrectionPass: ShaderPass;
  composer: EffectComposer;
  outlineEffect: OutlineEffect;
}

export function initPostProcessing(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
): PostProcessingRefs {
  const outlineEffect = new OutlineEffect(renderer, {
    defaultThickness: 0.003,
    defaultColor: [0, 0, 0],
    defaultAlpha: 0.8,
    defaultKeepAlive: true,
  });

  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  renderPass.clearAlpha = 0;
  composer.addPass(renderPass);

  const colorCorrectionPass = new ShaderPass(ColorCorrectionShader);
  const powRgbUniform = colorCorrectionPass.uniforms['powRGB'];
  if (powRgbUniform) {
    (powRgbUniform.value as THREE.Vector3).set(1.4, 1.45, 1.45);
  }
  const mulRgbUniform = colorCorrectionPass.uniforms['mulRGB'];
  if (mulRgbUniform) {
    (mulRgbUniform.value as THREE.Vector3).set(1.1, 1.1, 1.1);
  }
  colorCorrectionPass.enabled = false;
  composer.addPass(colorCorrectionPass);
  composer.addPass(new OutputPass());

  return {
    colorCorrectionPass,
    composer,
    outlineEffect,
  };
}

export function resizePostProcessing(refs: PostProcessingRefs) {
  refs.composer.setSize(window.innerWidth, window.innerHeight);
}
