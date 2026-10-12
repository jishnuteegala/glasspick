#!/usr/bin/env node
// gp-verify.mjs - zero-dependency CDP driver for GlassPick verification runs.
// Talks to an isolated headless Chrome over the DevTools protocol using Node's
// built-in WebSocket (Node >= 22.10). Never touches the user's browser profile.
//
// Usage:
//   node gp-verify.mjs doctor [--app <url>] [--cdp <port>]
//   node gp-verify.mjs chrome-start [--cdp <port>] [--profile <dir>] [--chrome <path>]
//   node gp-verify.mjs chrome-stop [--cdp <port>]
//   node gp-verify.mjs nav <url> [--cdp <port>]
//   node gp-verify.mjs wait <js-predicate> [--timeout <ms>] [--cdp <port>]
//   node gp-verify.mjs eval <js-expression> [--cdp <port>]
//   node gp-verify.mjs shot <outfile.png> [--cdp <port>]
//   node gp-verify.mjs sw-clear [--cdp <port>]   # clears SW + storage for the app origin
//
// Positional args (url, predicate, expression, outfile) must not start with "--".

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const cmd = args.shift();
const FLAG_NAMES = ["app", "cdp", "timeout", "profile", "chrome"];
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 || !args[i + 1] || args[i + 1].startsWith("--") ? dflt : args[i + 1];
};
// Positional args are non-flag tokens that are not a flag's value.
const pos = args.filter(
  (a, i) => !a.startsWith("--") && !FLAG_NAMES.includes(args[i - 1]?.slice(2))
);
const APP = flag("app", "http://127.0.0.1:4173");
const CDP = Number(flag("cdp", "9222"));
const CDP_HTTP = `http://127.0.0.1:${CDP}`;
const TIMEOUT = Number(flag("timeout", "15000"));

const fail = (msg) => {
  console.error(`gp-verify: ${msg}`);
  process.exit(1);
};

if (!Number.isFinite(CDP) || !Number.isFinite(TIMEOUT))
  fail("--cdp and --timeout must be numbers");

// --- minimal CDP client -------------------------------------------------------

async function browserWsUrl() {
  const res = await fetch(`${CDP_HTTP}/json/version`).catch(() => null);
  if (!res || !res.ok) fail(`no Chrome DevTools endpoint at ${CDP_HTTP}`);
  const body = await res.json().catch(() => null);
  if (!body?.webSocketDebuggerUrl) fail(`unexpected response from ${CDP_HTTP}/json/version`);
  return body.webSocketDebuggerUrl;
}

class Cdp {
  static async connect() {
    const url = await browserWsUrl();
    const ws = new WebSocket(url);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = () => rej(new Error("ws connect failed"));
    });
    const cdp = new Cdp();
    cdp.ws = ws;
    cdp.nextId = 1;
    cdp.pending = new Map();
    cdp.waiters = [];
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && cdp.pending.has(msg.id)) {
        const { res, rej } = cdp.pending.get(msg.id);
        cdp.pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
      } else {
        for (const w of [...cdp.waiters]) {
          if (w.method === msg.method && (!w.match || w.match(msg.params))) {
            cdp.waiters.splice(cdp.waiters.indexOf(w), 1);
            w.res(msg.params);
          }
        }
      }
    };
    // A dead socket must not leave senders/waiters hanging forever.
    ws.onclose = () => {
      for (const { rej } of cdp.pending.values()) rej(new Error("CDP connection closed"));
      cdp.pending.clear();
      for (const w of cdp.waiters.splice(0)) w.res(null);
    };
    ws.onerror = () => ws.close();
    return cdp;
  }
  send(method, params = {}, sessionId) {
    // ws.send on a closed socket silently discards - reject instead of hanging.
    if (this.ws.readyState !== WebSocket.OPEN)
      return Promise.reject(new Error("CDP connection closed"));
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
  once(method, match) {
    return new Promise((res) => this.waiters.push({ method, match, res }));
  }
  close() {
    this.ws.close();
  }
}

// Attach to the run's page target (first existing page, else a fresh one), so
// nav/wait/eval/shot all drive the SAME page across invocations.
async function page(cdp) {
  const { targetInfos } = await cdp.send("Target.getTargets");
  let targetId = targetInfos.find((t) => t.type === "page")?.targetId;
  if (!targetId)
    ({ targetId } = await cdp.send("Target.createTarget", { url: "about:blank" }));
  const { sessionId } = await cdp.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  return { sessionId, targetId };
}

async function evalIn(cdp, sessionId, expr) {
  const { result, exceptionDetails } = await cdp.send(
    "Runtime.evaluate",
    { expression: expr, returnByValue: true, awaitPromise: true },
    sessionId
  );
  if (exceptionDetails)
    fail(`page threw: ${exceptionDetails.text} ${exceptionDetails.exception?.description ?? ""}`);
  return result?.value;
}

// --- subcommands --------------------------------------------------------------

