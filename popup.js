const button = document.getElementById("summarize");
const output = document.getElementById("output");
const region = document.getElementById("region");
const model = document.getElementById("model");
const persona = document.getElementById("persona");

chrome.storage.local.get("settings").then(({ settings = {} }) => {
  region.value = settings.region ?? region.value;
  persona.value = settings.persona ?? "";
  loadModels(settings.model ?? "openai:gpt-4.1");
});

region.addEventListener("change", () => loadModels(model.value));

async function loadModels(selected) {
  model.replaceChildren(new Option("Loading models...", ""));
  output.textContent = "";
  const { result: routes, error } = await chrome.runtime.sendMessage({
    type: "models",
    region: region.value,
  });
  model.replaceChildren();
  if (error) {
    output.textContent = `Error: ${error}`;
    return;
  }
  for (const { route, models } of routes) {
    const group = document.createElement("optgroup");
    group.label = route;
    group.append(...models.map(({ id, name }) => new Option(name ?? id, `${route}:${id}`)));
    model.append(group);
  }
  model.value = selected;
  if (model.selectedIndex === -1) model.selectedIndex = 0;
}

button.addEventListener("click", async () => {
  if (!model.value) return;
  const settings = { region: region.value, model: model.value, persona: persona.value.trim() };
  await chrome.storage.local.set({ settings });
  button.disabled = true;
  output.textContent = "Summarizing...";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const { result, error } = await chrome.runtime.sendMessage({
    type: "summarize",
    tabId: tab.id,
    ...settings,
  });
  if (result) output.innerHTML = DOMPurify.sanitize(marked.parse(result));
  else output.textContent = `Error: ${error}`;
  button.disabled = false;
});
