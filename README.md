# Summarize Page

A Chrome extension that summarizes the current page in a single short paragraph, using the
[Pydantic AI Gateway](https://ai.pydantic.dev/gateway/) for inference.

## Requirements

- Google Chrome, or another Chromium-based browser.
- A [Pydantic Logfire](https://logfire.pydantic.dev) account with a project that has the AI Gateway enabled.
- An OpenAI provider configured on that project's gateway, with access to `gpt-4.1`.

## Install

The extension is not on the Chrome Web Store. You load it from source.

```bash
git clone https://github.com/Kludex/summarize-chrome-extension.git
```

1. Open `chrome://extensions`.
2. Turn on **Developer mode** in the top right corner.
3. Click **Load unpacked** and select the `summarize-chrome-extension` folder.
4. Pin the extension from the puzzle icon in the toolbar, so the button is always visible.

To update, run `git pull` and click the reload icon on the extension's card in `chrome://extensions`.

## Use

Open any web page, click the extension icon, then click **Summarize this page**.

The first time, a Logfire window opens. Log in and pick the organization and project whose gateway you want to
use. The popup closes when that window opens, so click the button again after you approve.

> [!NOTE]
> **You only log in once.** The extension stores an OAuth refresh token and renews its access token automatically.
> You log in again only if the refresh token expires, after 90 days without use, or if you revoke it in Logfire.

> [!WARNING]
> **Some pages cannot be summarized.** Chrome does not let extensions read its own pages, such as `chrome://` URLs,
> the New Tab page, the Chrome Web Store, and the built-in PDF viewer.

## Configuration

Settings are constants at the top of `background.js`. Reload the extension after changing them.

| Constant | Default | Purpose |
| --- | --- | --- |
| `AUTHORIZATION_SERVER` | `https://logfire-us.pydantic.dev` | Logfire region you log in to. |
| `GATEWAY` | `https://gateway-us.pydantic.dev` | Gateway region used for inference. |
| `MODEL` | `gpt-4.1` | Model sent to the gateway's OpenAI route. |
| `MAX_PAGE_CHARS` | `100000` | Page text beyond this length is cut before summarizing, to bound cost. |

### EU region

If your Logfire account is in the EU, set:

```js
const AUTHORIZATION_SERVER = "https://logfire-eu.pydantic.dev";
const GATEWAY = "https://gateway-eu.pydantic.dev";
```

Then update `host_permissions` in `manifest.json` to match:

```json
"host_permissions": ["https://logfire-eu.pydantic.dev/*", "https://gateway-eu.pydantic.dev/*"]
```

The host permissions are required because the gateway does not send CORS headers. Chrome skips CORS only for hosts the
extension declares.
