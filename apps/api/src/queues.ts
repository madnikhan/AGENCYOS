import { Queue } from "bullmq";
import IORedis from "ioredis";
import {
  QUEUE_NAMES,
  type GenerateJobData,
  type MediaJobData,
  type NotifyJobData,
  type PublishJobData,
} from "@seo/shared";
import { env } from "./config";

export const connection = new IORedis(env.redisUrl, {
  maxRetriesPerRequest: null,
});

export const generateQueue = new Queue<GenerateJobData>(QUEUE_NAMES.GENERATE, {
  connection,
});
export const publishQueue = new Queue<PublishJobData>(QUEUE_NAMES.PUBLISH, {
  connection,
});
export const mediaQueue = new Queue<MediaJobData>(QUEUE_NAMES.MEDIA, {
  connection,
});
export const notifyQueue = new Queue<NotifyJobData>(QUEUE_NAMES.NOTIFY, {
  connection,
});

export async function enqueueGenerate(data: GenerateJobData) {
  await generateQueue.add("generate-post", data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
  });
}

export async function enqueuePublish(data: PublishJobData, delayMs = 0) {
  await publishQueue.add("publish-post", data, {
    delay: delayMs,
    attempts: 5,
    backoff: { type: "exponential", delay: 5000 },
  });
}

export async function enqueueMedia(data: MediaJobData) {
  await mediaQueue.add("render-media", data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 3000 },
  });
}

export async function enqueueNotify(data: NotifyJobData) {
  await notifyQueue.add("notify", data, { attempts: 2 });
}
