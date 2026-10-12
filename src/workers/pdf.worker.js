// Runs core PDF operations off the main thread. All logic lives in runJob.js so it can be
// tested without a real Worker.
import { runJob } from './runJob.js';

self.onmessage = (event) => {
  runJob(event.data, (message, transfer = []) => self.postMessage(message, transfer));
};
