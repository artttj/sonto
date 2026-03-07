const OFFSCREEN_URL = 'offscreen/offscreen.html';

let offscreenReady = false;

async function ensureOffscreen(): Promise<void> {
  if (offscreenReady) return;

  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  });

  if (contexts.length === 0) {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: [chrome.offscreen.Reason.DOM_SCRAPING],
      justification: 'Run local text embedding model (ONNX/WASM)',
    });
  }

  await pingUntilReady();
  offscreenReady = true;
}

function pingUntilReady(attempts = 20, delayMs = 300): Promise<void> {
  return new Promise((resolve, reject) => {
    let tries = 0;

    async function attempt() {
      tries++;
      try {
        const res = await chrome.runtime.sendMessage({ type: 'SONTO_PING' }) as { ok: boolean } | undefined;
        if (res?.ok) {
          resolve();
        } else {
          retry();
        }
      } catch {
        retry();
      }
    }

    function retry() {
      if (tries >= attempts) {
        reject(new Error('Offscreen document did not become ready in time'));
        return;
      }
      setTimeout(() => void attempt(), delayMs);
    }

    void attempt();
  });
}

export async function embed(text: string): Promise<number[]> {
  await ensureOffscreen();

  const response = await chrome.runtime.sendMessage({ type: 'SONTO_EMBED', text }) as
    | { ok: true; embedding: number[] }
    | { ok: false; error: string };

  if (!response.ok) throw new Error(response.error);
  return response.embedding;
}
