import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const POML_FLATTEN_CHILDREN_DEP = 'react-keyed-flatten-children';

async function copyPomlNestedDependency(context, dependencyName) {
  const projectDir = context.packager.projectDir;
  const appNodeModules = path.join(
    context.appOutDir,
    'resources',
    'app.asar.unpacked',
    'node_modules',
  );
  const source = path.join(
    projectDir,
    'node_modules',
    'pomljs',
    'node_modules',
    dependencyName,
  );
  const target = path.join(appNodeModules, 'pomljs', 'node_modules', dependencyName);

  await mkdir(path.dirname(target), { recursive: true });
  await rm(target, { force: true, recursive: true });
  await cp(source, target, { force: true, recursive: true });
}

export default async function afterPack(context) {
  await copyPomlNestedDependency(context, POML_FLATTEN_CHILDREN_DEP);
}
