const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const exists = file => assert.ok(fs.statSync(path.join(root, file)).size > 0, file + " must not be empty");

test("existing client and owner portal, Square and database schema are retained", () => {
  assert.match(read("index.html"), /href="\/account\.html"/);
  assert.match(read("account.html"), /Payment methods/);
  assert.match(read("account.js"), /\/api\/account/);
  assert.match(read("account.js"), /\/api\/payment-methods/);
  for (const f of ["api/account.js", "api/payment-methods.js", "api/square-approved-checkout.js", "api/square-health.js", "lib/accounts.js", "db/portal.sql", "owner-square.html"]) exists(f);
});

test("homepage Rook Yard Duty promo and theme music are retained", () => {
  const html = read("index.html");
  assert.match(html, /rook-welcome\.mp4\?v=yard-duty/);
  assert.match(html, /rook-welcome-poster\.webp/);
  assert.match(html, /src="\/site-media\.js"/);
  assert.match(html, /talk-to-rook\.html/);
  assert.match(read("site-media.js"), /\/rook\/site-theme\.mp3/);
  for (const f of ["rook-welcome.mp4", "rook-welcome-poster.webp", "rook/site-theme.mp3", "rook/rook-portrait.webp", "site-media.css", "talk-to-rook.html"]) exists(f);
});

test("page-specific Rook video files and posters are retained", () => {
  for (const page of ["gutter-cleaning", "lawn-mowing-indianapolis", "mulch-installation-indianapolis", "leaf-cleanup", "spring-cleanup", "yard-cleanup-indianapolis"]) {
    exists("rook/" + page + ".mp4");
    exists("rook/" + page + ".webp");
  }
});

test("verified mowing matrix and initial-cut calculator rules are retained", () => {
  const html = read("index.html");
  for (const [size, single, weekly, alternate] of [["Small",50,40,50],["Medium",65,55,65],["Large",80,70,80]]) {
    assert.ok(html.includes('data-yard-rate="' + size + '" data-single="' + single + '" data-weekly="' + weekly + '" data-alternate="' + alternate + '"'));
  }
  assert.match(html, /data-estimate-add-on="35"/);
  assert.match(read("luxe.js"), /Number\(rates\.single\)/);
  assert.match(read("luxe.js"), /Number\(rates\.weekly\) \+ travel - 5/);
  assert.match(read("luxe.js"), /Number\(rates\.alternate\) \+ travel - 5/);
  exists("mulch-calculator.js");
});

test("account and voice-agent CSP exceptions are retained", () => {
  const config = JSON.parse(read("vercel.json"));
  const csp = route => config.headers.find(h=>h.source===route)?.headers.find(h=>h.key==="Content-Security-Policy")?.value;
  assert.match(csp("/account.html"), /https:\/\/web\.squarecdn\.com/);
  assert.match(csp("/talk-to-rook.html"), /elevenlabs\.io/);
});
