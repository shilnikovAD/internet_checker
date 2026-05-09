const startBtn = document.getElementById("startBtn");
const statusEl = document.getElementById("status");
const pingEl = document.getElementById("ping");
const downloadEl = document.getElementById("download");
const uploadEl = document.getElementById("upload");
const downloadRing = document.querySelector('.gauge[data-kind="download"] .gauge-ring');
const uploadRing = document.querySelector('.gauge[data-kind="upload"] .gauge-ring');
const brandDot = document.querySelector(".brand-dot");

const DOWNLOAD_SIZE = 50 * 1024 * 1024;
const UPLOAD_SIZE = 50 * 1024 * 1024;
const GAUGE_MAX_MBPS = 500;
const GAUGE_MAX_DEG = 240;

const setStatus = (text) => (statusEl.textContent = text);
const formatMbps = (v) => v.toFixed(2);

function setGauge(ring, speedMbps) {
  const deg = Math.min((speedMbps / GAUGE_MAX_MBPS) * GAUGE_MAX_DEG, GAUGE_MAX_DEG);
  const d = deg.toFixed(1);
  ring.style.background =
    `conic-gradient(#ffd54a 0deg, #ffd54a ${d}deg, #e9eef7 ${d}deg, #e9eef7 360deg)`;
}

const setDownloadGauge = (s) => setGauge(downloadRing, s);
const setUploadGauge = (s) => setGauge(uploadRing, s);

function setTesting(active) {
  downloadRing.classList.toggle("testing", active);
  uploadRing.classList.toggle("testing", active);
  brandDot.classList.toggle("testing", active);
}

async function measurePing(rounds = 5) {
  let total = 0;
  for (let i = 0; i < rounds; i++) {
    const t0 = performance.now();
    await fetch(`/api/ping?ts=${Date.now()}`, { cache: "no-store" });
    total += performance.now() - t0;
  }
  return total / rounds;
}

async function measureDownload(bytes) {
  const response = await fetch(`/api/download?size=${bytes}&ts=${Date.now()}`, {
    cache: "no-store",
  });

  // Streaming path: show live speed while downloading
  if (response.body && response.body.getReader) {
    const reader = response.body.getReader();
    let received = 0;
    const start = performance.now();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      const elapsed = (performance.now() - start) / 1000;
      if (elapsed > 0.15) {
        const speed = ((received * 8) / elapsed) / 1_000_000;
        downloadEl.textContent = formatMbps(speed);
        setDownloadGauge(speed);
      }
    }

    const elapsed = (performance.now() - start) / 1000;
    return ((received * 8) / elapsed) / 1_000_000;
  }

  // Fallback for browsers without streaming support
  const start = performance.now();
  await response.arrayBuffer();
  const elapsed = (performance.now() - start) / 1000;
  return ((bytes * 8) / elapsed) / 1_000_000;
}

function measureUpload(bytes) {
  const data = new Uint8Array(bytes);
  const chunk = 65536;
  for (let i = 0; i < data.length; i += chunk) {
    window.crypto.getRandomValues(data.subarray(i, i + chunk));
  }

  // XHR is used instead of fetch because fetch() does not expose upload progress.
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const start = performance.now();

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const elapsed = (performance.now() - start) / 1000;
      if (elapsed > 0.15) {
        const speed = ((e.loaded * 8) / elapsed) / 1_000_000;
        uploadEl.textContent = formatMbps(speed);
        setUploadGauge(speed);
      }
    };
    xhr.onload = () => {
      const elapsed = (performance.now() - start) / 1000;
      resolve(((bytes * 8) / elapsed) / 1_000_000);
    };
    xhr.onerror = () => reject(new Error("upload failed"));
    xhr.onabort = () => reject(new Error("upload aborted"));

    xhr.open("POST", "/api/upload");
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.send(data);
  });
}

async function runTest() {
  startBtn.disabled = true;
  pingEl.textContent = "-";
  downloadEl.textContent = "-";
  uploadEl.textContent = "-";
  setDownloadGauge(0);
  setUploadGauge(0);
  setTesting(true);

  try {
    setStatus("Измерение пинга…");
    const ping = await measurePing();
    pingEl.textContent = ping.toFixed(0);

    setStatus("Измерение download…");
    const download = await measureDownload(DOWNLOAD_SIZE);
    downloadEl.textContent = formatMbps(download);
    setDownloadGauge(download);

    setStatus("Измерение upload…");
    const upload = await measureUpload(UPLOAD_SIZE);
    uploadEl.textContent = formatMbps(upload);
    setUploadGauge(upload);

    setStatus("Готово");
  } catch (err) {
    console.error(err);
    setStatus("Ошибка теста. Попробуйте снова.");
    setDownloadGauge(0);
    setUploadGauge(0);
  } finally {
    startBtn.disabled = false;
    setTesting(false);
  }
}

async function loadWhoami() {
  const root = document.getElementById("whoami");
  const ipEl = document.getElementById("whoamiIp");
  const ispEl = document.getElementById("whoamiIsp");
  const asEl = document.getElementById("whoamiAs");
  const geoEl = document.getElementById("whoamiGeo");

  try {
    const r = await fetch("/api/whoami", { cache: "no-store" });
    if (!r.ok) return;
    const d = await r.json();

    ipEl.textContent = d.ip || "—";

    if (d.private) {
      ispEl.textContent = "локальная сеть";
      asEl.textContent = "—";
      geoEl.textContent = "—";
      root.hidden = false;
      return;
    }

    ispEl.textContent = d.isp || d.org || "—";

    if (d.as_number) {
      const a = document.createElement("a");
      a.href = `https://bgp.he.net/AS${d.as_number}`;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = d.as || `AS${d.as_number}`;
      asEl.replaceChildren(a);
    } else {
      asEl.textContent = d.as || "—";
    }

    const geoParts = [d.city, d.country].filter(Boolean);
    geoEl.textContent = geoParts.length ? geoParts.join(", ") : "—";

    root.hidden = false;
  } catch (e) {
    console.error(e);
  }
}

setDownloadGauge(0);
setUploadGauge(0);
startBtn.addEventListener("click", runTest);
void loadWhoami();