import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import type { Logger } from "~clients/logger";
import streamArray from "stream-json/streamers/stream-array.js";
import unzipper from "unzipper";

import {
  OUTPUT_FILENAME,
  PRH_ZIP_URL,
  PROGRESS_LOG_INTERVAL,
} from "../constants";

type PrhPipelineOptions = {
  logger: Logger;
  outputDir: string;
};

type PipelineResult = {
  totalCompanies: number;
  outputPath: string;
};

export class PrhPipeline {
  private logger: Logger;
  private outputDir: string;

  constructor({ logger, outputDir }: PrhPipelineOptions) {
    this.logger = logger;
    this.outputDir = outputDir;
  }

  async run(): Promise<PipelineResult> {
    await fs.promises.mkdir(this.outputDir, { recursive: true });

    const outputPath = path.join(this.outputDir, OUTPUT_FILENAME);

    this.logger.info("Fetching ZIP from PRH...");
    const response = await fetch(PRH_ZIP_URL);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch: ${response.status} ${response.statusText}`
      );
    }
    if (!response.body) {
      throw new Error("Response body is null");
    }

    this.logger.info("Download started, streaming through pipeline...");

    const nodeStream = Readable.fromWeb(response.body as WebReadableStream);

    return new Promise<PipelineResult>((resolve, reject) => {
      const writeStream = fs.createWriteStream(outputPath);
      let isFirst = true;
      let count = 0;
      let errored = false;

      const onError = (err: Error) => {
        if (errored) {
          return;
        }
        errored = true;
        writeStream.destroy();
        reject(err);
      };

      writeStream.on("error", onError);

      writeStream.write("[\n");

      const unzipStream = nodeStream.pipe(unzipper.Parse());

      unzipStream.on("error", onError);

      unzipStream.on("entry", (entry: unzipper.Entry) => {
        const fileName = entry.path;
        if (!fileName.endsWith(".json")) {
          entry.autodrain();
          return;
        }

        this.logger.info("Processing entry", { fileName });

        // stream-json v2: withParserAsStream() returns a Duplex that
        // accepts raw text and emits {key, value} objects
        const jsonStream = entry.pipe(streamArray.withParserAsStream());

        jsonStream.on("error", onError);

        jsonStream.on(
          "data",
          ({ value }: { key: number; value: { names?: unknown[] } }) => {
            const names = value.names;
            if (!names || names.length === 0) {
              return;
            }

            const prefix = isFirst ? "" : ",\n";
            isFirst = false;

            const canContinue = writeStream.write(
              prefix + JSON.stringify(names)
            );
            count++;

            if (count % PROGRESS_LOG_INTERVAL === 0) {
              this.logger.info("Progress", {
                companiesProcessed: count.toLocaleString(),
              });
            }

            // Backpressure: pause source when write buffer is full
            if (!canContinue) {
              jsonStream.pause();
              writeStream.once("drain", () => jsonStream.resume());
            }
          }
        );

        jsonStream.on("end", () => {
          writeStream.write("\n]");
          writeStream.end(() => {
            this.logger.info("Done", {
              companiesProcessed: count.toLocaleString(),
            });
            resolve({ totalCompanies: count, outputPath });
          });
        });
      });
    });
  }
}
