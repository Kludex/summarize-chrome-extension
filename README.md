# Summarize Page

A Chrome extension that summarizes the current page in a single short paragraph, using the
[Pydantic AI Gateway](https://ai.pydantic.dev/gateway/) for inference.

## Requirements

- Google Chrome, or another Chromium-based browser.
- A [Pydantic Logfire](https://logfire.pydantic.dev) account with a project that has the AI Gateway enabled.
- A provider configured on that project's gateway, such as OpenAI or Anthropic.

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

## Settings

The popup has three settings. They are saved when you click **Summarize this page**.

| Setting | Default | Purpose |
| --- | --- | --- |
| Region | US | Logfire and gateway region. Each region keeps its own login. |
| Model | `gpt-4.1` on the `openai` route | Model used for the summary, grouped by gateway route. |
| Persona | empty | Whose voice the summary is written in, e.g. `Martin Fowler`. Leave it empty for a neutral voice. |

The model list comes from the gateway's `/proxy/models` endpoint, so it shows only the providers configured on the
project you picked at login. Opening the popup before you have logged in starts the login.

> [!NOTE]
> **Google and Bedrock routes are hidden.** The extension calls the OpenAI chat completions API on every route, and
> those providers use a different API.
