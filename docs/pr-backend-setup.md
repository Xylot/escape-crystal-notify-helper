# PR backend setup

## Provisioned on September 5, 2026

- Worker: https://crystal-pr.emmi.sh
- D1: `escape-crystal-pr`, bound as `DB`; initial migration applied.
- `TOKEN_ENCRYPTION_KEY`: generated securely and stored as a Worker secret.
- Production target: `Xylot/escape-crystal-notify`, branch `master`.
- OAuth secrets are configured. PR creation is enabled for `http://127.0.0.1:5174` and `https://crystal.emmi.sh`; `/config` reports `enabled: true`.
- Live OAuth sign-in was verified as Xylot. Same-tab sign-in is available when a popup is not visible.
- Live preparation successfully reads upstream and produces the Java diff, wiki links, and Shellbane cave PNG evidence. The wiki tile host returns HTTP 403 to the Worker but explicitly permits anonymous browser CORS requests. Evidence now downloads public tiles directly in the browser, falling back to the authenticated Worker endpoint if necessary. No GitHub or editor credentials are sent to tile hosts. Failed downloads still block submission.

## GitHub OAuth registration

The frontend domain is `crystal.emmi.sh`; the backend domain is `crystal-pr.emmi.sh`. Cloudflare DNS can point the frontend to GitHub Pages; the frontend does not need Cloudflare hosting.

To configure the frontend:

1. In `Xylot/escape-crystal-notify-helper`, set Settings → Pages → Source to **GitHub Actions**, then save **crystal.emmi.sh** as the custom domain.
2. In Settings → Secrets and variables → Actions → Variables, add the repository variable `VITE_PR_API_URL` with value `https://crystal-pr.emmi.sh`.
3. In Cloudflare DNS for `emmi.sh`, create a **CNAME** named **crystal**, targeting **xylot.github.io**, with **DNS only** (gray cloud). Remove any old Worker binding or conflicting DNS record for this frontend hostname. Keep the `crystal-pr.emmi.sh` Worker domain.
4. Push `main`, or run **Validate, refresh and publish** under Actions if the latest code is already pushed. Wait for both build and deploy to succeed.
5. Enable **Enforce HTTPS** in Pages when GitHub's certificate is ready.

The Worker already allows `https://crystal.emmi.sh`. Account-level Pages, Actions-variable, and DNS settings still need configuring. This Actions deployment does not require a `CNAME` file. Local drafts and login sessions do not transfer to the new origin; keep any needed proposal downloads before switching.

The OAuth homepage should then be `https://crystal.emmi.sh`, and its callback must be `https://crystal-pr.emmi.sh/auth/callback`.

Open https://github.com/settings/applications/new and enter:

| Field | Value |
| --- | --- |
| Application name | Escape Crystal Content Editor |
| Homepage URL | `http://127.0.0.1:5174/` for initial local testing |
| Authorization callback URL | `https://crystal-pr.emmi.sh/auth/callback` |

Device flow is not used. The application uses authorization-code flow with PKCE and requests `public_repo`. Expired authorization requires signing in again; refresh tokens are not retained.

After registration, copy the Client ID and generate a client secret. From this repository, run each command and paste the corresponding value at Wrangler's prompt. Do not paste secrets into chat, source files, or frontend environment variables.

```powershell
npx wrangler secret put GITHUB_CLIENT_ID --config worker/wrangler.jsonc
npx wrangler secret put GITHUB_CLIENT_SECRET --config worker/wrangler.jsonc
```

Keep the encryption key stable: changing it invalidates existing encrypted sessions. It is already configured and does not need regenerating.

## Local acceptance test, then Pages enablement

After the two OAuth values are installed, set `PR_ENABLED` to `true` in `worker/wrangler.jsonc`, retaining the local-only origin allowlist, and run `npm run worker:deploy`.

In a PowerShell terminal, start the editor with:

```powershell
$env:VITE_PR_API_URL = 'https://crystal-pr.emmi.sh'
npm run dev -- --port 5174
```

The user designated the main plugin repository for the live test. Use a real, reviewed boss change. Review the exact Java diff, every screenshot, plane, region/chunk ID, and wiki source before the final Create pull request action. Confirm that the resulting PR is ready for review, its code diff contains only the boss Java file, and its embedded images use immutable evidence commit URLs. Retry the same revision and confirm it returns the same PR. No live test PR has been created yet.

Before public enablement, complete desktop/mobile browser checks and the live single/batch submission checks. Add the actual Pages origin (scheme and hostname, no path) to `ALLOWED_ORIGINS`, update the OAuth homepage to the published editor URL, and redeploy the Worker. Add the helper repository Actions variable `VITE_PR_API_URL` with the Worker URL, then publish the helper through its normal Pages workflow. This variable is public; GitHub credentials belong only in Worker secrets.

## Development and validation

```sh
npm test
npm run build
npm run worker:check
npm run worker:migrate:local
npm run worker:dev
```

For local authentication, put local-only OAuth values and `TOKEN_ENCRYPTION_KEY` in ignored `worker/.dev.vars`; configure a local OAuth callback and explicit frontend origin. Do not copy production tokens into fixtures. `tests/pr-worker.test.mjs` uses real workerd/D1 execution with all GitHub and map requests mocked; it cannot create a remote PR.

For a new Cloudflare account, create D1 with `npx wrangler d1 create escape-crystal-pr`, replace its ID in the config, then apply migrations with `npx wrangler d1 migrations apply escape-crystal-pr --remote --config worker/wrangler.jsonc` before deployment. Generate an encryption secret with a cryptographically secure generator and supply it using `wrangler secret put`.

Sessions expire after eight hours; OAuth states expire after ten minutes and exchange tickets after one minute. Tokens are encrypted at rest, and the browser receives an opaque session credential. Signing out removes that session. Evidence is public in the contributor's fork and remains available while its evidence commits are retained. The Worker validates proposal structure; compilation and plugin checks are the target repository's responsibility.

If upstream changes, prepare and review again. Incomplete map images block submission. Failed fork creation or uploads can be retried; submission checkpoints and PR lookup prevent duplicate PR creation after uncertain responses. Setting `PR_ENABLED` back to `false` disables backend actions while preserving frontend exports.

References: [GitHub OAuth registration](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app), [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/).
