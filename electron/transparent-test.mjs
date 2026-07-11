import { app, BrowserWindow, ipcMain } from 'electron';

const transparentSoftware =
  process.argv.includes('--transparent-software') ||
  process.env.ELECTRON_TRANSPARENT_SOFTWARE === 'true';
const bareStart =
  process.argv.includes('--bare') || process.env.ELECTRON_TRANSPARENT_TEST_BARE === 'true';

if (transparentSoftware) {
  app.disableHardwareAcceleration();
}

app.commandLine.appendSwitch('high-dpi-support', '1');

let testWindow = null;

function createWindow() {
  testWindow = new BrowserWindow({
    width: 960,
    height: 640,
    title: 'WebWaifu 4 Transparency Test',
    backgroundColor: '#00000000',
    backgroundMaterial: 'none',
    frame: false,
    hasShadow: false,
    resizable: false,
    transparent: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: new URL('./transparent-test-preload.mjs', import.meta.url).pathname,
    },
  });

  testWindow.setBackgroundColor('#00000000');
  testWindow.once('ready-to-show', () => testWindow?.show());
  testWindow.on('closed', () => {
    testWindow = null;
  });

  void testWindow.loadURL(buildTestPageUrl());
}

function buildTestPageUrl() {
  return `data:text/html;charset=utf-8,${encodeURIComponent(buildTestPage())}`;
}

function buildTestPage() {
  return String.raw`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>WebWaifu 4 Transparency Test</title>
    <style>
      html,
      body,
      #root {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: transparent !important;
      }

      body {
        color: #fff7f2;
        font-family: Consolas, Menlo, Monaco, monospace;
        user-select: none;
      }

      #root {
        position: relative;
      }

      .drag {
        -webkit-app-region: drag;
        position: absolute;
        inset: 0;
      }

      .panel {
        -webkit-app-region: no-drag;
        position: absolute;
        top: 20px;
        left: 20px;
        width: 430px;
        padding: 18px;
        border: 1px solid rgba(255, 179, 143, 0.5);
        background: rgba(10, 6, 8, 0.72);
        box-shadow: 0 24px 70px rgba(0, 0, 0, 0.42);
        backdrop-filter: blur(14px);
      }

      .panel.bare {
        width: auto;
        padding: 8px;
        border-color: rgba(255, 255, 255, 0.28);
        background: transparent !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
      }

      .panel.bare h1,
      .panel.bare p {
        display: none;
      }

      h1 {
        margin: 0 0 8px;
        font-size: 22px;
      }

      p {
        margin: 8px 0 16px;
        color: #d7aaa4;
      }

      .row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      button {
        border: 1px solid rgba(255, 179, 143, 0.38);
        background: rgba(17, 10, 13, 0.9);
        color: #fff7f2;
        cursor: pointer;
        font: inherit;
        padding: 8px 10px;
      }

      button:hover {
        border-color: rgba(255, 179, 143, 0.8);
      }

      .swatch {
        position: absolute;
        right: 40px;
        bottom: 40px;
        width: 280px;
        height: 280px;
        border: 1px solid rgba(255, 255, 255, 0.18);
      }

      .swatch.transparent {
        background:
          radial-gradient(circle at 40% 35%, rgba(255, 179, 143, 0.9), transparent 35%),
          radial-gradient(circle at 60% 65%, rgba(0, 255, 255, 0.55), transparent 34%),
          transparent;
      }

      .swatch.bare-alpha {
        border-color: transparent;
        background: transparent !important;
      }

      .swatch.green {
        background: #00ff00;
      }

      .swatch.magenta {
        background: #ff00ff;
      }

      .swatch.blue {
        background: #02040a;
      }

      canvas {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }

      .hidden {
        display: none;
      }
    </style>
  </head>
  <body>
    <div id="root">
      <div class="drag"></div>
      <canvas id="gl" class="hidden"></canvas>
      <div id="swatch" class="${bareStart ? 'swatch bare-alpha' : 'swatch transparent'}"></div>
      <section id="panel" class="${bareStart ? 'panel bare' : 'panel'}">
        <h1>Transparency Test</h1>
        <p>
          If Transparent shows the desktop through the window, Electron alpha works. If only WebGL
          is blue, the app render path is the issue. If everything is blue, it is Electron/GPU/window
          composition.
        </p>
        <div class="row">
          <button data-mode="transparent">Transparent</button>
          <button data-mode="bare-alpha">Bare Alpha</button>
          <button data-mode="green">Green</button>
          <button data-mode="magenta">Magenta</button>
          <button data-mode="blue">Blue</button>
          <button id="panel-toggle">Panel</button>
          <button id="webgl">WebGL alpha</button>
          <button id="close">Close</button>
        </div>
        <p id="status"></p>
      </section>
    </div>
    <script>
      const swatch = document.getElementById('swatch');
      const canvas = document.getElementById('gl');
      const status = document.getElementById('status');
      const panel = document.getElementById('panel');
      let raf = 0;

      function stopWebgl() {
        cancelAnimationFrame(raf);
        raf = 0;
        canvas.classList.add('hidden');
      }

      for (const button of document.querySelectorAll('[data-mode]')) {
        button.addEventListener('click', () => {
          stopWebgl();
          swatch.className = 'swatch ' + button.dataset.mode;
          status.textContent = 'Mode: ' + button.dataset.mode;
        });
      }

      document.getElementById('webgl').addEventListener('click', () => {
        swatch.className = 'swatch transparent';
        canvas.classList.remove('hidden');
        const gl = canvas.getContext('webgl', {
          alpha: true,
          antialias: true,
          premultipliedAlpha: false,
          preserveDrawingBuffer: false,
        });
        if (!gl) {
          status.textContent = 'WebGL unavailable.';
          return;
        }
        function frame(t) {
          canvas.width = window.innerWidth;
          canvas.height = window.innerHeight;
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.enable(gl.SCISSOR_TEST);
          const x = Math.floor((Math.sin(t / 500) * 0.5 + 0.5) * (canvas.width - 180));
          gl.scissor(x, Math.floor(canvas.height * 0.5) - 80, 180, 160);
          gl.clearColor(1, 0.7, 0.3, 0.82);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.disable(gl.SCISSOR_TEST);
          raf = requestAnimationFrame(frame);
        }
        status.textContent = 'Mode: WebGL alpha';
        frame(0);
      });

      document.getElementById('panel-toggle').addEventListener('click', () => {
        panel.classList.toggle('bare');
      });

      document.getElementById('close').addEventListener('click', () => {
        window.transparentTest?.close?.();
      });

      status.textContent = 'Mode: ${bareStart ? 'bare alpha' : 'transparent'}';
    </script>
  </body>
</html>`;
}

ipcMain.handle('transparent-test:close', () => {
  testWindow?.close();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.whenReady().then(createWindow);
