let deferredInstallPrompt = null;

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function updateInstallUi() {
  const section = document.getElementById("install-section");
  const installBtn = document.getElementById("install-app-btn");
  const iosHint = document.getElementById("install-ios-hint");
  const installedNote = document.getElementById("install-installed-note");
  if (!section) return;

  if (isStandalone()) {
    section.classList.remove("hidden");
    installBtn?.classList.add("hidden");
    iosHint?.classList.add("hidden");
    installedNote?.classList.remove("hidden");
    return;
  }

  installedNote?.classList.add("hidden");

  if (deferredInstallPrompt) {
    section.classList.remove("hidden");
    installBtn?.classList.remove("hidden");
    iosHint?.classList.add("hidden");
    return;
  }

  if (isIos()) {
    section.classList.remove("hidden");
    installBtn?.classList.add("hidden");
    iosHint?.classList.remove("hidden");
    return;
  }

  section.classList.remove("hidden");
  installBtn?.classList.add("hidden");
  iosHint?.classList.add("hidden");
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("./sw.js", { scope: "./" });
  } catch (err) {
    console.warn("Service worker registration failed:", err);
    return null;
  }
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  updateInstallUi();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  updateInstallUi();
  const toast = document.getElementById("toast");
  if (toast) {
    toast.textContent = "App installed on this device";
    toast.classList.remove("hidden");
    setTimeout(() => toast.classList.add("hidden"), 2200);
  }
});

document.getElementById("install-app-btn")?.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  updateInstallUi();
});

registerServiceWorker().then(() => updateInstallUi());
updateInstallUi();
