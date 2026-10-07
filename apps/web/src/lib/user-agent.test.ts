import assert from "node:assert/strict"
import { test } from "node:test"
import { parseUserAgent } from "./user-agent"

test("labels common browsers, systems and device classes", () => {
  const chromeMac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
  assert.deepEqual(parseUserAgent(chromeMac), { device: "desktop", browser: "Chrome", os: "macOS" })
  const edgeWin = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 Edg/126.0"
  assert.equal(parseUserAgent(edgeWin).browser, "Edge")
  const safariIphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
  assert.deepEqual(parseUserAgent(safariIphone), { device: "phone", browser: "Safari", os: "iOS" })
  assert.equal(parseUserAgent("Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0").browser, "Firefox")
  assert.deepEqual(parseUserAgent(null), { device: "desktop", browser: undefined, os: undefined })
})
