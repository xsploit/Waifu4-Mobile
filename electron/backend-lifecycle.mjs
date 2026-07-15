export async function stopOwnedBackendChild({
  child,
  requestShutdown,
  timeoutMs = 3000,
  platform = process.platform,
  onShutdownError = () => {},
}) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return { forced: false, graceful: true };
  }

  let resolveExit;
  const exited = new Promise((resolve) => {
    resolveExit = resolve;
  });
  const handleExit = () => resolveExit();
  child.once('exit', handleExit);

  let timeout;
  const timedOut = new Promise((resolve) => {
    timeout = setTimeout(() => resolve(true), timeoutMs);
  });

  void Promise.resolve()
    .then(requestShutdown)
    .catch((error) => {
      onShutdownError(error);
      if (platform !== 'win32' && child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
      }
    });

  const forced = await Promise.race([
    exited.then(() => false),
    timedOut,
  ]);
  clearTimeout(timeout);

  if (forced && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await Promise.race([
      exited,
      new Promise((resolve) => setTimeout(resolve, 250)),
    ]);
  }
  child.removeListener('exit', handleExit);
  return { forced, graceful: !forced };
}
