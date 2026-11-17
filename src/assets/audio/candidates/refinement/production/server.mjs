// Harness: serves repo + scratch files, runs a job page in headless Chrome,
// collects JSON results and WAV renders. Usage: node server.mjs <job.js> [outJson]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = "C:/Users/YOGA/Desktop/AQUADIVE-GIT";
const job = process.argv[2];
const outJson = process.argv[3] ?? path.join(HERE, "out", path.basename(job, ".js") + ".json");
const wavDir = path.join(HERE, "out", "wav");
fs.mkdirSync(wavDir, { recursive: true });
const browserExe = process.env.BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
};

function writeWav(file, sr, channels, bits = 24) {
  const n = channels[0].length,
    ch = channels.length,
    bps = bits / 8;
  const buf = Buffer.alloc(44 + n * ch * bps);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * ch * bps, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(ch, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * ch * bps, 28);
  buf.writeUInt16LE(ch * bps, 32);
  buf.writeUInt16LE(bits, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * ch * bps, 40);
  let o = 44,
    clipped = 0;
  const max = 2 ** (bits - 1) - 1;
  for (let i = 0; i < n; i++)
    for (let c = 0; c < ch; c++) {
      let v = channels[c][i];
      if (v > 1) {
        v = 1;
        clipped++;
      } else if (v < -1) {
        v = -1;
        clipped++;
      }
      // TPDF dither at 1 LSB
      const d = Math.random() - Math.random();
      let s = Math.round(v * max + d);
      s = Math.max(-max - 1, Math.min(max, s));
      if (bits === 24) {
        buf.writeIntLE(s, o, 3);
        o += 3;
      } else {
        buf.writeInt16LE(s, o);
        o += 2;
      }
    }
  fs.writeFileSync(file, buf);
  return clipped;
}

let child;
const results = [];
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (req.method === "POST") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      if (url.pathname === "/log") {
        console.log("[page]", body.toString());
        res.end("ok");
        return;
      }
      if (url.pathname === "/wav") {
        const name = url.searchParams.get("name"),
          sr = +url.searchParams.get("sr"),
          ch = +url.searchParams.get("ch");
        const f = new Float32Array(
          body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
        );
        const n = f.length / ch;
        const chans = [];
        for (let c = 0; c < ch; c++) chans.push(f.subarray(c * n, (c + 1) * n));
        const file = path.join(wavDir, name + ".wav");
        const clipped = writeWav(file, sr, chans, +(url.searchParams.get("bits") ?? 24));
        console.log(`wrote ${file} (${(n / sr).toFixed(3)} s, ${ch} ch, clipped ${clipped})`);
        res.end("ok");
        return;
      }
      if (url.pathname === "/done") {
        const data = JSON.parse(body.toString());
        fs.mkdirSync(path.dirname(outJson), { recursive: true });
        fs.writeFileSync(outJson, JSON.stringify(data, null, 2));
        console.log("result ->", outJson);
        res.end("ok");
        setTimeout(() => {
          try {
            child.kill();
          } catch {}
          server.close();
          process.exit(0);
        }, 200);
        return;
      }
      res.statusCode = 404;
      res.end();
    });
    return;
  }
  let file;
  if (url.pathname.startsWith("/repo/"))
    file = path.join(REPO, decodeURIComponent(url.pathname.slice(6)));
  else if (url.pathname === "/") file = path.join(HERE, "index.html");
  else file = path.join(HERE, decodeURIComponent(url.pathname.slice(1)));
  fs.readFile(file, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader("content-type", types[path.extname(file)] ?? "application/octet-stream");
    res.setHeader("cache-control", "no-store");
    res.end(data);
  });
});
server.listen(0, "127.0.0.1", () => {
  const port = server.address().port;
  const profile = path.join(HERE, "profile-" + port);
  child = spawn(
    browserExe,
    [
      "--headless=new",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--autoplay-policy=no-user-gesture-required",
      "--disable-gpu",
      `http://127.0.0.1:${port}/?job=${encodeURIComponent(job)}`,
    ],
    { stdio: "ignore" },
  );
  setTimeout(
    () => {
      console.error("TIMEOUT");
      try {
        child.kill();
      } catch {}
      process.exit(2);
    },
    +(process.env.TIMEOUT_MS ?? 300000),
  );
});
