// Run after configuring the host environment, or with:
// node --env-file=.env.local cmx/check-environment.mjs
const issues = [];
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
try {
  const parsed = new URL(url || "");
  if (parsed.protocol !== "https:")
    issues.push("Use an HTTPS Supabase project URL for deployment.");
  if (parsed.hostname.includes("YOUR_PROJECT_REF".toLowerCase()))
    issues.push("Replace the project URL placeholder.");
} catch {
  issues.push("Set VITE_SUPABASE_URL to your Supabase project URL.");
}
if (!key || key.includes("YOUR_SUPABASE")) {
  issues.push(
    "Set VITE_SUPABASE_ANON_KEY to the public publishable or legacy anon key.",
  );
} else if (key.startsWith("sb_secret_")) {
  issues.push(
    "A secret key must never be included in the frontend. Use the publishable key.",
  );
} else if (key.split(".").length === 3) {
  try {
    const payload = JSON.parse(
      Buffer.from(key.split(".")[1], "base64url").toString(),
    );
    if (payload.role !== "anon")
      issues.push("Use a legacy anon key, never a service-role or user token.");
  } catch {
    issues.push("The legacy key has an invalid JWT payload.");
  }
} else if (!key.startsWith("sb_publishable_")) {
  issues.push(
    "The public key must be a Supabase publishable key or legacy anon JWT.",
  );
}
if (issues.length) {
  console.error("CMX frontend configuration needs attention:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log(
    "Required frontend settings have the expected format. No network connection was tested.",
  );
  if (!process.env.VITE_FB_LOGIN_CONFIG_ID)
    console.log("Embedded Signup still requires VITE_FB_LOGIN_CONFIG_ID.");
}
