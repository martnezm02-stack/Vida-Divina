// Fake stand-in for the REAL Hermes Desktop scripts/tiktok_bridge_search.py,
// used only in tests to exercise fetchTikTokViaMonidBridge's wiring
// (process spawn, arg-passing, exit-code/JSON-parse error paths) without
// needing a Python install or a live Monid connection in CI. Executed via
// `node <this file>` (options.pythonExecutable = process.execPath in the
// test) -- Node runs it as JS regardless of the .py extension, matching
// exactly what a real `python tiktok_bridge_search.py --keywords ...`
// invocation looks like from the caller's side (argv, stdout, exit code).
//
// The real script's actual real-data output shape (captured live via Monid,
// 2026-09-25, see hermes-agent/scripts/tiktok_bridge_search.py) is mirrored
// in ../realBridgeOutput.json and reused by mapBridgeItemToRawAd.test.ts.
const args = process.argv.slice(2);
function argVal(flag) {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

const keywords = argVal("--keywords") || "";

if (keywords.includes("trigger-error")) {
  process.stderr.write("simulated Monid failure\n");
  process.exit(1);
}
if (keywords.includes("trigger-badjson")) {
  process.stdout.write("not json{{{");
  process.exit(0);
}
if (keywords.includes("trigger-empty")) {
  process.stdout.write(JSON.stringify([]));
  process.exit(0);
}

process.stdout.write(
  JSON.stringify([
    {
      source: "tiktok",
      external_id: "fake-1",
      canonical_url: "https://www.tiktok.com/@fakeuser/video/fake-1",
      actor: {
        external_id: "channel-1",
        handle: "fakeuser",
        display_name: "Fake User",
        profile_url: "https://www.tiktok.com/@fakeuser",
      },
      published_at: "2026-09-20T00:00:00.000Z",
      text: "contenido de prueba",
      metrics: { views: 100, likes: 10, comments: 1, shares: 0, saves: 2, captured_at: "2026-09-25T00:00:00.000Z" },
      media: {
        kind: "video",
        url: "https://cdn.example.com/fake-1.mp4",
        thumbnail_url: "https://cdn.example.com/fake-1.jpg",
        width: 720,
        height: 1280,
        duration_seconds: 12,
      },
      source_metadata: { platform: "tiktok", provider: "monid", endpoint: "/apidojo/tiktok-scraper", hashtags: ["vidadivina"], language: "es" },
      provenance: {
        acquired_via: "monid",
        keywords: keywords.split(","),
        date_range: argVal("--date-range") || "THIS_MONTH",
        sort: argVal("--sort") || "MOST_LIKED",
        location: argVal("--location") || null,
        fetched_at: "2026-09-25T00:00:00.000Z",
      },
    },
  ])
);
process.exit(0);