const commands = {
  async doctor() {
    let ok = true;
    const wsOk = typeof WebSocket === "function";
    console.log(`runtime: ${wsOk ? "WebSocket available" : "FAIL - Node >= 22.10 required"}`);
    ok &&= wsOk;
    const appRes = await fetch(APP, { redirect: "follow" }).catch(() => null);
    const appOk = appRes?.ok && (await appRes.text()).includes("GlassPick");
    console.log(`app ${APP}: ${appOk ? "200 + GlassPick marker" : "DOWN"}`);
    ok &&= !!appOk;
    const cdpRes = await fetch(`${CDP_HTTP}/json/version`).catch(() => null);
    const cdpVersion = cdpRes?.ok ? await cdpRes.json().catch(() => null) : null;
    console.log(`cdp ${CDP_HTTP}: ${cdpVersion?.Browser ?? "DOWN"}`);
    const cdpOk = !!cdpVersion?.Browser;
    ok &&= !!cdpOk;
    if (!ok) fail("doctor failed - instance not worth driving");
    console.log("doctor: OK");
  },

  async "chrome-start"() {
    const existing = await fetch(`${CDP_HTTP}/json/version`).catch(() => null);
    if (existing?.ok)
      fail(`CDP port ${CDP} already answers - chrome-stop it or pass --cdp <port>`);
    const profile = resolve(flag("profile", `.scratch/verify/chrome-profile-${Date.now()}`));
    const candidates = [
      flag("chrome"),
      process.env.GLASSPICK_VERIFY_CHROME,
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
      "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
      "chrome",
    ].filter(Boolean);
    let lastErr;
    for (const bin of candidates) {
      // Per-iteration flag: a late 'error' on a killed spawn must not leak
      // into the next candidate's poll.
      let err;
      try {
        const proc = spawn(
          bin,
          [
            "--headless=new",
            `--remote-debugging-port=${CDP}`,
            "--remote-allow-origins=*",
            `--user-data-dir=${profile}`,
            "--no-first-run",
            "--disable-extensions",
            "about:blank",
          ],
          { detached: true, stdio: "ignore" }
        );
        proc.unref();
        proc.on("error", (e) => {
          err = e;
        });
        const deadline = Date.now() + 10000;
        while (Date.now() < deadline && !err) {
          const res = await fetch(`${CDP_HTTP}/json/version`).catch(() => null);
          if (res?.ok) {
            console.log(`chrome ready on ${CDP} (profile ${profile})`);
            return;
          }
          await new Promise((r) => setTimeout(r, 250));
        }
        // Spawned but never opened the CDP port - don't leave it racing the
        // next candidate.
        if (!err) proc.kill();
        if (err) lastErr = err;
      } catch (e) {
        lastErr = e;
      }
    }
    fail(`chrome did not start: ${lastErr?.message ?? "unknown"}`);
  },

  async "chrome-stop"() {
    const cdp = await Cdp.connect();
    await cdp.send("Browser.close").catch(() => {});
    cdp.close();
    console.log("chrome stopped");
  },

  async nav() {
    const url = pos[0];
    if (!url) fail("nav requires a url");
    const cdp = await Cdp.connect();
    const { sessionId } = await page(cdp);
    // Hash-only changes are same-document navigations: no loadEventFired fires.
    // Race the load event against a short window, then always settle.
    const loaded = cdp.once("Page.loadEventFired");
    await cdp.send("Page.navigate", { url }, sessionId);
    await Promise.race([loaded, new Promise((r) => setTimeout(r, 1500))]);
    await new Promise((r) => setTimeout(r, 400)); // let React mount + fonts settle
    cdp.close();
    console.log(`navigated: ${url}`);
  },

  async wait() {
    const pred = pos[0];
    if (!pred) fail("wait requires a js predicate");
    const cdp = await Cdp.connect();
    const { sessionId } = await page(cdp);
    const deadline = Date.now() + TIMEOUT;
    while (Date.now() < deadline) {
      // A poll landing mid-navigation rejects - keep polling to the deadline.
      const hit = await evalIn(cdp, sessionId, `!!(${pred})`).catch(() => false);
      if (hit) {
        console.log("predicate true");
        cdp.close();
        return;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    cdp.close();
    fail(`predicate still false after ${TIMEOUT}ms: ${pred}`);
  },

  async eval() {
    const expr = pos[0];
    if (!expr) fail("eval requires an expression");
    const cdp = await Cdp.connect();
    const { sessionId } = await page(cdp);
    const value = await evalIn(cdp, sessionId, expr);
    console.log(JSON.stringify(value, null, 2));
    cdp.close();
  },

  async shot() {
    const out = pos[0];
    if (!out) fail("shot requires an output path");
    const cdp = await Cdp.connect();
    const { sessionId } = await page(cdp);
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png" }, sessionId);
    mkdirSync(dirname(resolve(out)), { recursive: true });
    writeFileSync(resolve(out), Buffer.from(data, "base64"));
    cdp.close();
    console.log(`saved: ${out}`);
  },

  async "sw-clear"() {
    let origin;
    try {
      origin = new URL(APP).origin;
    } catch {
      fail(`invalid --app url: ${APP}`);
    }
    const cdp = await Cdp.connect();
    await cdp.send("Storage.clearDataForOrigin", {
      origin,
      storageTypes: "all",
    });
    cdp.close();
    console.log(`storage + service workers cleared for ${origin}`);
  },
};

if (cmd && Object.hasOwn(commands, cmd)) await commands[cmd]();
else fail(`unknown command: ${cmd ?? "(none)"}`);
