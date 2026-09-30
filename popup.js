const button = document.getElementById("summarize");
const output = document.getElementById("output");

button.addEventListener("click", async () => {
  button.disabled = true;
  output.textContent = "Summarizing...";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const { summary, error } = await chrome.runtime.sendMessage({ tabId: tab.id });
  if (summary) output.innerHTML = DOMPurify.sanitize(marked.parse(summary));
  else output.textContent = `Error: ${error}`;
  button.disabled = false;
});
