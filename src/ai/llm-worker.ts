/**
 * Runs the language model off the main thread. Text generation is heavy enough to
 * freeze a phone's UI, so the model lives here and the page talks to it over
 * messages.
 */
import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

const handler = new WebWorkerMLCEngineHandler();

self.onmessage = (msg: MessageEvent) => {
  handler.onmessage(msg);
};
