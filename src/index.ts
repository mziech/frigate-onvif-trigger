import {createLogger} from "./logger";
import Camera from "./camera";
import {readFrigateConfigFromApi, readFrigateConfigFromFile} from "./config"
import Frigate from "./frigate";

const logger = createLogger("index");

(async function() {
    const frigate = new Frigate(process.env['FRIGATE_URL'] || "http://localhost:5000")
    await frigate.printVersion()

    const config = await readFrigateConfigFromFile() || await readFrigateConfigFromApi(frigate)
    if (!config.cameras) {
        logger.error("No cameras defined!")
        process.exit(1)
    }

    for (const [cameraName, camera] of Object.entries(config.cameras)) {
        if (camera.enabled === false) {
            logger.info(`Skipping camera ${cameraName}, not enabled`)
            continue
        }

        if (!camera.onvif || !camera.onvif.host) {
            logger.info(`Skipping camera ${cameraName}, not ONVIF configuration`)
            continue
        }

        logger.info(`Configuring camera ${cameraName}`);
        (await Camera.create(cameraName, camera)).listen(frigate)
    }
    logger.info("All cameras configured")
})().then(() => {
    logger.info("Finished")
}).catch(err => {
    logger.error("Failed", err)
})


