const AUTHORIZATION_SERVER = "https://logfire-us.pydantic.dev";
const GATEWAY = "https://gateway-us.pydantic.dev";
const RESOURCE = `${GATEWAY}/proxy`;
const SCOPE = "project:gateway_proxy";
const MODEL = "gpt-4.1";
const REDIRECT_URI = chrome.identity.getRedirectURL();
// ponytail: hard cut on page length, chunk + merge if long pages need full coverage
const MAX_PAGE_CHARS = 100_000;

chrome.runtime.onMessage.addListener(({ tabId }, _sender, sendResponse) => {
  summarize(tabId).then(
    (summary) => sendResponse({ summary }),
    (error) => sendResponse({ error: error.message }),
  );
  return true;
});

async function summarize(tabId) {
  const [{ result: text }] = await chrome.scripting
    .executeScript({
      target: { tabId },
      func: () => `${document.title}\n\n${document.body.innerText}`,
    })
    .catch(() => {
      throw new Error("Chrome doesn't allow extensions to read this page. Try a regular website.");
    });
  const response = await fetch(`${RESOURCE}/openai/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 200,
      messages: [
        {
          role: "system",
          content:
            "Summarize the web page the user sends in a single paragraph, written the way " +
            "Martin Fowler writes on martinfowler.com: thoughtful, conversational first person, " +
            "precise about terms, weighing tradeoffs, and candid about where an idea stops working. " +
            "Use Markdown inline: *italics* for a term being named, **bold** sparingly for the key " +
            "idea, `code` for code, names, and paths, and links when useful. No emoji. " +
            "Never use em dashes or en dashes. No headings, no lists, no preamble. " +
            "Be brief: at most 3 sentences and 70 words. Keep only the central point and why it matters.",
        },
        { role: "user", content: text.slice(0, MAX_PAGE_CHARS) },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Gateway ${response.status}: ${await response.text()}`);
  const { choices } = await response.json();
  return choices[0].message.content.replace(/\s*[—–]\s*/g, ", ");
}

async function accessToken() {
  const { accessToken, refreshToken, expiresAt, clientId } = await chrome.storage.local.get();
  if (accessToken && Date.now() < expiresAt) return accessToken;
  if (refreshToken) {
    try {
      return await requestToken({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
      });
    } catch {
      await chrome.storage.local.remove(["accessToken", "refreshToken", "expiresAt"]);
    }
  }
  return login();
}

async function login() {
  const clientId = await registeredClientId();
  const verifier = randomString();
  const state = randomString();
  const challenge = base64url(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  const url = new URL(`${AUTHORIZATION_SERVER}/api/oauth/authorize`);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    resource: RESOURCE,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  let redirect;
  try {
    redirect = await chrome.identity.launchWebAuthFlow({ url: url.href, interactive: true });
  } catch (error) {
    // Unused DCR clients are garbage-collected server side, so re-register next time.
    await chrome.storage.local.remove("clientId");
    throw error;
  }

  const params = new URL(redirect).searchParams;
  if (params.get("state") !== state) throw new Error("OAuth state mismatch");
  if (params.has("error")) throw new Error(params.get("error_description") ?? params.get("error"));
  if (params.get("iss") !== AUTHORIZATION_SERVER) throw new Error("OAuth issuer mismatch");

  return requestToken({
    grant_type: "authorization_code",
    code: params.get("code"),
    redirect_uri: REDIRECT_URI,
    client_id: clientId,
    code_verifier: verifier,
    resource: RESOURCE,
  });
}

async function registeredClientId() {
  const { clientId } = await chrome.storage.local.get("clientId");
  if (clientId) return clientId;
  const response = await fetch(`${AUTHORIZATION_SERVER}/api/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Summarize Page",
      redirect_uris: [REDIRECT_URI],
      grant_types: ["authorization_code", "refresh_token"],
      token_endpoint_auth_method: "none",
      scope: SCOPE,
    }),
  });
  if (!response.ok) throw new Error(`Registration ${response.status}: ${await response.text()}`);
  const { client_id } = await response.json();
  await chrome.storage.local.set({ clientId: client_id });
  return client_id;
}

async function requestToken(params) {
  const response = await fetch(`${AUTHORIZATION_SERVER}/api/oauth/token`, {
    method: "POST",
    body: new URLSearchParams(params),
  });
  if (!response.ok) throw new Error(`Token ${response.status}: ${await response.text()}`);
  const { access_token, refresh_token, expires_in } = await response.json();
  await chrome.storage.local.set({
    accessToken: access_token,
    refreshToken: refresh_token,
    expiresAt: Date.now() + (expires_in - 60) * 1000,
  });
  return access_token;
}

function randomString() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

function base64url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
