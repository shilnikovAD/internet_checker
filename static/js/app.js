const startBtn = document.getElementById("startBtn");
const statusEl = document.getElementById("status");
const pingEl = document.getElementById("ping");
const downloadEl = document.getElementById("download");
const uploadEl = document.getElementById("upload");
const gaugeRing = document.querySelector(".gauge-ring");
const brandDot = document.querySelector(".brand-dot");

const DOWNLOAD_SIZE = 50 * 1024 * 1024;
const UPLOAD_SIZE = 50 * 1024 * 1024;
const GAUGE_MAX_MBPS = 500;
const GAUGE_MAX_DEG = 240;

const setStatus = (text) => (statusEl.textContent = text);
const formatMbps = (v) => v.toFixed(2);

function setGauge(speedMbps) {
  const deg = Math.min((speedMbps / GAUGE_MAX_MBPS) * GAUGE_MAX_DEG, GAUGE_MAX_DEG);
  const d = deg.toFixed(1);
  gaugeRing.style.background =
    `conic-gradient(#ffd54a 0deg, #ffd54a ${d}deg, #e9eef7 ${d}deg, #e9eef7 360deg)`;
}

function setTesting(active) {
  gaugeRing.classList.toggle("testing", active);
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
        setGauge(speed);
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

async function measureUpload(bytes) {
  const data = new Uint8Array(bytes);
  const chunk = 65536;
  for (let i = 0; i < data.length; i += chunk) {
    window.crypto.getRandomValues(data.subarray(i, i + chunk));
  }
  const start = performance.now();
  await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: data,
  });
  const elapsed = (performance.now() - start) / 1000;
  return ((bytes * 8) / elapsed) / 1_000_000;
}

async function runTest() {
  startBtn.disabled = true;
  pingEl.textContent = "-";
  downloadEl.textContent = "-";
  uploadEl.textContent = "-";
  setGauge(0);
  setTesting(true);

  try {
    setStatus("Измерение пинга…");
    const ping = await measurePing();
    pingEl.textContent = ping.toFixed(0);

    setStatus("Измерение скачивания…");
    const download = await measureDownload(DOWNLOAD_SIZE);
    downloadEl.textContent = formatMbps(download);
    setGauge(download);

    setStatus("Измерение загрузки…");
    const upload = await measureUpload(UPLOAD_SIZE);
    uploadEl.textContent = formatMbps(upload);

    setStatus("Готово");
  } catch (err) {
    console.error(err);
    setStatus("Ошибка теста. Попробуйте снова.");
    setGauge(0);
  } finally {
    startBtn.disabled = false;
    setTesting(false);
  }
}

setGauge(0);
startBtn.addEventListener("click", runTest);