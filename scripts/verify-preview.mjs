import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const port = 4174
const baseUrl = `http://127.0.0.1:${port}`
const vite = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url))
const server = spawn(process.execPath, [vite, "preview", "--host", "127.0.0.1", "--port", String(port)], {
  stdio: "ignore",
})

async function fetchWithRetry(url) {
  let lastError
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      return await fetch(url)
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }
  throw lastError
}

try {
  const page = await fetchWithRetry(`${baseUrl}/design-system`)
  if (!page.ok) throw new Error(`Preview returned ${page.status} for /design-system`)
  const html = await page.text()
  const entry = html.match(/<script[^>]+src="([^"]+\.js)"/)
  if (!entry) throw new Error("Preview HTML did not include an entry bundle")
  const bundle = await fetch(new URL(entry[1], `${baseUrl}/`))
  if (!bundle.ok) throw new Error(`Preview returned ${bundle.status} for the entry bundle`)
  if (!(await bundle.text()).includes("The live token inventory and component reference for GlassPick.")) {
    throw new Error("Preview bundle did not include the design-system page")
  }
} finally {
  server.kill()
  await new Promise((resolve) => server.once("exit", resolve))
}
