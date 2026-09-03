---
name: testing-booqableapps
description: How to test the production VibeSDK deployment at https://booqableapps.com (auth, logs, model config pitfalls)
---

# Testing booqableapps.com (VibeSDK production)

## Auth
- Auth is plain email + password (NOT OTP). Registration marks emails verified immediately (worker/database/services/AuthService.ts). Any made-up email works unless ALLOWED_EMAIL is set as a worker var.
- Sign In button (top right) -> "Don't have an account? Sign up".
- Auth requires the JWT_SECRET worker secret. If register/login fails with a generic "Failed to register user", check logs — it may be "JWT_SECRET not configured". Fix: `openssl rand -base64 48 | npx wrangler secret put JWT_SECRET --name vibesdk-production` (must contain 3+ character types; plain hex is rejected) and keep the same value in `.prod.vars` so `bun run deploy` re-uploads it.

## Observing server errors
- UI error messages are generic; tail production logs:
  - Wrangler needs Node >= 22: `nvm use 22` (system node is 20).
  - `set -a; source .prod.vars; set +a` to get CLOUDFLARE_API_TOKEN, then `npx wrangler tail vibesdk-production --format pretty`.
- The in-app Debug Console (bug icon, bottom right of chat) shows WebSocket messages and errors.

## Model config pitfalls
- The default chat flow uses `behaviorType=think` (ThinkAgent), whose model is HARDCODED as `google-ai-studio/gemini-3.6-flash` in `worker/agents/think/model-config.ts` — it ignores AGENT_CONFIG in `worker/agents/inferutils/config.ts`. If only OpenAI is configured, the agent replies "❌ Payment Required" (AI_APICallError from AI Gateway).
- AGENT_CONFIG only applies to the non-think CodeGeneratorAgent path; PLATFORM_MODEL_PROVIDERS env var switches between PLATFORM and DEFAULT configs.

## Generation flow (what "working" looks like)
- Submitting a prompt opens `/chat/<id>`; the ThinkAgent typically first streams clarifying questions with an interactive question wizard (radio options + Next/Submit). Answer or "Skip all" to start implementation.
- On success the chat shows "Loaded skill cloudflare-bundler-apps", "Wrote N files" (expandable list), "Deployed" (this is the internal Space preview deploy, not WfP), and the app renders interactively in the right-hand preview pane (iframe). Typing into the preview iframe may need OS-level input (`xdotool type`) after clicking the field.
- Provider errors surface inline as "❌ ..." chat messages (e.g. Payment Required, Incorrect API key). The Worker `OPENAI_API_KEY` secret must be a real OpenAI `sk-...` key.

## Preview vs Deploy (Workers for Platforms)
- The live preview pane works WITHOUT Workers for Platforms (it uses Worker Loader / Dynamic Workers via SpaceDO).
- The top-right "Deploy" button requires WfP; without it, the Debug Console shows `cloudflare_deployment_error` with `DISPATCH_NAMESPACE not found in environment variables` and an "Deployment Failed - State Reset" error. This is expected degradation, not a generation bug.
- With WfP enabled, Deploy takes ~5s; the header buttons change to "View Live" + "Redeploy" and the tail logs `Deployment completed` with `deploymentUrl: https://<project-name>.booqableapps.com`. A successful dispatch response has header `x-preview-type: dispatcher`.
- PITFALL: freshly deployed apps default to **Private**, and private deployed URLs are gated at the dispatch layer (worker/index.ts) behind an owner-preview token. In the chat header, "View Live" may open the bare URL WITHOUT the token (no `/api/apps/<id>/preview-token` call is made), yielding a 404 "This application is not currently available." Workaround: click "Make public" first, then the permanent URL serves for everyone. If you see that 404, check visibility before assuming the deploy failed.

## Devin Secrets Needed
- None specific; production credentials come from `/home/ubuntu/repos/vibesdk/.prod.vars` (CLOUDFLARE_API_TOKEN etc.).
