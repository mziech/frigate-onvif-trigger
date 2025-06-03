import * as yaml from "js-yaml";
import * as fs from "fs/promises";
import {createLogger} from "./logger";

const logger = createLogger("config");

export interface CameraConfig {
    enabled?: boolean,
    onvif?: {
        host?: string,
        port?: number,
        user?: string,
        password?: string,
        path?: string,
    }
}

export interface FrigateConfig {
    cameras?: Record<string, CameraConfig>
}

export async function readFrigateConfig(): Promise<FrigateConfig> {
    const filename = process.env["FRIGATE_CONFIG"] || "frigate.yml"
    logger.info("Reading Frigate configuration from " + filename)
    return yaml.load(await fs.readFile(filename, "utf-8"))
}
