import * as yaml from "js-yaml";
import * as fs from "fs/promises";
import {createLogger} from "./logger";
import Frigate from "./frigate";

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

export async function readFrigateConfigFromFile(): Promise<FrigateConfig|undefined> {
    try {
        const filename = process.env["FRIGATE_CONFIG"] || "frigate.yml"
        logger.info("Reading Frigate configuration from " + filename)
        return yaml.load(await fs.readFile(filename, "utf-8")) as FrigateConfig
    } catch (e) {
        logger.info(`Could not read config file: ${e}`)
        return undefined
    }
}

export async function readFrigateConfigFromApi(frigate: Frigate): Promise<FrigateConfig> {
    logger.info("Reading Frigate configuration from API")
    return yaml.load(await frigate.getConfigYaml()) as FrigateConfig
}
