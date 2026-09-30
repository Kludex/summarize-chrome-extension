const REGIONS = {
  us: { authorizationServer: "https://logfire-us.pydantic.dev", gateway: "https://gateway-us.pydantic.dev" },
  eu: { authorizationServer: "https://logfire-eu.pydantic.dev", gateway: "https://gateway-eu.pydantic.dev" },
};
const SCOPE = "project:gateway_proxy";
const REDIRECT_URI = chrome.identity.getRedirectURL();
// ponytail: hard cut on page length, chunk + merge if long pages need full coverage
const MAX_PAGE_CHARS = 100_000;

// These gateway providers don't speak the OpenAI chat completions API.
const NON_CHAT_PROVIDERS = new Set(["google-vertex", "google-gla", "bedrock"]);

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  const handler = request.type === "models" ? listModels : summarize;
  handler(request).then(
    (result) => sendResponse({ result }),
    (error) => sendResponse({ error: error.message }),
  );
  return true;
});

async function listModels({ region }) {
  const response = await fetch(`${REGIONS[region].gateway}/proxy/models`, {
    headers: { Authorization: `Bearer ${await accessToken(region)}` },
  });
  if (!response.ok) throw new Error(`Gateway ${response.status}: ${await response.text()}`);
  const routes = await response.json();
  return routes.filter(({ provider, models }) => !NON_CHAT_PROVIDERS.has(provider) && models.length);
}

async function summarize({ tabId, region, model, persona }) {
  const [{ result: text }] = await chrome.scripting
    .executeScript({
      target: { tabId },
      func: () => `${document.title}\n\n${document.body.innerText}`,
    })
    .catch(() => {
      throw new Error("Chrome doesn't allow extensions to read this page. Try a regular website.");
    });
  const separator = model.indexOf(":");
  const [route, modelName] = [model.slice(0, separator), model.slice(separator + 1)];
  const voice = persona ? `, written the way ${persona} would write it` : "";
  const response = await fetch(`${REGIONS[region].gateway}/proxy/${route}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await accessToken(region)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelName,
      max_tokens: 200,
      messages: [
        {
          role: "system",
          content:
            `Summarize the web page the user sends in a single paragraph${voice}. ` +
            "Use Markdown inline: **bold** sparingly for the key idea, `code` for code, names, " +
            "and paths, and links when useful. Never use em dashes or en dashes. " +
            "No headings, no lists, no preamble. " +
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

async function accessToken(region) {
  const { accessToken, refreshToken, expiresAt, clientId } = await loadAuth(region);
  if (accessToken && Date.now() < expiresAt) return accessToken;
  if (refreshToken) {
    try {
      return await requestToken(region, {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
      });
    } catch {
      await saveAuth(region, { accessToken: null, refreshToken: null });
    }
  }
  return login(region);
}

async function login(region) {
  const { authorizationServer, gateway } = REGIONS[region];
  const clientId = await registeredClientId(region);
  const verifier = randomString();
  const state = randomString();
  const challenge = base64url(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  const url = new URL(`${authorizationServer}/api/oauth/authorize`);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    resource: `${gateway}/proxy`,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  let redirect;
  try {
    redirect = await chrome.identity.launchWebAuthFlow({ url: url.href, interactive: true });
  } catch (error) {
    // Unused DCR clients are garbage-collected server side, so re-register next time.
    await saveAuth(region, { clientId: null });
    throw error;
  }

  const params = new URL(redirect).searchParams;
  if (params.get("state") !== state) throw new Error("OAuth state mismatch");
  if (params.has("error")) throw new Error(params.get("error_description") ?? params.get("error"));
  if (params.get("iss") !== authorizationServer) throw new Error("OAuth issuer mismatch");

  return requestToken(region, {
    grant_type: "authorization_code",
    code: params.get("code"),
    redirect_uri: REDIRECT_URI,
    client_id: clientId,
    code_verifier: verifier,
    resource: `${gateway}/proxy`,
  });
}

async function registeredClientId(region) {
  const { clientId } = await loadAuth(region);
  if (clientId) return clientId;
  const response = await fetch(`${REGIONS[region].authorizationServer}/api/oauth/register`, {
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
  await saveAuth(region, { clientId: client_id });
  return client_id;
}

async function requestToken(region, params) {
  const response = await fetch(`${REGIONS[region].authorizationServer}/api/oauth/token`, {
    method: "POST",
    body: new URLSearchParams(params),
  });
  if (!response.ok) throw new Error(`Token ${response.status}: ${await response.text()}`);
  const { access_token, refresh_token, expires_in } = await response.json();
  await saveAuth(region, {
    accessToken: access_token,
    refreshToken: refresh_token,
    expiresAt: Date.now() + (expires_in - 60) * 1000,
  });
  return access_token;
}

async function loadAuth(region) {
  return (await chrome.storage.local.get(region))[region] ?? {};
}

async function saveAuth(region, changes) {
  await chrome.storage.local.set({ [region]: { ...(await loadAuth(region)), ...changes } });
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
