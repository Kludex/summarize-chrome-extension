const button = document.getElementById("summarize");
const output = document.getElementById("output");
const fields = ["region", "model", "persona"].map((id) => document.getElementById(id));

chrome.storage.local.get("settings").then(({ settings = {} }) => {
  for (const field of fields) field.value = settings[field.id] ?? field.value;
});

button.addEventListener("click", async () => {
  const settings = Object.fromEntries(fields.map((field) => [field.id, field.value.trim()]));
  if (!settings.model) return;
  await chrome.storage.local.set({ settings });
  button.disabled = true;
  output.textContent = "Summarizing...";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const { summary, error } = await chrome.runtime.sendMessage({ tabId: tab.id, ...settings });
  if (summary) output.innerHTML = DOMPurify.sanitize(marked.parse(summary));
  else output.textContent = `Error: ${error}`;
  button.disabled = false;
});
