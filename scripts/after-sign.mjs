import { repairDesktopPomlRuntime } from './desktop-poml-runtime.mjs';

export default async function afterSign(context) {
  await repairDesktopPomlRuntime(context.packager.projectDir, context.appOutDir);
}
